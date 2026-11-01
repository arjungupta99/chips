# 0142. An approval asks its question

Date: 8 October 2026
Status: Accepted, 8 October 2026.

## Context

Arjun, looking at mocks of the approval card: "A looks fine, I think the bigger issue I have seen
in the past is, the dialog does not exactly ask the proper question in it. So it becomes confusing
as to what I am approving."

What an `approval.request` carried: an action (`kind`, `input`), a preview (`format`, `body`,
`title`), risk classes, an expiry and who may answer. None of these is the question. Each harness
filled them with what it had:

- **OpenClaw's bridge** sent `shell.exec`, the preview title "Run a command", and the command in a
  code fence.
- **Jacobian** sent its record's label as the title ("Kit edit: connectors/robinhood.yaml", "Bind
  App workroot", or for a changeset the whole task brief its engineer was given) and its Telegram
  card as the body.

The phone card drew the action's kind as its second line (the needs-you item's title was
`approval.actionKind`) and two lines of the body as plain words. So on the live server:

- The robinhood "kit edit" of 6 September **turned the connector off for every Space**; that
  sentence was the seventh line of the body, which the card cut at two.
- The workroot binding of 20 September also gave the Space **a standing right to run seven
  commands as Arjun's Mac user**, including a coding agent. The card said
  `jacobian.workroot_config.workroot_bind`.

The mocks also showed a smaller card change Arjun accepted ("A"): head the card with the harness's
own preview title rather than the action's kind, draw the preview by its format, give the agent
its own face, and say the countdown in one sentence.

## Decision

### The ask carries its question

`approval.request` gains three optional fields, written by the harness where it knows what the
action does:

- **`question`**, up to 200 characters: the question the person answers yes or no, as one sentence
  in plain words. `Turn off the Robinhood connector?`
- **`effect`**, up to 500: what a yes does. `Its 73 tools disappear from every Space.`
- **`lasts`**, `once` or `standing`: whether a yes is for this action alone or holds until it is
  taken back, such as a folder an agent may keep working in.

They are optional so every harness that exists keeps working. They describe the ask; they do not
change what the scope of an answer means (`once`, `session`, `always` stay the approver's choice).

### The card leads with it (card A)

One rule heads every surface, `askHeadline` in core: the question, else the preview's title, else
the action's kind and who it is to. The needs-you item's title is the same, so a desktop
notification asks the question too, and `askDetail` puts the effect after it (else the preview).

The phone card, top to bottom: the asker's own face and "Scout asks"; the headline, with `code`
spans in mono; the effect; the preview drawn by its format (Markdown as the room draws it, a diff,
JSON or table as a block), held to about six lines; *Just this once* or *Until you take it back*
(amber); the risk chips; "Denied in 15 min if you don't answer" (or "Goes ahead…", or "Lapses…"
for a question, which has no fallback). Deny, Approve and Details are unchanged. Its own screen
draws the same pieces in full, with the preview's title over the preview when the question has
taken the headline.

The Mac and web card (`ApprovalCard`) takes the same headline with "Scout asks" under it, the
effect under the head, and the lasts tag at the start of its foot.

### Who writes it

- **OpenClaw's bridge**: from the command and the folder. `Run \`date\`?`, effect where it runs,
  `lasts: once`.
- **The SDK** passes all three through `run.approval`; Scout's demo asks
  `Send this email to dana@northwind.com?`.
- **Jacobian** was not changed by this ADR: it was a separate commit in its own repository, waiting
  for Arjun's word, which came the same evening (see the addendum).

## Consequences

- An old server drops the fields (the protocol strips what it does not know), so the bridge can
  send them before 4431 restarts; they reach the card once it has.
- An approval handed on to somebody outside the room (ADR 0042) is drawn from the hand-on's
  summary, which carries the action and not the question, so that card is headed by the action's
  kind. Carrying the question there needs the server's approvals table to keep it; left until it
  is wanted.
- The conformance kit does not yet nudge a harness that sends no question.
- The policy engine still matches on the action's kind and flags. The question is for the person.

## Addendum, 8 October 2026: Jacobian writes its own

On Arjun's "make Jacobian write its own questions too", Jacobian (`1883662`, branch
`claude/chips-approval-question` in its repository) asks every card's question where it knows the
action:

- **a tool call**, from the call (`src/permissions/ask.ts`): `Send this email to dana@northwind.com?`
  with the subject as the effect, `Add “Dentist” to your calendar?` with when and who is invited,
  `Run \`npm test\`?`, `Push this Space's code to its remote?`, and `Use \`<tool>\`?` for a tool
  with no words of its own;
- **a kit edit**: `Turn off the robinhood connector?` ("Its runtime stops and its tools disappear
  from every Space…"), the simulation toggle, an install, and otherwise the file's kind (`Add the
  github connector?`, "for every Space" at the top), all `standing`;
- **a workroot binding**: `Let <App> work in \`<folder>\`?`, with the commands it may run as his
  macOS user and the consent to land on green, `standing`;
- **a changeset**: `Apply this change to <folder>?`, with how many files, the branch it is committed
  on, and whether the base branch moves to it;
- **a connector call** (`Run \`github.create_issue\`?`) and a one-tap action.

Its preview is now the request's own input, or the record's summary with the pulse's lead line
kept, rather than Telegram's card text with its heading, fields and reply commands. Telegram,
Slack and Discord cards are unchanged. The run a card opens outside a turn is still named by the
card text's first line ("Permission Required").
