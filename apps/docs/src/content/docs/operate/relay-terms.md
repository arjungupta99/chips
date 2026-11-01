---
title: Hosted relay terms
description: The relay at relay.chipschat.ai is free, can't read what you say, and comes with no promises.
---

These terms cover the hosted relay at `relay.chipschat.ai`, which Arjun Gupta runs so a phone can
reach its Chips server away from home, and so a server without its own Expo access token can send
notifications to the Chips app. Chips itself is covered by its licences, not by this page
([`LICENSING.md`](https://github.com/arjungupta99/chips/blob/main/LICENSING.md)). Using the hosted
relay means you accept these terms. If you would rather not, [run your own](/operate/relay/) or
use [Tailscale](/operate/tailscale/).

## It is free

No account, no payment, no ads.

## It can't read what you say

What crosses it is encrypted between your phone and your server, and the relay holds no key that
opens it
([ADR 0039](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0039-the-tunnel-is-noise-nk-over-webcrypto-and-requests-cross-it-as-messages.md)).
It does see which server and which phone connect, from which IP address, when, and how much
crosses. Its logs can record that, and they are deleted after seven days. It also keeps a count
for each day: how many servers connected, how many a phone reached, how many connections there
were and how many bytes crossed. Those counts never say which server, which phone or which
address, and they are kept. It keeps nothing else, and it sells or shares nothing.

## Notifications pass through it

A server without Expo's access token sends its notifications to the Chips app through the relay,
which passes them on to Expo and Apple
([ADR 0246](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0246-chips-sends-pushes-for-any-server-through-its-relay.md)).
A notification carries a phone's push token, a fixed sentence and a few ids. For a message, the
words are sealed to the phone, and the relay can't open them. The relay sees the server's IP
address and how often it sends. It logs no token, sentence or id, and it counts how many
notifications it sent each day. Everything
Chips counts, and everything it doesn't, is on [What Chips counts](/operate/what-chips-counts/).

## It comes with no promises

The hosted relay is provided as is, with no warranty of any kind. It can be slow, go down, drop a
connection, change, or stop for good, at any time and without notice. On the same network as your
server, your phone does not use it at all.

## Use it fairly

Don't use it to attack, overload or get into anyone's server or phone. A connection that does can
be cut, and its address blocked, without notice. The relay limits connections and sizes, the same
for everyone.

## Liability

To the fullest extent the law allows, Arjun Gupta is not liable for any loss or damage that comes
from using the hosted relay, or from not being able to.

## Changes

These terms can change, and the date below says when they last did. Using the relay after a change
means you accept the new terms. Questions: security@chipschat.ai.

Last changed 30 October 2026.
