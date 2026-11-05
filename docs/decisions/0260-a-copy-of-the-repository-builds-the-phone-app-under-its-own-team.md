# 0260. A copy of the repository builds the phone app under its own team

Date: 2 November 2026
Status: Proposed, 2 November 2026, for making the repository public (the readiness review of
28 October, M2).

## Context

`apps/mobile/app.json` names whose app the phone build is: Chips' Apple team (`W9K648WB82`), the
bundle id `chat.chips.app`, the link domain `relay.chipschat.ai`, and Chips' Expo owner and
project. The push extension's plugin and `pnpm phone` build on the same values, `pnpm phone` with
the bundle id written into it again. Apple lets one team sign a bundle id, so nobody but Chips'
team can sign a build from a clone, and TestFlight is by invitation.

A free team can sign neither push nor Associated Domains (Apple's supported capabilities, the
Apple Developer column). `pnpm phone` took push out of a free team's build, but not the link domain
ADR 0207 added, so a free team's build has failed to sign since then, and the docs' "a free one
will do for everything but push" has been wrong.

## Decision

1. **`app.config.js` over `app.json`.** `app.json` keeps Chips' values. `app.config.js` takes the
   team, the bundle id, the link domain and the Expo owner and project from `CHIPS_APPLE_TEAM_ID`,
   `CHIPS_IOS_BUNDLE_ID`, `CHIPS_IOS_LINK_DOMAIN`, `CHIPS_EAS_OWNER` and `CHIPS_EAS_PROJECT_ID`.
   Unset, each is `app.json`'s, and `expo config` is what it was. Set empty, the link domain, the
   owner and the project are left out, which is what `eas init` needs to make a project. It is
   JavaScript rather than TypeScript so that `pnpm phone` can require the same `identity` Expo
   reads, with no build step.
2. **A free team says so.** `CHIPS_IOS_FREE_TEAM=1` leaves out push and the link domain. It is a
   variable, not a guess: whether a team is free is known only from Xcode's preferences and
   profiles on one Mac (`tools/phone/team.mjs`), and the config is read on machines without them.
   `pnpm phone`, which has them, takes both out of a free team's build when the variable was not
   set, as it took push out before.
3. **A prebuild names the team every time.** The push extension's plugin writes the extension's
   team and bundle id at each prebuild, not only when it makes the target, and drops a keychain
   group under another team, which this one cannot sign. `pnpm phone` makes `ios/` again when the
   team, the bundle id, the link domain or the flag differ from those it last made it with
   (`ios/.made-for.json`), or when it did not make it. It warns when the team the build is signed
   as is not one of Xcode's, and names Xcode's.
4. **The steps are in the docs.** "Under your own Apple team" in `contribute/phone.md`: the
   variables, a free team's two losses, and push with a paid team (an Expo project of one's own, its
   APNs key, and the server holding its access token, since the Chips push relay sends with Chips').

## Consequences

- With nothing set, `expo config --type prebuild` gives Chips' config as before, save Expo's own
  note of where the dynamic config is (`_internal.dynamicConfigPath`), and a fresh `ios/` is the
  same as one made before this.
- A stranger's values give their team, bundle id (and `.notifications` for the extension),
  keychain groups under their team, and their Expo project. A free team's build has neither push
  nor the link domain. A prebuild over an `ios/` made for Chips' team and back again gave each
  team's project.
- Invite links open a fork's build only from a relay whose association file names it. The relay's
  `APP_ID` is in its source (`relay/src/join-page.ts`), so a fork changes it there. Elsewhere an
  invite link opens the relay's page, whose Open in Chips opens the app.
- Not tried: a build signed by a free team or another paid team on a phone, and `eas init` with
  the owner and project left out.
