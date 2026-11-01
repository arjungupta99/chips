/**
 * Whether an action matters (ADR 0008, ADR 0036 Gate 5, ADR 0195): it leaves the workspace,
 * spends money, cannot be undone, or carries one of the hot risk classes. What Chips stops for
 * at "Ask when it matters", what a lead is never handed, and since ADR 0195 what always waits
 * for a person: a harness may not settle such an ask itself, a person answers it once (no This
 * session, no Always), and a rule a person's answer made never allows one.
 *
 * Chips goes by what the harness says about the action; it never sees the tool call. Here, so
 * the server, the conformance kit's fake and the apps read the same sentence.
 */

/** The classes that make an action matter: leaving the workspace, money, credentials, destruction. */
export const HOT_RISK: ReadonlySet<string> = new Set([
  "external",
  "external_communication",
  "destructive",
  "financial",
  "credential",
]);

/** The flags an ask carries about its action, as the harness declared them. */
export interface ActionFlags {
  readonly external?: boolean | undefined;
  readonly irreversible?: boolean | undefined;
  readonly money_usd?: number | undefined;
  readonly risk?: readonly string[] | undefined;
}

/** Whether the action is one that always waits for a person. */
export function actionMatters(action: ActionFlags): boolean {
  return (
    action.external === true ||
    action.irreversible === true ||
    (action.money_usd ?? 0) > 0 ||
    (action.risk ?? []).some((risk) => HOT_RISK.has(risk))
  );
}
