# 0082. A person names themselves

Date: 28 September 2026
Status: Accepted. Extends 0034 (people) and 0018 (the registry).

## Context

A person's name was written once, when they joined, and nothing changed it after that. The demo
workspace's first person is created as "You". So on Arjun's server every agent called him "You":
in the live test of ADR 0081, Jacobian's room line read "You (person) … and you" (the OpenClaw
test, finding 29). He asked for a way to edit his name.

A name matters more since ADR 0081. It is what an @ reaches (a name without its spaces, or its
first word). It is also what an agent is told about who is in a room, and what it calls the person
it answers.

## Decision

1. **`POST /v1/people/:id/name` changes a person's name.** It takes `display_name`, and only for
   the person calling: nobody renames somebody else, an owner included, and a harness renames
   nobody. The name follows a joining's rule: trimmed, inner spaces collapsed, one to 120
   characters. It must also be nobody else's here, compared without case, a removed harness
   excepted, because the @ goes with the name. The same name again changes nothing and records
   nothing.
2. **The registry is the truth, and the log says so.** This is the pattern of a harness's handing-on
   and removal (ADRs 0023, 0078). The `participants` row is written first, then `person.renamed`
   goes in the log with the new name and the old one. Only Chips writes it; the door refuses it
   from anybody. The projection updates the members row, which keeps a copy of the name beside the
   role.
3. **Everybody that keeps names hears it.** `person.renamed` belongs to no room, so every
   connection is sent it, harnesses included.
   - The apps read the directory again, as they do after a handing-on.
   - The server's own socket forgets the name it kept for `message.new`. So the next message from
     that person carries the new name on every harness's socket.
   - A harness that keeps a directory of its own updates it from the event. Jacobian does
     (`RoomTalk.renamed`).
4. **What was said keeps its speaker.** Messages name their sender by id, so every line a person
   wrote reads under the new name. An @ of the old name in older text is only text: it was
   resolved when the message arrived (ADR 0081) and is not resolved again.
5. **Where it is changed.** The You page on the phone and on the desktop has the name in a field
   with Save name. A name the server refuses stays in the field, with the server's reason under it.
   The phone's "You are" reads the directory, not the name the phone saved when it paired, so it
   follows a rename made anywhere.
6. **A room named by who is in it says You for its reader.** A room with no title is called by its
   members' names. It read "You, Scout" only because the first person's name was "You". After a
   rename it read "Arjun, Scout" in Arjun's own list, so the reader is "You", first, on both
   clients (core's `membersName`).

## Consequences

- No migration: the column was always there. The members row's copy is kept current by the
  projection, so a rebuild agrees with the live server.
- Nobody can take another participant's whole name, so a whole-name @ stays one participant's.
  Two people who share a first name still share its short @, as before: the short form was never
  unique.
- An owner cannot correct somebody else's name. That can be added as its own decision if a
  workspace needs it.
