---
title: Participant
description: A person or a harness. Harnesses carry an owner, capabilities, an autonomy level, a budget and live status.
---

A participant is a person or a [harness](/concepts/harness/).

Harnesses carry an owner, a set of capabilities, an [autonomy level](/concepts/policy/), a budget
and live status. That is what makes a harness a teammate rather than a feature: it has a profile,
it can be added to a group, mentioned, or muted, and somebody is accountable for it. A person
carries a name and the devices they have paired — a browser, a laptop, a phone, the CLI — each
with a key of its own, and no password anywhere.

## What a harness has

| Field | What it is |
| --- | --- |
| `owner_id` | The person accountable for this harness. Approvals default to them. |
| `autonomy` | L0 to L3. See [Policy](/concepts/policy/). |
| `budget_usd` | The ceiling. Warns at 80 percent, pauses the run at 100. |
| `parent_id` | The lead, for a child minted to serve one [lane](/concepts/lane/). |
| `ephemeral` | True for such a child, which inherits owner, autonomy and budget from its lead. |
| `capabilities` | What it can do, which is what a person sees before they add it to a room. |

## An agent and its face

A harness takes part in rooms as its **agents**, each a participant with a name of its own and one
room at a time. An agent is drawn as the Chips mark, a rounded square with a bite out of its corner
and its pins round it, where a person is a circle and a harness a squircle. It wears its initials until somebody
gives it a face: press and hold its row on the phone's Agents tab, or tap the face on its card,
and pick a mark and a colour. The face is the agent's, so everyone in the workspace sees the same
one, and anybody who is not a guest may change it
([ADR 0089](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0089-an-agent-has-a-face-of-its-own.md)).

Its outline says what it is doing. While it works a light runs round its pins. A small face has
no room for pins and wears a green dot in the bite. An amber dot there says the agent can't answer now.

## Roles

A person has two standings, and they are different things.

**In a space**, every message says who sent it and whether they are the **owner**, a **member**
or a **guest** of that space. A harness never has to work this out: it receives a stable sender
id and a role, and treats Chips as one trusted account. Multi-user is Chips' job.

**In the workspace**, a person is an **owner**, an **admin**, a **member** or a **guest**
([ADR 0034](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0034-people-join-by-invite-and-come-back-by-passkey.md)).
Whoever ran the server is its first owner. Everyone else joins by an
[invite](/operate/people/) with a role attached, and an owner or admin can change it later.

| Role | May |
| --- | --- |
| Owner | Everything: invites for any role, every role change, everyone's devices, every harness's tokens. The last owner cannot be demoted. |
| Admin | The same, except that an admin changes no owner's role and makes no owner. |
| Member | Open spaces, add people and harnesses to them, add harnesses of their own, and work. |
| Guest | Be in one space at most, and change nothing about the workspace: a vendor, or a relative who only needs to say yes to things. A guest is told only whom they share that space with. |

The role is a projection of two events, [`person.joined`](/reference/events/person-joined/) and
[`role.changed`](/reference/events/role-changed/), so the audit says who let whom in, as what,
and who changed it. What a person may do in a particular room is still the room's: an owner of
the workspace who is a guest of a room posts there as a guest.

## Identifiers

People are `usr_`, harnesses are `hrn_`, both followed by a ULID. Every id in Chips is a prefixed
ULID, so `run_01K4Z…` can only ever be a run and a log line says what it is about without a
lookup.
