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
