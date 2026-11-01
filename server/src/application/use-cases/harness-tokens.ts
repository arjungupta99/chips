/**
 * A harness's tokens: list them, issue another, withdraw one (ADR 0023, and condition 2 of the
 * Phase 1 review).
 *
 * Adding a harness hands over a token once and Chips keeps only its digest, so there has never
 * been a way to take one back — the column and the check have been there since M0.3, and
 * nothing set it. These three make the column reachable, to the one person the rule names: the
 * harness's owner.
 *
 * Rotation is `issue` then `revoke`, in that order, and the caller does both: doing it the
 * other way round leaves a harness unable to speak in between, and doing it here would decide
 * for the caller how long the two tokens overlap.
 */

import { ownsHarness } from "../../domain/ownership.js";
import type { HarnessRegistry, TokenView } from "../ports/harnesses.js";
import type { Principal } from "../ports/identity.js";
import type { Clock, IdGenerator, ReadModels } from "../ports/index.js";
import type { Sessions } from "../ports/sessions.js";

export interface HarnessTokensDeps {
  readonly registry: HarnessRegistry;
  readonly readModels: Pick<ReadModels, "participant">;
  readonly sessions: Sessions;
  readonly clock: Clock;
  readonly ids: IdGenerator;
  readonly mint: () => { readonly token: string; readonly hash: string };
}

export type TokenFailure = {
  readonly kind: "not_the_owner" | "unknown_token" | "invalid";
  readonly message: string;
};

type Answer<T> = { ok: true; value: T } | { ok: false; error: TokenFailure };

export interface IssuedToken {
  readonly tokenId: string;
  readonly name: string;
  /** Shown once. */
  readonly token: string;
  readonly createdAt: string;
}

export interface RevokedToken {
  readonly tokenId: string;
  readonly revokedAt: string;
  /** How many live sockets the withdrawal ended. */
  readonly socketsClosed: number;
}

const NOT_THE_OWNER: TokenFailure = {
  kind: "not_the_owner",
  message: "A harness's tokens belong to the person who owns it.",
};

export function createHarnessTokens(deps: HarnessTokensDeps) {
  /** The one rule, asked before anything else: is this the harness's owner? */
  const owner = async (principal: Principal, harnessId: string): Promise<boolean> => {
    const harness = await deps.readModels.participant(principal.workspaceId, harnessId);
    return ownsHarness(principal, harness);
  };

  return {
    async list(input: { principal: Principal; harnessId: string }): Promise<Answer<TokenView[]>> {
      if (!(await owner(input.principal, input.harnessId)))
        return { ok: false, error: NOT_THE_OWNER };
      return {
        ok: true,
        value: await deps.registry.tokens(input.principal.workspaceId, input.harnessId),
      };
    },

    async issue(input: {
      principal: Principal;
      harnessId: string;
      name?: string | undefined;
    }): Promise<Answer<IssuedToken>> {
      const harness = await deps.readModels.participant(
        input.principal.workspaceId,
        input.harnessId,
      );
      if (!ownsHarness(input.principal, harness)) return { ok: false, error: NOT_THE_OWNER };
      // A removed harness speaks for nobody again (ADR 0078): no credential brings it back.
      if (harness?.removed_at != null) {
        return {
          ok: false,
          error: {
            kind: "invalid",
            message: `${harness.display_name} was removed from the workspace, and is given no new token.`,
          },
        };
      }
      const name = (input.name ?? "custom").trim();
      if (name === "" || name.length > 60) {
        return {
          ok: false,
          error: { kind: "invalid", message: "Name the token, up to 60 characters." },
        };
      }
      const at = deps.clock.nowIso();
      const minted = deps.mint();
      const tokenId = deps.ids.next("token");
      await deps.registry.addToken({
        id: tokenId,
        workspaceId: input.principal.workspaceId,
        harnessId: input.harnessId,
        tokenHash: minted.hash,
        name,
        createdAt: at,
      });
      return { ok: true, value: { tokenId, name, token: minted.token, createdAt: at } };
    },

    async revoke(input: {
      principal: Principal;
      harnessId: string;
      tokenId: string;
    }): Promise<Answer<RevokedToken>> {
      if (!(await owner(input.principal, input.harnessId)))
        return { ok: false, error: NOT_THE_OWNER };
      const at = deps.clock.nowIso();
      const revoked = await deps.registry.revokeToken({
        workspaceId: input.principal.workspaceId,
        harnessId: input.harnessId,
        tokenId: input.tokenId,
        at,
      });
      if (!revoked) {
        return {
          ok: false,
          error: { kind: "unknown_token", message: "No live token of that id for this harness." },
        };
      }
      // Now, not at the next heartbeat: a credential that has been withdrawn should stop
      // working immediately, including on the socket it is already holding.
      const socketsClosed = deps.sessions.closeToken(input.tokenId);
      return { ok: true, value: { tokenId: input.tokenId, revokedAt: at, socketsClosed } };
    },
  };
}

export type HarnessTokens = ReturnType<typeof createHarnessTokens>;
