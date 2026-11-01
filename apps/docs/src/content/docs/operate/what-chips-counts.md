---
title: What Chips counts
description: Your server and the apps send us nothing. The hosted relay keeps a count for each day, and the App Store and download sites count what they count. All of it, here.
---

Chips sits where your agents ask for things and you answer, so it doesn't report on you. This is
everything that gets counted, who counts it, and what never leaves your machines
([ADR 0208](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0208-the-relay-counts-each-day-and-chips-says-what-it-counts.md)).

## Your server and the apps: nothing

The server, the phone app, the Mac app and the web app send us nothing: no analytics, no crash
reports, no install or device ids
([ADR 0015](https://github.com/arjungupta99/chips/blob/main/docs/decisions/0015-no-telemetry.md)).
They talk to your server. Beyond it they reach the relay, when your server uses one, and Expo's and
Apple's push services, which carry [what a notification needs](/operate/notifications/) and
nothing it says. A server without Expo's access token sends its notifications through the Chips
push relay on their way to Expo.

Your server measures itself through the OpenTelemetry API, and those measurements go nowhere until
you add an exporter of your own ([What to watch](/operate/#what-to-watch)).

## The hosted relay: a count for each day

When your server uses `relay.chipschat.ai`, the relay writes one line for each day (UTC):

| Count | What it is |
| --- | --- |
| `servers` | Servers connected to it that day |
| `reached` | Servers a phone came through to |
| `sessions` | Connections from a phone to a server |
| `peak_servers`, `peak_sessions` | The most at once |
| `bytes_to_servers`, `bytes_to_phones` | Bytes moved each way: ciphertext it cannot read |
| `pushes` | Notifications it sent on to Expo for servers without Expo's access token |

A count says how many, never which: no server's key, no phone, no address. A server that sends
its notifications through the relay is in `pushes` whether or not its relay switch is on. The relay's logs, which
can say which, are deleted after seven days ([its terms](/operate/relay-terms/)). Use
[your own relay](/operate/relay/) or [Tailscale](/operate/tailscale/), and you aren't in these
counts at all. The apps say so too: on You → Relay, under *Use the relay*, with a link to this page.

## Downloads and the App Store

- **The App Store and TestFlight.** Apple shows us installs, sessions, how many come back, and
  crashes, as totals, from people who let their iPhone *Share With App Developers* (Settings →
  Privacy & Security → Analytics & Improvements). The app has no analytics code in it. Apple
  collects this, and that switch turns it off.
- **Releases and packages.** GitHub counts downloads of each release file, and npm counts
  downloads of each package.

This site has no analytics and sets no cookies.

## Anything more would ask you first

A report from your server about how Chips gets used would tell us more than any of this. It isn't
built. If it ever is, it will be off until you turn it on, it will show you exactly what it sends,
and it will be decided in the open first.
