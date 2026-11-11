# 0292. A room can have No cap, and Other takes up to $1,000

Date: 10 November 2026
Status: Accepted, 10 November 2026, on Arjun's report from the Mac: "when I set a custom amount,
Chips does not save it for me. Also we need an "No cap" button in there. I think people can have
long lasting spaces, so we definitely need it." Extends ADR 0117, ADR 0196 and ADR 0282.

## Context

Spend per job (ADR 0117) offers $1, $3 (the default), $5, $10, $25 and Other, from $0.25 to $100.
In his Health room Arjun had just raised the limit to $100 from the hold (ADR 0282) after a $35.23
job. He opened Spend per job again, Other showed `100.00`, and he typed one 0 more: `1000.00`. Save
went grey and nothing said why. The hint under the field still read "From $0.25 to $100.00", in
the same grey as always, and the server would have refused $1,000 anyway. That is the custom amount
Chips "does not save".

The second half is the bigger one. A room that lasts, a health record kept for months, does work
that no single job's ceiling describes. Holding its agents at an amount is friction with no saving
in it, and the only way out was to raise the ceiling again and again.

## Decision

1. **No cap** is a choice of its own, across the foot of the six amounts on web, Mac, iPad and
   phone, with "Chips never holds them" beside it. Picked, Chips holds no job in the room for what
   it spends, warns nobody at 80%, and hands the room's harnesses no `context.spend` and no spend
   line in the note: there is no ceiling to tell of. The room's tile says "No cap", then "$12.34 ·
   no cap" with no bar once the server has said what the job has spent. The page's This job so far
   says the amount alone.
2. **It is a new event, `space.spend_ceiling_lifted`**, by the person who took the cap off. The
   room says "took the cap off the spend per job"; from Raise the limit, "took the cap off and let
   the agents carry on after $35.23". Setting an amount or the default again
   (`space.spend_ceiling_set`) puts a cap back on. A new event rather than `usd: "none"` on the old
   one: a device from before folds `usd` into `dollars()` and would throw, while an event type it
   does not know changes nothing (core's fold), so an older phone shows the old amount until it
   updates, and nothing breaks.
3. **Other takes up to $1,000** (`SPEND_CEILING_MAX`), in the same 25¢ steps. Amounts from $1,000
   are written with a comma: `$1,000.00`.
4. **Other's field says when its amount is not one it takes**, in red under the field, and Save
   stays grey: "Other goes up to $1,000.00. For more, pick No cap." A half-typed amount such as `7.`
   is not wrong yet.
5. **An older server is offered neither.** A v1.2.3 server refuses `"none"` and amounts past $100.
   The hello's `server.takes` gains `spend_no_cap`, and the store's snapshot `keepsNoCap`. A server
   that does not say it is offered no No cap tile and Other up to $100 ("Other goes up to $100.00.").
   Until a hello has said, the choices stand, as for `held_yes` (ADR 0281).

## How it is built

- Protocol: `NO_SPEND_CEILING = "none"`, `SpendCeilingSetting` (`number | null | "none"`), the new
  event, `RoomJob` (a job whose `ceiling_usd` is `null` with no cap), `cappedSpend` (the job as a
  harness is handed it, nothing with no cap), `SPEND_NO_CAP` in `SERVER_TAKES`, `dollars` with
  commas. `JobSpend` and `context.spend` are unchanged, so no bridge changes.
- Server: migration 0062 adds `spaces.spend_uncapped` (0 by default; nothing to backfill). The
  projection sets it on the new event and clears it on `space.spend_ceiling_set`. `spendCeilingOf`
  reads `"none"`; `roomSpendFor` answers `ceiling_usd: null`; the hold at the ceiling and the turn's
  context go through `cappedSpend`. `POST /v1/spaces/:id/spend-ceiling` takes `usd: "none"`;
  `GET /v1/spaces/:id/spend` answers `ceiling_usd: null`.
- Core: `Space.spendCeiling` may be `"none"`; `SpendChoice` gains it; `ceilingWords`, `typedHint`,
  `spendRangeWords`, `NO_CAP`, `NO_CAP_UNDER`; the Other helpers take whether the server keeps No cap.
  The demo server and the conformance kit do as the server does.

## Consequences

- A room with no cap can spend without limit. Who may take the cap off is who may set the ceiling:
  the workspace's owner (ADR 0196), whose account pays.
- What a room with no cap has spent is still in sight: on its tile, on its page job by job (ADR
  0282), and on the receipts.
- A device from before this build shows a room with no cap at its last amount, and its Other still
  stops at $100, until it updates.

## Addendum, 11 November 2026: the iPad's keyboard, Save stays, ten jobs and See all

Arjun, from the iPad: "this number entering experience is a bit wonky. Get rid of the keypad popup.
Instead can we just have the iOS number keyboard? And pressing Save should not dismiss the "spend
per job screen"". Then: "also "jobs before this one" list can grow long, I need you to truncate it
after 10. a "see all" option could show it in a new view controller, that should also be
paginated so that app does not run out of memory".

1. **Other's field on an iPad uses the keyboard's own numbers** (`numbers-and-punctuation`). iPadOS
   draws `decimal-pad` as a small keypad floating by the field. The phone keeps its decimal pad,
   which on an iPhone is the keyboard.
2. **Save keeps Spend per job open** on every client. Saved, the button turns grey and says "Saved"
   until something else is picked (`spendSave` in core); on the phone the keyboard goes down. From
   Raise the limit, "Save … and carry on" still puts the sheet away, so the room shows the agents
   going on.
3. **Jobs before this one lists ten** (`JOBS_SHOWN`). See all, beside the heading, opens a page of
   its own: every job, newest first, read from the server 30 at a time as the list nears its end.
   On the phone it is a virtualised list on the sheet's own scroller (`SheetScroll` as the
   `FlatList`'s scroll view), so only the rows near the screen are drawn; on the web the next page
   is read as the list's foot comes near, with More as well.
4. **The server reads them a page at a time**: `GET /v1/spaces/:id/spend/jobs?before=&limit=`,
   answered `{space_id, jobs, next}`, cut from the same newest-first list GET /spend lists from, so
   pages never drift from it. GET /spend adds `jobs_count`. The hello's `server.takes` gains
   `spend_jobs`; a server that does not say it is offered no See all, and its list stops at ten.
