/**
 * What the app shows, folded from the event log.
 *
 * The client never keeps a second idea of what happened: it holds the events it has received
 * and folds them into what the screens need — the space list, the messages in each
 * space, the run panel, the fleet of harnesses, and what is waiting on a person — the same way the
 * server folds them into its read models. A pure function, so a test drives it with a list of
 * events and no browser, and the same fold runs in the web app and in the mobile app.
 *
 * Phase 0 folded one space. This folds a workspace of them, but the per-space
 * shape — lines, a run, approvals — is the one M0.6 proved.
 */

export * from "./model/index.js";
