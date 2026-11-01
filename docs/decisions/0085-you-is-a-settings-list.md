# 0085. You is a settings list

Date: 29 September 2026
Status: Accepted. Supersedes WP5's "nothing on You has a chevron" (`docs/proposals/phone-polish.md`),
and amends ADR 0034 (where passkeys are offered), ADR 0037 (what the phone offers of the tiers),
ADR 0045 (what the push switch remembers) and ADR 0047 (where attachment limits live).

## Context

Arjun asked for You to be overhauled and highly polished: every option checked for whether it
works, whether it repeats another, what to add and what to take away. Every option was traced
through the client, `@chipschat/core` and the server.

On the phone:

- **Unpair** forgot the key on the phone and nothing else. The server kept a live device with its
  push token, so the phone went on being pushed to, and each pairing again added another "iPhone".
- **Quiet hours** could not be turned off. Their fields started empty under placeholders that
  looked like saved times, and typing one end saved the other as its placeholder, over what had
  been saved.
- **Review today** and **FYI** changed nothing on a phone, because the server pushes nothing but
  approvals.
- **Signing in** said a passkey needed the App Store build. No build of the phone has passkeys.
- **"You are"** repeated the name. **"Reaching it"** repeated the connection mark at the top right.
- **Devices** listed twelve names, five of them "This browser", with no dates. None could be
  removed.
- **Attachments**, the whole workspace's setting, was shown to everyone as if it were theirs.
- The **push switch** came back on after being turned off, because it read only whether the phone
  allowed notifications.

On the desktop: passkeys were offered in the desktop app and on 127.0.0.1, where none can be made.
Allowing banners did nothing until a reload. Notification settings were loaded once, after the
first banners had been planned. FYI's day was UTC's. There was no light or dark choice.

## Decision

1. **You is a settings list, on both.** Your face, name and role at the top, where a phone's own
   Settings puts its person. Then Appearance, Notifications, Devices, the workspace's own group, and
   About. The way out is at the foot. Every row says what it is set to. A row that holds a longer
   setting opens it in a sheet, and only such a row wears a chevron.
2. **Your name is changed from the header.** A tap on the header opens a sheet with the field
   (ADR 0082).
3. **Notifications, on the phone:** the push switch on its own, because it is the phone's, and a
   foot saying what a push carries. Then the person's own settings: **Decisions** (Right away / Off),
   **Quiet hours** (a switch, the system's time wheel for From and To, and **Let decisions
   through**), and **Agents** (a word per agent). Review and FYI are not offered on the phone. The
   desktop keeps them as **Finished work** and **Checkpoints**, where they limit banners to one an
   hour and one a day on the local day. Quiet hours are saved once, when their sheet is done with,
   and a refused save is put back and said.
4. **The push switch remembers off.** Turning it off is kept on the phone as well as at the server,
   so it stays off while the phone still allows notifications.
5. **Devices:** this device first, then the rest by when each was last seen, with the time under
   each name and a mark for its kind. Devices not seen for a month are folded under one row, with
   **Sign out all**, which asks first. A row pushed left signs that device out at the server. The
   phone offers **Pair a computer**, which issues the code a computer types in. New devices name
   themselves usefully: a phone by its model when iOS will only say "iPhone", and a browser as
   "Safari on Mac". The order and the fold are core's `sortDevices`.
6. **Sign out withdraws at the server first,** then forgets the key, on both. It still forgets the
   key when the server can't be reached.
7. **The workspace's own settings stand apart, under its name, for owners and admins only.** On the
   phone that is Attachment limits (ADR 0047). On the desktop it is People, Invite someone and
   Attachment limits. Nobody else sees the group.
8. **Passkeys are offered only where one can be made:** in a browser, in a secure context, on a
   host that is not an IP address. Not in the desktop app, and never on the phone.
9. **About says the server, what this phone keeps, and the build.** The server by its host.
   **Media on this phone**: how much the kept attachments come to, and Clear, after which each is
   fetched again when opened. **Version**: the app's version and the commit it was built from,
   which `pnpm phone` bakes in (`EXPO_PUBLIC_CHIPS_COMMIT`) and the desktop's build defines.
10. **The desktop gets Appearance** (System / Light / Dark, this computer only) on the theme
    plumbing `@chipschat/ui` already had. It is kept in the browser's storage and applied before the
    first paint.

## Consequences

- The phone's You needs a native build for the time wheel
  (`@react-native-community/datetimepicker`, the one new dependency). `pnpm phone` builds it.
- A Clear takes back files the phone was holding for the viewer. The file service drops the URIs
  it remembered and fetches each again, so nothing points at a file that is gone.
- Devices paired before this keep their old names ("This browser", "iPhone") until they pair again.
  The fold keeps the old ones out of the way.
- The phone still hears only about decisions. Hearing about finished work would need the server to
  push digests, and that is left for later.
- Removing a person from the workspace is still not possible. It needs a route and an event, and is
  not part of this.

## Addendum, 18 October 2026: Devices sits above Sign out

Arjun: "in You tab place the Devices section above the signout."

On the phone, Devices moves from after Notifications to the foot, under About and directly above
Sign out: the keys held as you, then the way out of this one. The rest of point 1's order stands.
The desktop keeps its order, since its Sign out is in the profile card at the top, not at the
foot.

## Addendum, 19 October 2026: the phone's Version says the build number

Point 9's Version on the phone says the build number too, in brackets after the version, as
TestFlight says it: "0.0.0 (202610190718) · d0959cbc", on the line under the label, as the
server's host is, since the value at the right would cut it off. Every TestFlight build stays on version
0.0.0, since Apple reviews the first build of each version before external testers get it and
later builds of the same version reach them at once (Arjun, asked whether each build should take
a new version: "Keep 0.0.0, show the build"). The build number is the one that rises, stamped
from the clock by `pnpm phone testflight` and `pnpm phone ship`, so it is what tells two builds
apart. It is read from the app's own Info.plist (`Constants.platform.ios.buildNumber`); the web,
the desktop and Expo Go have none and keep "0.0.0 · commit".

## Addendum, 20 October 2026: one card under each heading, every row with a mark

Arjun: "we need to improve the 'You' tab layout. The sections need to look more organized and
clear. Right now they appear bit scattered." A phone-width mock put today's You beside three
layouts (A, the same order tidied; B, regrouped; C, a list of rows each opening a page; kept out of
the repo). He said "Go with B, build it." What read as scattered, and what B does about each, on
the phone (the desktop's You keeps its own layout; the iPad uses the phone's):

1. **Two row shapes.** Workspaces, Notifications and Devices wore coloured marks, the workspace's
   group and About none, so the words started at a different edge from card to card. Every row
   now wears a mark: a colour for a row that opens or changes something, the quiet grey Devices
   already wore for the facts under This phone.
2. **Seven paragraphs between the cards**, which pushed them apart unevenly. Three one-line notes
   are left: what reaches this phone, under Notifications ("Only decisions and messages that @
   you reach this phone."); "Swipe a device left to sign it out."; and "Nothing in the workspace
   is deleted." under Sign out. The rest moved to where it is looked for: what a push carries
   (`pushNote`) and that the settings follow you to the desktop go into the Decisions sheet; what
   Media keeps was already said on Media's own page; that Soothing and Bright are every face's
   colours is now shown, with an agent, a room and you in each card; and the workspace's group
   says who sees it at the right of its heading ("Owners and admins"). A trouble with push (the
   phone refusing, no token) still takes the place of the line under Notifications, in amber.
3. **Notifications was two cards**, the push switch and Decisions, Quiet hours and Agents. It is
   one card: the switch first, then, once the phone holds two workspaces, a "From …" switch for
   each (ADR 0197), then the three rows. Decisions, Quiet hours and Agents say only their values;
   what each is about is its hint, and its sheet's to say.
4. **Appearance was the tallest card**, above settings changed more often. Each face theme's card
   shows one row of faces with its name inside the card (ADR 0176's six faces were two rows with
   the name under the card), about half the height, and the group comes after Notifications.
5. **The workspace was in two places**: its list at the top, its settings halfway down under a
   bare name. Your face, name and role are now the first row of a card whose second row is
   **Workspace**, saying the one in front, with a count when something waits in another; it opens
   the sheet Spaces' name opens, with each workspace, Rename for an owner and Join with a link
   (ADR 0197, ADR 0194). The Name row and its sheet left the workspace's group, since that sheet
   renames. The face sits at the row's left, so the card's words start where the rest do.
6. **Rows with a value and a two-line note beside it were crowded.** A row now says its value, or
   a line under its label, never both, save the relay's host under Connection ("Encrypted, via
   relay.chipschat.ai"; straight over the network says Direct and nothing more).

The order is now: you and the workspace; Notifications; Appearance; the workspace's own group
(owners and admins); This phone, which was About (Media on this phone first, as the one row there
that opens something, then Server, Connection and Version); Devices; Sign out.
