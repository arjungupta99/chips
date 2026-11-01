/**
 * What a harness declares it takes, beyond the events it sends.
 *
 * A harness's manifest carries `capabilities`, "what the harness can do", stored when it is
 * registered and presented back to it in `hello`. Most entries name tools — `email.send`,
 * `drive.read` — and are the harness's own business. A few are read by the clients, because
 * they decide whether a control is drawn at all: a control that cannot keep its promise is
 * worse than none ([ADR 0046](../../../docs/decisions/0046-a-harness-declares-that-it-takes-the-dial.md)).
 */

export const HARNESS_CAPABILITIES = {
  /**
   * The harness reads the level and the rules Chips sends it — `hello.autonomy`, `policy.updated`
   * — and asks accordingly, so the L0–L3 dial on its profile and in its run panel changes
   * something. A harness on `@chipschat/sdk-ts` does; one with a permission model of its own — per
   * tool, per connector — does not, and gets no dial.
   */
  autonomy: "autonomy",
  /**
   * The harness takes a room a person opens and asks it into — `space.created` with `asked_of`
   * naming it — makes its own thing for it, and claims the room with a key of its own. What makes
   * the + for a new space worth drawing: a room asked of a harness that does not do this would
   * wait for an answer that never comes.
   */
  newSpaces: "new_spaces",
  /**
   * The harness keeps its own side of a room it opened under a key in step with the room: a
   * person's archive and unarchive here are carried to the thing it keeps for the room, and a
   * delete (`space.erased`) deletes that thing, or puts it away for its owner when the person
   * deleting does not own the harness (ADR 0066, ADR 0069). What lets the sheets that ask first
   * promise so. A harness that does not declare it is not bound by any of that — `moved_by` and
   * the tombstone are there for it to read — and the sheets promise nothing on its behalf.
   */
  followsRooms: "follows_rooms",
  /**
   * The harness speaks agents (ADR 0087): it reads `hello.agents` and `for`, and names one of its
   * agents as the `actor` of what it sends. Until it declares this, everything Chips hands it, on
   * the socket and over HTTP, is the view it knew before agents: its own agents are its own id,
   * any other agent a harness, and nothing says `for` (ADR 0087's addendum of 29 September).
   */
  agents: "agents",
  /**
   * The harness copies one of its agents when a person asks (ADR 0087, Fork): it hears
   * `agent.fork`, makes a copy that remembers everything the agent did up to then, and registers
   * it with `forked_from` and the room it was asked for, where Chips puts it. After that the two
   * remember separately. Fork is offered only for a harness that declares this, because a room
   * asked for a copy that never comes says so after a minute and nothing more.
   */
  forks: "forks",
  /**
   * The harness makes a new agent when a person asks for one in a room (ADR 0108): it hears
   * `agent.asked`, makes an agent that remembers nothing from elsewhere, called what the ask says,
   * and registers it with `made_for` and the room, where Chips puts it. Only a harness that
   * declares this is offered on a room's Add page, because a room asked for an agent that never
   * comes says so after a minute and nothing more.
   */
  newAgents: "new_agents",
  /**
   * The harness has a restart of its own and runs it when a person asks (ADR 0094): a socket of it
   * says `restart` in its `hello`, hears the `restart` frame, and runs what the harness keeps for
   * that — a process restarting itself, or a bridge starting what is behind it again. What makes
   * Restart worth drawing on its page.
   */
  restarts: "restarts",
  /**
   * The harness sends Chips a copy of each of its agents' context files and of its own set, keeps
   * them current, and takes a person's edits (ADR 0134): a socket of it says `context` in its
   * `hello`, hears `context.edit`, saves the file in its own way, and answers with its copy. What
   * makes an agent's Context group, and its harness's shared files, worth drawing.
   */
  contextFiles: "context_files",
  /**
   * The harness sends Chips a copy of each agent's model and effort, what it may run on instead
   * and the words for each, keeps them current, and takes a person's changes (ADR 0140): a socket
   * of it says `models` in its `hello`, hears `model.change`, sets the agent's model and effort in
   * its own way, and answers with its copy. What makes an agent's Model group worth drawing.
   */
  models: "models",
  /**
   * The harness sends Chips a copy of each agent's heartbeat, the turn it starts on its own every
   * so often, keeps it current, and takes a person's changes (ADR 0143): a socket of it says
   * `heartbeats` in its `hello`, hears `heartbeat.change`, switches or times the agent's heartbeat
   * in its own way, and answers with its copy. What makes an agent's Heartbeat group worth drawing.
   */
  heartbeats: "heartbeats",
  /**
   * The harness sends Chips a copy of each agent's context window, how full it is and the limit it
   * compacts itself at, keeps it current, and takes a person's Compact now and new limit (ADR
   * 0146): a socket of it says `context_windows` in its `hello`, hears `context_window.compact`
   * and `context_window.change`, does them in its own way, and answers with its copy. What makes
   * an agent's Context window group worth drawing.
   */
  contextWindows: "context_windows",
  /**
   * The harness sends Chips a copy of the jobs it runs on its own, outside any space, and posts
   * each run with what it cost, and takes a person's switch (ADR 0252): a socket of it says `jobs`
   * in its `hello`, hears `job.change`, switches the job in its own way, and answers with its
   * copy. What makes the harness page's "Its own jobs" group worth drawing.
   */
  jobs: "jobs",
} as const;

/**
 * How long a room waits for a fork's copy (ADR 0087, Fork): a copy registered within it joins the
 * room the person asked for; after it the room says the harness didn't make the copy, and one
 * registered later is free, for a person to put in a room. The clients time it from the ask, as
 * the server does, so nothing about the wait is stored.
 */
export const FORK_WAIT_MS = 60_000;

/**
 * How long a room waits for a new agent a person asked a harness for (ADR 0108): the minute a
 * fork's copy has. One registered within it joins the room; after it the room says the harness
 * didn't make it, and one registered later is free.
 */
export const NEW_AGENT_WAIT_MS = FORK_WAIT_MS;

export type HarnessCapability = (typeof HARNESS_CAPABILITIES)[keyof typeof HARNESS_CAPABILITIES];

/**
 * How long a harness stays restarting without a word from it (ADR 0094): after this the state says
 * again whatever is true then, and Restart is offered again. The server keeps it; a client that
 * draws a count reads it from here.
 */
export const RESTART_WAIT_MS = 180_000;
