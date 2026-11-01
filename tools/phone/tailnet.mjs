/**
 * What the tailnet says this Mac is, apart from asking it: the name Tailscale gives the machine now,
 * and whether Tailscale Serve still answers at a name the machine no longer has. Pure, so it is
 * tested (`tools/guardrails/phone-tailnet.test.ts`) without Tailscale.
 *
 * Why it exists: on 14 September 2026 the Mac mini was renamed on the tailnet, from
 * `adas-mac-mini` to `ada-mac-mini`. The old name stopped resolving, Serve kept answering (and
 * its certificate kept naming) only the old one, and the server went on advertising it. Every
 * phone paired to it reached nothing — photo tiles drawn blank from the phone's cache, voice notes
 * failing with "a server with the specified hostname could not be found" — while `pnpm phone
 * doctor` said the server was fine, because it compared the advertised address with Serve's
 * stale name rather than with the machine's.
 */

/** This machine's name on the tailnet, `ada-mac-mini.tail2f9c1e.ts.net`, from `tailscale status --json`. */
export function machineDnsName(statusJson) {
  try {
    const name = JSON.parse(statusJson)?.Self?.DNSName;
    return typeof name === "string" && name !== "" ? name.replace(/\.$/, "") : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Serve answering at a name this machine no longer has: `{ served, current, oldHost }`, or nothing
 * when the names agree, or when either is unknown (no Serve, or Tailscale not running).
 */
export function staleServeName(servedUrl, dnsName) {
  if (servedUrl === undefined || dnsName === undefined) return undefined;
  const served = new URL(servedUrl).hostname;
  if (served === dnsName) return undefined;
  return { served, current: dnsName, oldHost: served.split(".")[0] };
}
