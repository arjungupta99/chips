/**
 * The fake Chips' join requests (ADR 0122), so a connector's `join()` can be tested without a
 * server: the three doors with no credential, as the real ones answer, and the person's side as
 * calls the kit makes — a link made, a request allowed or refused.
 *
 * Whatever joins is handed the fake's one harness: its id, its token and its direct room. The
 * rules the server keeps are kept where a connector would notice them: a request redeems once, a
 * refused one says so, a wrong secret is a bare `401`, and a person grants only what was asked.
 */

import { GRANTABLE } from "@chipschat/protocol";
import type { ChipsAddress } from "./subject.js";

export interface JoinAnswer {
  readonly status: number;
  readonly body: unknown;
}

interface FakeJoin {
  readonly id: string;
  readonly secret: string;
  readonly code: string;
  readonly startedBy: "requester" | "person";
  readonly wants: readonly string[];
  name: string;
  state: "waiting" | "allowed" | "denied" | "redeemed";
  capabilities: readonly string[];
}

/** A request as the kit's own tests read it. */
export interface FakeJoinView {
  readonly requestId: string;
  readonly code: string;
  readonly name: string;
  readonly state: FakeJoin["state"];
  readonly wants: readonly string[];
  readonly capabilities: readonly string[];
}

const refusal = (status: number, code: string, refused: string, message: string): JoinAnswer => ({
  status,
  body: { error: { code, message, request_id: "conformance", refusal: refused } },
});

const UNKNOWN: JoinAnswer = {
  status: 401,
  body: {
    error: {
      code: "unauthorized",
      message: "That join request is not valid.",
      request_id: "conformance",
    },
  },
};

function random(size: number): string {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64url");
}

function code(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const letters = [...bytes].map((byte) => alphabet.charAt(byte % alphabet.length)).join("");
  return `${letters.slice(0, 3)}-${letters.slice(3)}`;
}

function textOf(body: unknown, field: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = (body as Record<string, unknown>)[field];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function namesOf(body: unknown, field: string): string[] {
  if (typeof body !== "object" || body === null) return [];
  const value = (body as Record<string, unknown>)[field];
  return Array.isArray(value)
    ? value.filter((each): each is string => typeof each === "string")
    : [];
}

export class FakeJoins {
  private readonly requests = new Map<string, FakeJoin>();
  private next = 0;

  constructor(private readonly address: () => ChipsAddress) {}

  /** The answer to one of the three doors, or nothing when it is not one of them. */
  answer(method: string, path: string, body: unknown): JoinAnswer | undefined {
    if (method !== "POST") return undefined;
    if (path === "/v1/join") return this.ask(body);
    if (path === "/v1/join/redeem") return this.redeemLink(body);
    const poll = /^\/v1\/join\/([^/]+)\/redeem$/.exec(path);
    return poll === null ? undefined : this.poll(poll[1] ?? "", body);
  }

  /** A link the owner made, allowed already with what it may do. */
  makeLink(capabilities: readonly string[] = ["autonomy"]): string {
    const request = this.add("person", [], capabilities);
    request.state = "allowed";
    return `${this.address().url}/j/${request.secret}`;
  }

  /** The owner allows the oldest request waiting, with what they grant of what it asked. */
  allow(capabilities?: readonly string[]): FakeJoinView {
    const request = this.waiting();
    request.capabilities = (capabilities ?? request.wants).filter((each) =>
      request.wants.includes(each),
    );
    request.state = "allowed";
    return viewOf(request);
  }

  /** The owner refuses the oldest request waiting. */
  deny(): FakeJoinView {
    const request = this.waiting();
    request.state = "denied";
    return viewOf(request);
  }

  list(): FakeJoinView[] {
    return [...this.requests.values()].map(viewOf);
  }

  private waiting(): FakeJoin {
    const request = [...this.requests.values()].find((each) => each.state === "waiting");
    if (request === undefined) throw new Error("Nothing is asking to join.");
    return request;
  }

  private add(
    startedBy: FakeJoin["startedBy"],
    wants: readonly string[],
    capabilities: readonly string[],
  ): FakeJoin {
    this.next += 1;
    const request: FakeJoin = {
      id: `jrq_01K4ZQPX${String(this.next).padStart(18, "0")}`,
      secret: `chips_j_${random(24)}`,
      code: code(),
      startedBy,
      wants,
      name: "",
      state: "waiting",
      capabilities,
    };
    this.requests.set(request.id, request);
    return request;
  }

  private ask(body: unknown): JoinAnswer {
    const name = textOf(body, "name");
    if (name === undefined) {
      return refusal(422, "invalid_event", "invalid", "Say what it is called.");
    }
    const wants = namesOf(body, "wants").filter((each) => GRANTABLE.includes(each));
    const request = this.add("requester", wants, []);
    request.name = name;
    return {
      status: 201,
      body: {
        request_id: request.id,
        secret: request.secret,
        code: request.code,
        expires_in: 600,
        interval: 1,
      },
    };
  }

  private poll(id: string, body: unknown): JoinAnswer {
    const request = this.requests.get(id);
    if (request === undefined || textOf(body, "secret") !== request.secret) return UNKNOWN;
    if (request.state === "waiting")
      return { status: 202, body: { state: "waiting", interval: 1 } };
    return this.spend(request);
  }

  private redeemLink(body: unknown): JoinAnswer {
    const secret = textOf(body, "secret");
    const request = [...this.requests.values()].find(
      (each) => each.secret === secret && each.startedBy === "person",
    );
    if (request === undefined) return UNKNOWN;
    const name = textOf(body, "name");
    if (name === undefined)
      return refusal(422, "invalid_event", "invalid", "Say what it is called.");
    request.name = name;
    return this.spend(request);
  }

  private spend(request: FakeJoin): JoinAnswer {
    if (request.state === "denied") return refusal(403, "forbidden", "denied", "A person said no.");
    if (request.state === "redeemed") {
      return refusal(403, "forbidden", "spent", "It was used already. Ask for a new one.");
    }
    request.state = "redeemed";
    const address = this.address();
    return {
      status: 200,
      body: {
        kind: "harness",
        url: address.url,
        harness_id: address.harnessId,
        token: address.token,
        space_id: address.spaceId,
        capabilities: [...request.capabilities],
      },
    };
  }
}

function viewOf(request: FakeJoin): FakeJoinView {
  return {
    requestId: request.id,
    code: request.code,
    name: request.name,
    state: request.state,
    wants: [...request.wants],
    capabilities: [...request.capabilities],
  };
}
