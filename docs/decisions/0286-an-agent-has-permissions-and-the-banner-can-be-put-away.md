# 0286. An agent has Permissions, and the banner can be put away

Date: 8 November 2026
Status: Accepted, 8 November 2026, on Arjun's "Looking good. Build it." of the mock
"Every agent gets a Permissions page, and the banner can be put away". Extends ADR 0281.

## Context

Arjun, 8 November 2026: the gold band a room shows while an agent works without asking (ADR 0281)
"having it forever visible is annoying". ADR 0281 kept it up for as long as the yes held so that the
yes is never forgotten. That is the right default and the wrong only choice: someone who has
decided to let an agent run does not want to be reminded in every room, on every device, until
they stop it.

There was also nowhere to go. An agent's card had no word on what it may do. What it may do was on
its harness's When it asks you, shared with all the harness's agents. And a yes that lets an agent
work could only come from answering an ask, so an agent could not be let work before it had asked.

Arjun asked for three things: "a proper agent permission page", a way to dismiss the banner and a
Disable banner option that hides it for that agent, and a universal hide or show on the harness.

## Decision

1. **Every agent gets a Permissions page**, from a row between its facts and Lock changes, from the
   words of its band in a room, and beside its card on a wide screen. It says what the agent may do
   right now, with Stop or Let it work; then the banner; then the Allowed always rules that reach it;
   then its asks so far; then its harness.
2. **× closes a banner for now, for that yes in that space.** It is keyed on `LetWork.since`, so the
   next yes is a new one and shows its banner. The band says `Hidden for now` for five seconds, with
   Disable banner and Undo and a hairline counting them, then folds. There is no room for Stop, × and
   Disable together in one line on a phone, so Disable comes after ×.
3. **Disable banner, and the switch on the agent's page, say whether this person wants it for this
   agent.** It follows its harness unless it says otherwise. A choice that matches its harness is no
   choice and is let go, so it follows its harness again.
4. **Show banners on the harness's page says it for all its agents, and any made later.** It brings
   agents set apart back in line, so Undo stands for five seconds and puts them back as they were.
5. **All of it is this person's, on all their devices, and changes only what they see.** Kept at the
   server per person, as hidden spaces are (ADR 0205): `banner_choices` and `closed_banners`, read at
   `GET /v1/me/banners`, changed one at a time, and sent whole to that person's sockets as a `banners`
   frame. Not on the log: no event says it and nobody else is told. Kept in the cache as well, so a
   banner that is off doesn't flash at launch.
6. **Let it work can be given from the page, with no ask to answer**: a person-only
   `approval.held_started`, allowed to the person whose agent it is or an owner or admin, in a space
   the agent is in. It opens in place to say what it covers before anything changes. A yes is still a
   rule in `session_rules`, ended by Stop as any other.
7. **An older server keeps none of this.** Its hello doesn't take `banners` or `held_start`, so × stays
   on that device and Disable banner, the switches and Let it work aren't offered.

## Consequences

- A yes can run with nothing in the room saying so. That is the person's choice for what they see;
  anyone else in a shared space keeps their own. The agent's row and its Permissions still say it,
  and the harness's list marks each agent the banner is off for.
- Hiding the banner changes nothing about what an agent may do. A card still comes for anything that
  matters.
- Allowed always stays with the harness, as the policy keeps it. The agent's page shows the rules
  that reach it and says they are shared.
- An hour's band now reads `Jiro isn't asking until 2:50 AM`, so × fits beside Stop on a phone.
