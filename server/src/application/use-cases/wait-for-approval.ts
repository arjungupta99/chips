/**
 * `GET /v1/approvals/:id/wait` — the long poll that makes hooks mode work.
 *
 * A pre-tool hook posts an approval request and blocks on this until a person answers. Chips
 * pushes the card to their phone meanwhile. Three things make it survive real life:
 *
 * - **It reads before it waits.** An approval resolved between the request and the poll is
 *   returned immediately, so a slow hook never misses its own answer.
 * - **It is woken by the log, not by a timer.** The waiter subscribes to fan-out, so the answer
 *   arrives in milliseconds rather than at the next poll.
 * - **It always ends.** On timeout it returns the approval as it stands, and the caller decides
 *   whether to poll again. Approvals outlive processes and surfaces.
 */

import type { ApprovalView, FanOut, ReadModels } from "../ports/index.js";

export type WaitOutcome =
  | { readonly kind: "resolved"; readonly approval: ApprovalView }
  | { readonly kind: "pending"; readonly approval: ApprovalView }
  | { readonly kind: "not_found" };

export interface WaitForApprovalDeps {
  readonly readModels: ReadModels;
  readonly fanOut: FanOut;
  /** Injected so a test does not have to wait in real time. */
  readonly setTimer?: (fn: () => void, ms: number) => { readonly cancel: () => void };
}

export interface WaitForApprovalInput {
  readonly workspaceId: string;
  readonly approvalId: string;
  /** Seconds. Clamped to the maximum the caller's socket will tolerate. */
  readonly timeoutSeconds: number;
}

const defaultTimer = (fn: () => void, ms: number) => {
  const handle = setTimeout(fn, ms);
  // A pending long poll must not keep the process alive on its own.
  handle.unref?.();
  return { cancel: () => clearTimeout(handle) };
};

export function createWaitForApproval(deps: WaitForApprovalDeps) {
  const setTimer = deps.setTimer ?? defaultTimer;

  const read = deps.readModels.approval;

  return async function waitForApproval(input: WaitForApprovalInput): Promise<WaitOutcome> {
    const first = await read(input.workspaceId, input.approvalId);
    if (first === undefined) return { kind: "not_found" };
    if (first.state === "resolved") return { kind: "resolved", approval: first };

    return new Promise<WaitOutcome>((resolve) => {
      let settled = false;

      const finish = (outcome: WaitOutcome) => {
        if (settled) return;
        settled = true;
        unsubscribe();
        timer.cancel();
        resolve(outcome);
      };

      const unsubscribe = deps.fanOut.subscribe({ workspaceId: input.workspaceId }, (event) => {
        if (event.type !== "approval.resolved") return;
        if (event.payload["approval_id"] !== input.approvalId) return;
        void read(input.workspaceId, input.approvalId).then((approval) => {
          if (approval !== undefined) finish({ kind: "resolved", approval });
        });
      });

      const timer = setTimer(() => {
        void read(input.workspaceId, input.approvalId).then((approval) => {
          finish(
            approval === undefined
              ? { kind: "not_found" }
              : { kind: approval.state === "resolved" ? "resolved" : "pending", approval },
          );
        });
      }, input.timeoutSeconds * 1000);

      // The approval may have been resolved between the read above and the subscription. One
      // more read closes that window; without it a hook could block for its whole timeout on a
      // decision that was already made.
      void read(input.workspaceId, input.approvalId).then((approval) => {
        if (approval?.state === "resolved") finish({ kind: "resolved", approval });
      });
    });
  };
}

export type WaitForApproval = ReturnType<typeof createWaitForApproval>;
