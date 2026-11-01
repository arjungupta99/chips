---
title: Get Chips on your iPhone
description: Install the app, scan the code chips up shows, reach Chips away from home, and turn on notifications.
sidebar:
  order: 3
---

This page takes an iPhone from no app to one that reaches your Chips at home and away, and tells
you when an agent needs you. [Chips on your phone](/operate/mobile/) has everything the app does
once you're in.

## Install the app

Chips isn't in the App Store yet. It's in TestFlight, Apple's app for trying an app before it's
released. Open the TestFlight link you were sent on the iPhone, install TestFlight when it asks,
and then install Chips from it. An invite to somebody's workspace can carry the link, under *No
Chips yet?*.

## Pair it at home

On the computer that runs Chips, `chips up` shows a QR code for the phone, and shows a new one each
time you run it. On a computer that's already paired, **You → Devices → Pair another device…**
shows one too.

Open Chips on the iPhone, tap **Scan a QR code** on its first screen, and point the camera at the
code. Scan it from inside Chips, not with the Camera app. The first time, iOS asks whether Chips may
find devices on your local network: allow it, since that's how the phone reaches Chips on your
Wi-Fi.

If the code won't scan, **Have a pairing code?** takes the code and the server's address typed in.
A code works once, for fifteen minutes.

If `chips up` says only this machine can reach Chips and shows no code, run it again with
`--reach lan`, for phones on this Wi-Fi, or `--reach relay`, for phones anywhere.

## Away from home

At home the phone talks to Chips directly. Away from home it goes through a relay, which carries
the connection without being able to read it, and the relay is off until the workspace's owner
turns it on. On the phone that's **You**, then **Relay** under the workspace's name, then **Use
the relay**. On a computer it's **You → Relay**, and in a terminal `chips up --reach relay`. A
phone that's already paired learns about the relay from Chips, so it doesn't need a new code.

If your devices use Tailscale, `chips up --reach tailnet` lets the phone reach Chips over your
tailnet instead, with the Tailscale app on the phone. [The relay](/operate/relay/) and
[Tailscale](/operate/tailscale/) say more about each.

## Notifications

The first time an agent is waiting on a decision, the app asks whether to tell you on this phone.
To turn it on later, open **You → Notifications → Notify me on this phone**. You're told about
decisions an agent is waiting on, messages that @ you, and what other people write in your spaces.
Each space's sheet changes what it sends you. [Notifications](/operate/notifications/) has every
setting.

## A second workspace

Somebody may invite you into their workspace as well as your own. Open their invite link on the
phone, or tap the workspace's name at the top of Spaces, then **Join another workspace**, and paste
the link or scan its code. The new workspace sits beside the one you have, and the name at the top
of Spaces switches between them.

## Leaving

**Sign out**, at the foot of **You**, takes this phone out of the workspace. **Delete your
account**, under it, takes you out of the workspace on every device. What you said stays, under
your name. The workspace's only owner is told how to delete the workspace itself instead.
[People](/operate/people/#delete-your-account) says what goes and what stays.
