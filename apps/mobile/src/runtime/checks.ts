/**
 * What the phone can do, and how fast it does the parts that are on every request.
 *
 * `@chipschat/core` and `@chipschat/tunnel` were written for a browser and assume a handful of globals.
 * Expo is expected to provide all of them; "expected" is not a thing to find out from a bug
 * report, so the first run asserts each one by name and the Runtime screen shows the answers.
 *
 * The timings matter more. Every signed request costs one Ed25519 signature and every relay
 * frame costs an AES-GCM seal. On an iPhone both are the phone's own once `install.ts` has handed
 * them over (ADRs 0152, 0277), and JavaScript elsewhere (ADR 0044); `crypto.subtle` here is
 * whichever is installed. The plan's threshold: under about 50 ms a signature is fine, over about
 * 150 ms and a native module moves up the list. Nothing on this Mac can answer that — only a
 * real phone can — so this produces the number rather than an opinion.
 *
 * Everything here runs under Node too, which is how it is tested without a phone.
 */

export interface Check {
  readonly name: string;
  readonly ok: boolean;
  readonly note?: string | undefined;
}

export interface Timing {
  readonly name: string;
  readonly ms: number;
  readonly note?: string | undefined;
}

const ROUNDS = 10;
const MEGABYTE = 1024 * 1024;

/** Why it failed, in the words the runtime used, and something legible when it used none. */
export function because(error: unknown): string {
  return error instanceof Error ? error.message : "threw";
}

function check(name: string, test: () => boolean): Check {
  try {
    return { name, ok: test(), note: undefined };
  } catch (error) {
    // A missing global throws rather than answering false, and the screen must say which one.
    return { name, ok: false, note: because(error) };
  }
}

/** Every global the shared packages reach for, asserted by use rather than by `typeof`. */
export function capabilities(): readonly Check[] {
  return [
    check("crypto.subtle", () => typeof crypto.subtle.generateKey === "function"),
    check("crypto.randomUUID", () => crypto.randomUUID().length === 36),
    check("TextEncoder / TextDecoder", () => {
      const bytes = new TextEncoder().encode("ok");
      return new TextDecoder().decode(bytes) === "ok";
    }),
    check("btoa / atob", () => atob(btoa("ok")) === "ok"),
    check("URL with a base", () =>
      new URL("/v1/events", "http://a.b:4431").href.endsWith("/v1/events"),
    ),
    check(
      "URLSearchParams.get",
      () => new URLSearchParams("pair=ABC-234").get("pair") === "ABC-234",
    ),
    check("WebSocket", () => typeof WebSocket === "function"),
    check("requestAnimationFrame", () => typeof requestAnimationFrame === "function"),
    check("BigInt", () => BigInt(2) ** BigInt(64) > BigInt(0)),
    check("structuredClone", () => typeof structuredClone === "function"),
  ];
}

/** `Response` built from bytes, which is how the relay link answers a request it tunnelled. */
export async function responseFromBytes(): Promise<Check> {
  try {
    const body = new TextEncoder().encode(JSON.stringify({ ok: true }));
    const answer = new Response(body, { status: 200, headers: { "content-type": "text/json" } });
    const read = (await answer.json()) as { ok?: boolean };
    return { name: "Response from bytes, then .json()", ok: read.ok === true, note: undefined };
  } catch (error) {
    return { name: "Response from bytes, then .json()", ok: false, note: because(error) };
  }
}

async function time(name: string, rounds: number, run: () => Promise<unknown>): Promise<Timing> {
  const began = Date.now();
  for (let round = 0; round < rounds; round++) await run();
  const each = (Date.now() - began) / rounds;
  return { name, ms: Math.round(each * 100) / 100, note: undefined };
}

/** The costs that are on every request, every frame, and every replay. */
export async function timings(): Promise<readonly Timing[]> {
  const subtle = crypto.subtle;
  const message = new Uint8Array(64).fill(7);
  const megabyte = new Uint8Array(MEGABYTE).fill(3);

  const signing = (await subtle.generateKey({ name: "Ed25519" }, false, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const signature = await subtle.sign({ name: "Ed25519" }, signing.privateKey, message);

  const mine = (await subtle.generateKey({ name: "X25519" }, false, [
    "deriveBits",
  ])) as CryptoKeyPair;
  const theirs = (await subtle.generateKey({ name: "X25519" }, true, [
    "deriveBits",
  ])) as CryptoKeyPair;

  const aes = await subtle.importKey(
    "raw",
    new Uint8Array(32).fill(9),
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = new Uint8Array(12).fill(1);

  return [
    await time("Ed25519 sign", ROUNDS, () =>
      subtle.sign({ name: "Ed25519" }, signing.privateKey, message),
    ),
    await time("Ed25519 verify", ROUNDS, () =>
      subtle.verify({ name: "Ed25519" }, signing.publicKey, signature, message),
    ),
    await time("X25519 derive", ROUNDS, () =>
      subtle.deriveBits({ name: "X25519", public: theirs.publicKey }, mine.privateKey, 256),
    ),
    await time("SHA-256, 1 MB", 3, () => subtle.digest("SHA-256", megabyte)),
    await time("AES-GCM seal, 1 MB", 3, () =>
      subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, aes, megabyte),
    ),
  ];
}
