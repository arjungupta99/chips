/**
 * The workspace registry: what a workspace is called. A registry, not a projection, as the people
 * registry is (ADR 0018): the workspace is made at first run, not by an event, and a rebuild of
 * the read models leaves it as it is. `workspace.renamed` records each change to it (ADR 0194).
 */

export interface WorkspaceRegistry {
  /** What the workspace is called, changed (ADR 0194). */
  readonly rename: (input: {
    readonly workspaceId: string;
    readonly name: string;
  }) => Promise<void>;
}
