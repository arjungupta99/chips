/**
 * Which rules each of a bridge's sessions holds (ADR 0250): what `rulesFor` gave the last turn that
 * said them, by session. A turn whose session holds its rules word for word passes `rulesHeld` to
 * `promptFor` and leaves them out. A session nobody has told holds none: a new one, and every one
 * after the bridge restarts, so each hears them once more. One that compacted is forgotten, since
 * what it kept of them is its summary's to say; and a space whose agents or project changed shape
 * has new rules, which are said again.
 */
export class SessionRules {
  private readonly held = new Map<string, string>();

  /** Whether `session` holds these rules: told them word for word, or there are none to hold. */
  holds(session: string, rules: string): boolean {
    return rules === "" || this.held.get(session) === rules;
  }

  /** That `session` was told these rules: its turn that said them was given to it. */
  told(session: string, rules: string): void {
    if (rules !== "") this.held.set(session, rules);
  }

  /** That `session` no longer holds what it was told: it compacted, or it is gone. */
  forget(session: string): void {
    this.held.delete(session);
  }
}
