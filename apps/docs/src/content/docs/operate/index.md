---
title: Operate
description: Running a Chips server. A Mac mini in the closet or a cluster in the cloud, same binary.
sidebar:
  order: 1
---

`chipsd` is one process, with two storage profiles: SQLite and local files, or Postgres, Redis
and an object store. The Mac mini setup and the cloud setup are the same software.

- [A Mac mini](/operate/mac-mini/): the solo server, reachable from your laptop and your phone,
  started with the machine, with a harness beside it.
- [The chips command](/operate/cli/): serve, pair, connect, doctor, conformance, export, import.
- [Chips for Mac](/operate/desktop/): the desktop app, finding a server and pairing with it.
- [People](/operate/people/): inviting somebody, roles, passkeys, and a person's devices.
- [Notifications](/operate/notifications/): the three tiers, quiet hours, a word per harness — yours on every device, and a banner raised once.
- [The relay](/operate/relay/): a phone away from home reaches your server through a switchboard that forwards ciphertext and reads none of it.
- [Tailscale](/operate/tailscale/): your server on your tailnet, over HTTPS, so a browser pairs and a passkey works from any of your devices.
- [Your own domain](/operate/own-domain/): your server at a name you own, over HTTPS from anywhere, with Caddy on the Mac or Cloudflare Tunnel, and what that puts on the internet.
- [Chips on your phone](/operate/mobile/): approve, deny and steer from a phone, over your own network or through the relay.
- [Install](/start/install/): how to run it, and every configuration variable.
- [What Chips counts](/operate/what-chips-counts/): your server and the apps send us no analytics; the hosted relay keeps a count for each day, never who.

## What to watch

Metrics go through the OpenTelemetry API from the first release, and record nothing until you
register an exporter — there is no telemetry by default and none is planned without an opt-in
decided in the open ([What Chips counts](/operate/what-chips-counts/)).

| Metric | Why it matters |
| --- | --- |
| `chips.events.appended` | The throughput of the log, which is the throughput of everything. |
| `chips.fanout.latency` | Append to delivery. Budget: under 100 ms at p95 with 100 harnesses. |
| `chips.approvals.pending` | How many decisions are waiting on a person. |
| `chips.approvals.age` | How long they waited. A rising p95 is the first sign of an overloaded human. |
| `chips.sockets.open` | Connected clients and harnesses. |
| `chips.jobs.queue_depth` | Media work falling behind. |

## Logs

Structured JSON, one object per line, carrying the request, run and lane ids so a slow approval
can be followed end to end. No personal data by default. Tokens, signatures, authorization
headers and anything called `secret` are redacted at every nesting depth.

`CHIPS_LOG_PRETTY=true` gives human-readable output for a terminal.

## Backups

The event log is the truth, so a backup of the database is a backup of everything. In solo mode
that is one SQLite file plus the attachment directory, and `chips export` writes both to a
folder that `chips import` reads back with every projection rebuilt from the log. The process is
safe to kill at any moment: nothing is written outside a transaction.

## Budgets and limits

Message size, attachment size, pending approvals per harness, the signed URL's life and the
socket's heartbeat are configuration, with defaults that suit one person and a handful of
harnesses. See [Configuration](/start/install/#configuration). Under the attachment ceiling,
an owner or an admin caps photos, videos and files separately from **You → Attachments** in
the app, on the desktop or on the phone; that is the workspace's own setting, kept in the log.

:::note[Not yet]
Chips runs on SQLite, one gateway process per server. Postgres, a Prometheus exporter, several
gateway processes behind one address, and a runbook per failure mode are not built yet.
:::
