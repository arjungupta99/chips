---
title: New spaces
description: A person opens a room and asks your harness into it. What Chips guarantees, and what the harness decides.
sidebar:
  order: 6
---

A person can open a room in Chips and ask your harness into it, with their first words saying
what the room is for. Your harness makes something of its own for it: an agent, a session, a
thread of work, a Space under its lead. It then claims the room under its own name for that
thing. From then on the room is the harness's, exactly as if the harness had opened it.

Chips knows nothing about what you made. It knows a room, a harness, a key and a title, and
that is the whole contract.

## Declare it

Only a harness that declares `new_spaces` is ever asked. There are three ways to declare it:

- At registration, as `capabilities` on `POST /v1/harnesses`.
- Later, with `chips declare <harness> <capability>…`, which replaces the whole list and prints
  the list it replaced.
- With `PATCH /v1/harnesses/:id {capabilities}`.

The last two are the harness owner's to do, or a workspace owner's or admin's:

```sh
chips declare hrn_01K… autonomy new_spaces    # the id, or the name you connected it by
```

Declare it only when your harness handles the ask. Chips refuses to ask any harness that doesn't
declare it.

## What Chips guarantees

- **The room comes in one order.** First
  [`space.created`](/reference/events/space-created/) naming your harness in `asked_of`, with no
  key and no title of its own. Then your harness is added as a member. Then the person's first
  words, which reach you as [`message.new`](/reference/events/message-new/). You are sent the
  `space.created` although you are not in the room yet.
- **The first words are for your harness itself.** Until you claim the room it holds your
  harness, not one of its agents, so that `message.new` names your harness's own id in `for`
  (and in `addressed_to`). A harness that speaks agents reads it as "take this turn as the
  harness, and claim the room"; after the claim, the room's agent is who takes every turn. That
  agent is named after your harness, or after the room for a harness that follows its rooms, and
  numbered when an agent has the name already: a second room asked of OpenClaw holds "OpenClaw 2"
  ([ADR 0091](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0091-no-two-agents-share-a-name.md)).
- **Asked beside others.** A person may pick several faces in the +. One harness is `asked_of`
  and names the room; the others are listed in `also_asked_of`. Each of them is sent the same
  `space.created`, is added as a member, and answers through the same door with its own key: it
  gets an agent of its own in the room, and the room's key and name stay the first harness's.
- **Nobody else can take it.** Only the harness asked may claim the room, and only while it is
  still in it. A room people share, like a group, can't be claimed at all, even with your harness
  in it: only a room opened with `asked_of` can be.
- **It waits for you.** Until you claim it, the room is listed under `asked` in
  `GET /v1/harnesses/:id/spaces`, beside the rooms you opened by key, so an adapter that was down
  catches up when it starts:

  ```json
  {
    "spaces": [ … ],
    "asked": [
      { "space_id": "spc_…", "asked_by": "usr_…", "title": null, "state": "open", "asked_at": "…" }
    ]
  }
  ```

- **The claim makes the room yours.** Send `POST /v1/harnesses/:id/spaces` with your `key`, a
  `title` if you have one, and the room's `space_id`. Chips writes
  [`space.claimed`](/reference/events/space-claimed/). Asking for that key later finds this room.
  You retitle and archive it as you would a room you opened, and it is listed in `spaces`.
- **A person's name wins.** Your title names the room unless a person already named it.
- **A retry is safe.** Claiming again with the same key answers `200` with `claimed: false`.

The claim is refused when:

| Status | Why |
| --- | --- |
| `403` | The room was not asked of this harness, or the harness was taken out of it before claiming it |
| `404` | There is no such room |
| `422` | The room was claimed already under another key; another room already holds the key (the message names that room); or `shared` was sent with `space_id` |

## What the harness decides

- **What the room is.** Make whatever your harness makes. Put it wherever it belongs in your own
  tree. Jacobian makes a Space under J. An OpenClaw bridge makes a session of the agent bound to
  Chips (`sessions.create`), claims the room with the session key, and sends the first words with
  `chat.send`.
- **The key.** It's your name for that thing, so make it stable: it is how you find the room
  again, and how an adapter that follows its own things (archiving a room when the thing is put
  away) matches the room to the thing.
- **The name.** Name the room from the first words, or from what you made. A claim without a
  title leaves the room unnamed until somebody names it.
- **The answer.** The first words are the brief. Answer them in the room; the person is waiting
  there.
- **When to claim.** Claim when the thing exists. If you can't serve the ask, say so in the room.
  Chips won't claim it for you, and the room stays listed as asked until you claim it or somebody
  takes your harness out of it.

## With the SDK

`@chipschat/harness` does the listing, the history and the order for you:

```ts
chips.onSpaceAsked(async ({ spaceId, askedBy, firstMessage }) => {
  const session = await myHarness.newSession(firstMessage.text);
  await chips.claimSpace(spaceId, session.id, session.title);
  await chips.post({ spaceId, text: "On it.", replyTo: firstMessage.messageId });
});
```

`onSpaceAsked` hands each room over once, with its first words, whether they were heard live or
read at connect, and those words are not delivered to `message.new` as well. See
[the SDK](/connect/sdk/#rooms-a-person-asks-you-for).

## Check it

`chips conformance` asks a harness that declares `new_spaces` for a room after the golden
scenario. It fails the harness if the room isn't claimed, and warns if the harness claims the
room and then says nothing in it ([Conformance](/connect/conformance/)). Give it
`--capabilities new_spaces` to be asked.
