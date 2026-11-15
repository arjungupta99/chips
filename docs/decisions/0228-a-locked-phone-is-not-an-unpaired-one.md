# 0228. A locked phone is not an unpaired one

Date: 24 October 2026
Status: Accepted, 24 October 2026. Arjun: "Natalie is supposed to be a member in chips's two
spaces, but when she opens app it shows the pairing screen again".

## Context

On the server nothing had changed for Natalie. She was a member of the workspace and in two
rooms, her device was not revoked, and nothing had refused it. Her phone last connected on
22 October at 22:46 PDT, and it had not knocked since. So the app had decided by itself that
it held no workspace, and the tabs sent her to Welcome.

The phone keeps each device's record in SQLite and the private half of its key in the Keychain,
marked `WHEN_UNLOCKED_THIS_DEVICE_ONLY` ([ADR 0044](0044-the-phones-webcrypto-is-ours-in-javascript.md)).
iOS refuses that read while the phone is locked, and the app's files until the first unlock after
a restart. It can also start an app before anybody opens it. Core's `loadDevices` was written for
a browser, where a storage that fails means a private window, and it answered every failure with
an empty list. One key that would not load did the same, because the keys were loaded in one loop
that threw. The phone took that empty list for an answer and kept it until the app was swiped
away.

Reading `device.ts` turned up a second way to the same screen. `readAll` swapped each record's
Keychain reference for the live key on the record itself, and `setDeviceMuted` wrote that record
back. SQLite keeps a key as `{"type":"private",…}`, so the next launch found no reference, no key,
and an empty list. It reaches only somebody with two workspaces who turns one's notifications off.

We cannot see Natalie's phone, so which of these she met is not proved. If swiping Chips away and
opening it again brings her rooms back, it was the first. Either way the fix is the same. Later on 24 October Arjun said her rooms came back, with no pairing again: the record and its key were on the phone all along, so it was the first.

## Decision

1. **A key that cannot be read now is not a key that is gone.** `DeviceStorage.loadKey` answers
   nothing when the storage no longer holds the key, and throws when it cannot read it just now.
   The phone's storage returns nothing for a record with no reference or an empty Keychain entry,
   and lets the Keychain's refusal through.
2. **One key costs one device.** Core reads keys one device at a time. A device whose key is gone
   is left out, and pairing again replaces its record, as before. One whose key will not open is
   left out and counted. `readDevices` answers both the devices and that count, and throws when the
   storage will not open at all. `loadDevices` keeps the browser's answer: the devices it could
   read, or nothing.
3. **Records stay as stored.** A read hands out copies with the key in place. `setDeviceMuted`
   goes through `amend` with the other writers, so the record it writes back keeps its reference.
   Pairing and forgetting work from the records, so a device whose key is gone is still replaced
   and its cache forgotten.
4. **The phone decides only once it is open.** `readWhenOpen` (`src/device/held.ts`) answers the
   first read that opened every key. A read that did not, made while the app is behind, waits for
   the app to come to the front and reads again. In front it reads again up to five times, 0.4 s
   apart, and then goes on with what it could read, which can still be Welcome. Until then the
   provider is not ready, so the launch picture stays and the tabs draw nothing. A read after a
   change the phone made (a pairing, a switch, a forget) that cannot open every key leaves the
   list as it was.

## Consequences

- A phone started while locked, or before its first unlock, opens on its rooms.
- A phone with a key that is really gone, after a restore to a new phone for one, shows its other
  workspaces, or Welcome when it has no other. Pairing again replaces the dead record.
- A record already damaged by the mute bug has lost its reference. Its Keychain entry cannot be
  found again, so that workspace has to be paired again (People → the person → Pair a new phone…,
  [ADR 0206](0206-an-owner-pairs-a-new-phone-for-somebody-already-here.md)).
- Walked on Android, 24 October (emulator chips-pixel-9, release build from `f9212c62`, two scratch
  servers): a cold start holds and connects both workspaces; muting one and starting again keeps
  both, and the muted one still signs in; started while locked behind a PIN, it opens on Spaces once
  unlocked; after a reboot with the PIN, Android keeps the app's storage locked and does not start
  Chips until the first unlock, then it opens paired. Not walked on an iPhone: a simulator has no
  locked Keychain.
- The web and the Mac read as before. Their records hold the key itself and they have no
  `loadKey`.

## Addendum, 13 November 2026: a key that is gone is said

Arjun, 13 November 2026: a phone in his workspace "somehow lost pairing with me, and when I opened
the app I directly saw the demo server. It was a bit confusing why that happened", then "Yes, fix
it" to the page below.

On the server nothing had refused that phone. Its device paired on 26 October at 00:24 PDT, was
connected for two minutes, and never knocked again; it was not revoked until a new pairing replaced
it on 12 November at 22:22 PST. So the phone had stopped offering the workspace by itself, as in
the first case above, except that this time it did not come back on a later launch. Nothing in the
app forgets a workspace without a tap, and the storage's settings have not changed since September,
so the likeliest cause is the one the consequences above name: the record came back with a backup
and the key, made this-device-only, did not. Which it was is not proved from here.

What it showed is what the decision above does with such a key. A device whose key is gone was left
out without a word, and the launch put the next thing in front. On that phone the next thing was the
demo, kept by an earlier Look around (ADR 0213, point 7), whose word lives in the app's preferences
and comes back with a backup too. Nothing said the workspace had been there.

1. **A read names the devices whose key is gone.** `readDevices` answers `lost`, their records with
   no key, the one in front first, and `lostInFront`, whether the device in front is one of them.
   A key that will not open just now is still counted and read again (point 4); one that is gone is
   not read again, since it never comes back.
2. **The one in front, lost, is said rather than stood in for.** The phone's provider holds it as
   `lost` and puts nothing in front at the launch: not another workspace of the person's own, and
   not the kept demo, which stays behind for Look around. A lost device that was not in front is
   left as before, and the one in front opens.
3. **The first screen names it** (`KeyGone`, in place of the film): "This phone can't open Northwind
   any more", why (a phone restored from a backup or moved to a new one comes back without its
   keys), and how to get back in, in the words the connection's sheet already uses for a phone the
   server no longer knows: an owner reconnects you from your page in People and you scan the code,
   or on your own computer You → Devices → Pair another device. Under them **Scan a QR code**,
   **Other ways in** (That's Chips, where the page steps aside) and **Remove Northwind from this
   phone**, which forgets the record and its cache as Sign out does (`useLeave`, by its id).
4. **Pairing again puts it away.** Pairing with the same server replaces the record (point 3), and
   a workspace of the person's own coming in front clears `lost`.

Walked on the iPhone 17 Pro simulator (iOS 27.2) with the release build from main `3eb10bf14` and
this change's bundle, in the state a restored phone is in: the record in `chips-devices.db` naming
a Keychain entry that is not there, and the demo's word in `chips-prefs.db`. Before, the app opened
on Chips demo. After, it opens on the page, light and dark. The simulator's Keychain answered the
missing entry with nothing rather than a refusal, so the read named it lost at once with no tries
again. The page's buttons are covered by the phone's tests, not tapped on the simulator.

The web and the Mac are unchanged: their storage holds the key itself, so nothing is ever lost.
