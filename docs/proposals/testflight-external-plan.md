# TestFlight for other people: a plan for external testing

*17 October 2026. Phase 6 of `people-first-class-review.md` (his call 2, "Install: TestFlight").
Read from main `ed77c38b`, App Store Connect as the TestFlight session left it, Apple's TestFlight
help pages, and `chipschat.ai` as it answers today. Nothing here is built or set up yet.*

## The short answer

Today only he can install the iPhone app: build 202610180528 sits in the **Internal** group, and
internal testers must be on his developer team. External testing lets anybody with an Apple
Account install it from the TestFlight app, by an email invite or a public link, after Apple's
**Beta App Review** passes the build.

Three things stand in the way, and none of them needs the app changed:

1. **A reviewer can't get past "Welcome to Chips".** The app does nothing without a Chips server,
   and the only ways in are a pairing QR, a computer on the same Wi-Fi, or an invite link of about
   150 characters that nobody can type. Beta App Review rejects a build it can't use (guideline
   2.1, "Information Needed"). So the reviewer needs a server to join and a short way to get the
   link onto the iPhone (§2).
2. **Test Information needs a feedback email**, and `chipschat.ai` has no mail server (no MX
   record; SPF is `-all`), no privacy page and no site: it is Squarespace's "Coming Soon" page
   (`noindex`). The feedback email has to be his Gmail or a new mailbox (§1).
3. **A tester tapping his invite link lands on a dead page.** The link opens
   `https://adas-mac-mini.tail2f9c1e.ts.net/#invite=…` in Safari, which loads only inside his
   tailnet (ADR 0164, Consequences). It works when they **copy** the link, open Chips and tap
   **Paste**: the app reaches 4431 through the relay. A short instruction covers the first few
   testers; the real fix is Phase 5's universal link (§3).

## 1. What Beta App Review asks for

In App Store Connect → Chips: Agent Chat → TestFlight → **Test Information**:

| Field | Needed? | What I'd put |
| --- | --- | --- |
| Beta App Description | Required | Chips is where you chat with your AI agents and supervise them: approve what they ask, steer a run, read what they made. It talks to a Chips server you run, on your own computer. |
| Feedback Email | Required; testers see it, and it is the reply-to of the invite email | His Gmail, unless he makes a mailbox (his call 2) |
| Marketing URL | Optional | Leave empty: `chipschat.ai` says only "Coming Soon" |
| Privacy Policy URL | Optional for a TestFlight beta, by Apple's help and Expo's guide (the form will say for sure) | Leave empty for now; the App Store needs one, so it waits for a real page (§6) |
| Beta App Review contact: first and last name, phone, email | Required | His to type: it is his personal data |
| Sign-in required, user name, password | Only for an app with a sign-in | "No": Chips has no account, and the notes say how to get in |
| Review Notes (4,000 bytes) | Where we tell the reviewer how to get in | §2 |
| Licence agreement | Apple's standard | |

Per build, **What to Test** (shown to testers in TestFlight). The first build of a version gets a
full review, usually within a day or two; later builds of the same version often go straight out.
We stay on version 0.0.0, so most later builds should not wait; the build number in brackets is
what rises, and You → Version says it as TestFlight does (ADR 0085's addendum, 19 October 2026).
A build stops installing 90 days after its upload. Up to 10,000 external testers; one tester can
use 30 devices.

Export compliance is settled: `ITSAppUsesNonExemptEncryption` is false in `app.json` on his
"standard encryption, not France" answers.

## 2. How a reviewer gets in (his call 1)

The reviewer installs from TestFlight, opens Chips and sees **Welcome to Chips**: scan a code,
find Chips on this Wi-Fi, or **Paste** an invite link. Apple's reviewers are not on his Wi-Fi or
his tailnet, and they read the notes on one device and test on another.

**A. Notes and a screen recording only.** About 15 minutes, plus somewhere for him to put the
recording (an unlisted video). The notes say Chips needs the person's own server. Likely refused
under 2.1 with "we were unable to review your app", which costs a day and lands on B anyway.

**B. A demo workspace, with a short page to open it** (I'd do this). About two to three hours of
mine, and three live steps on his word:

- A second Chips server on the mini: its own database and port, its own launch agent
  (`chat.chips.demo`), listening on loopback only, no dev mode. Nothing of his workspace is in
  it: no people, agents or rooms of his.
- One scripted agent in one room, which plays the golden run every time somebody speaks: it reads
  PO-4471, checks the CRM, asks to email Dana with an **Approve / Deny** card, and leaves a
  receipt. It is `apps/mobile/e2e/maestro/golden.mjs --when-asked` in a loop: no model, no tools,
  no tokens, nothing it can touch. It runs outside the repo, as ADR 0188 wants of samples.
- A **room link** (ADR 0168) that anyone can use for a month, the longest the server allows. It
  makes a Guest of that room, or a Member if the walk shows a guest can't answer the card. It
  carries the relay and the server's key, so the reviewer's phone reaches the mini from anywhere.
- The demo server's key added to the relay's allowlist (`CHIPS_RELAY_ALLOW_KEYS` on the box), a
  restart of `chips-relay` (his iPhone's relay session drops for a second and comes back).
- A one-screen page at `https://relay.chipschat.ai/try` (Caddy on the box, already serving that
  name), with **Open in Chips** (`chips://join?…`) and the link with **Copy**. The notes then
  say: on the iPhone, open `relay.chipschat.ai/try` in Safari, tap **Open in Chips**, type any
  name, tap **Join**; in the room, say hello and approve the email.
- Upkeep: the link lapses after a month, so before each full review I make a new one and update
  the page. The mini has to be awake while a review is open.
- The same demo later serves a public link and Phase 7's "one person who has never seen Chips".

**Built, 17–18 October** (his "B"; details in `~/Work/chips-demo/README.md`, outside the repo):
launch agents `chat.chips.demo` (127.0.0.1:4460) and `chat.chips.demo-agent`; workspace "Chips
demo", room "Scout"; the relay allows its key; `https://relay.chipschat.ai/try` serves the page.
Walked in a browser as a joiner (the link, the card, a run, Approve, Deny), then on an iPhone
simulator with a Release build of main `1f3a2c55`, exactly as the notes say: `/try` in Safari,
Open in Chips, the join card ("Through the relay: this phone isn't on the server's network"), the
room, Scout's card, Approve, "Done". The room was then archived and Scout given a clean one, so the
reviewer finds it empty. What the walks changed:

- **The link makes a Member, not a Guest.** Only a harness's owner may answer its asks by default,
  and a guest never may (`approversFor`: `any` is everyone in the room but a guest). Scout has one
  rule, `email.send` asks and `any` answers, so a reviewer who joined by the link can tap Approve.
- **Always would leave the next person no card.** An approver's Always writes an allow rule into
  the room's policy for Scout. Scout watches its policy and has the owner put the rule back.
- **`CHIPS_PUBLIC_URL` is the /try page.** The server's own links then open that page, and a phone's
  direct probe of `https://relay.chipschat.ai/v1/health` gets a 404, so it goes through the relay.
- **The workspace could not be renamed** from "My workspace", the name `chips serve` gives a first
  run; it was renamed in its database.
- **Worth a look later:** any approver's Always writes a standing allow rule into another person's
  agent's policy for that room, though a `policy.updated` sent by hand is an owner's or an admin's
  (SEC-1). With the default approver (the agent's owner) only the owner can; it matters once a rule
  names `any` or a role.

**C. A Review room in his own workspace, the reviewer as a Guest.** No new server, but Apple's
staff would be people in his live workspace, beside agents that run tools on his Mac and spend his
tokens. I wouldn't.

## 3. Email invites or a public link, and how a tester gets into a workspace (his call 3)

**Email invites** (I'd start here). He names each person; App Store Connect sends the email; they
accept in the TestFlight app. Names and emails show in App Store Connect. Fits "nothing public
yet".

**A public link.** Anyone holding the URL installs; testers stay anonymous; it can cap the number
(1 to 10,000) and ask for an iOS version. Worth it only once a stranger has somewhere to go: the
demo of §2B, or Chips they can install themselves (nothing is published: no npm, no public
binaries). I'd leave it for later.

**How a tester gets in, today**, once they have the app:

1. He makes an invite in Chips: a space's Add → **Invite someone new** (a Guest of that room,
   ADR 0168), or People → **Invite someone** (a Member sees the whole directory).
2. He sends the link by Messages or email.
3. They **copy** it (long-press → Copy), open Chips, tap **Paste**, type their name, **Join**. The
   card says "Through the relay" off his network.
4. Tapping the link instead opens Safari on his tailnet address, which won't load. Until Phase 5
   gives `chipschat.ai` a universal link (1B), the invite needs a line of instruction. I can add
   it to the text Share sends (a small change on the phone; his call 4).

The phone holds one workspace at a time (2B is Phase 7), so a tester who tried the demo is signed
out of it when they join his workspace, and the card says so first.

## 4. What in the build assumes it is his

Nothing points at his machine. The uploaded archive's `main.jsbundle` holds none of
`100.64.0.7`, `tail2f9c1e`, `relay.chipschat.ai`, `127.0.0.1` or `mac-mini`. The only thing a
build gets stamped with is the commit (`tools/phone/stamp.mjs`). The pairing code and the address
reach his phone by `chips://pair` from `pnpm phone` (`tools/phone/phone.mjs:1332`), never through
the build. The Runtime tab and the WebView inspector sit behind `__DEV__`, which is off in a
Release build. A stranger's first screen is "Welcome to Chips"
(`apps/mobile/app/pair.tsx`): this Wi-Fi, Paste or scan an invite, or a pairing code.

What does follow from it being his:

- **Push goes through his Expo project** (`942a13f7…`, owner `arjunguptaxor`, APNs key
  PLWP5CLUSZ). Every Chips server posts to Expo's `exp.host` by default, with no token, so a
  tester's pushes from 4431 work as his do. If he ever turns on Expo's "enhanced security", every
  server needs his access token.
- **Push from a TestFlight build works.** The archive is signed for development and the upload
  re-signs it for the store. Checked on his iPhone at 22:58 PDT on 17 October by the TestFlight
  session: the build kept its pairing, connected through the relay, and a push sent through Expo
  to its token arrived (production APNs).
- **The upload had a warning, ITMS-90473**: the push extension's `CFBundleVersion` stays "1"
  (`apps/mobile/plugins/with-push-seal.js:58`) while the app's is stamped with the build number
  (`tools/phone/phone.mjs:1061-1066`). It doesn't block review. One more `PlistBuddy` line fixes it
  in the next build.
- **The relay answers his server only.** Its allowlist holds 4431's key alone (ADR 0144), so a
  tester joining *his* workspace reaches it from anywhere, but a tester's *own* server gets no
  relay. That's fine while Chips isn't published; §2B adds the demo server's key.
- **Small words that only he would understand**: the local-network prompt says "your tailnet"
  (`app.json:21`), and `apps/docs` says "There is no App Store build yet"
  (`operate/mobile.md:11`) and that the relay is "Not running yet" (`operate/relay-terms.md`).
  None of it blocks a beta.
- **`NSAllowsArbitraryLoads` is on**, so the app can reach `http://` servers on a home network or
  a tailnet. Beta App Review rarely asks about it; App Review may want the reason, which is that
  people's own servers have no certificate.
- No analytics or crash reporting. The privacy manifest declares no data collected and no tracking.
  Off the person's own server, the only places data goes are Expo and APNs (push tokens) and the
  relay (connection metadata).

## 5. What I'd do on his word, in order

0. **His own check first**: the TestFlight build on his iPhone, and a push to it (§4). Done
   22:58 PDT, 17 October.
1. Test Information and the Beta App Review contact, in his Chrome. He types his name and phone.
2. If B: the demo server, the demo agent, the allowlist line and the `/try` page. Then a walk on
   the simulator, off his Wi-Fi, through the relay, exactly as the notes tell the reviewer.
3. The Review Notes and What to Test.
4. **An external group** (named by him), feedback on. Add build 202610180629 and **Submit for
   Review**, with "Automatically notify testers" off, so nobody gets an email before he says.
   *Done 18 October 00:35 PDT: group "Friends", Waiting for Review.*
5. When Apple approves: the first emails (his to type, or from a list he gives me), then
   **Notify**.
6. Each later build: `pnpm phone testflight`, then add it to the external group with its What to
   Test. That is by hand in App Store Connect, because uploads go as his Xcode Apple ID with no API
   key. The ITMS-90473 line rides with the first such build.

## 6. Not now

- **App Store release**: needs a privacy policy page, the App Privacy answers, screenshots, an age
  rating, the France answer, and a demo for App Review on every version (§2B serves it).
- **A "Try the demo" row on Welcome to Chips**, instead of the `/try` page: a visible product
  change, mock first.
- **Universal links on `chipschat.ai`** (1B, Phase 5): needs a real site there.
- **Mailboxes on `chipschat.ai`**: the repo names `security@chipschat.ai` (`SECURITY.md`, the
  relay terms) and `conduct@chipschat.ai` (`CODE_OF_CONDUCT.md`), and neither can receive mail
  today (`docs/technical-plan.md:84` says so too).
- **An App Store Connect API key**, so `pnpm phone testflight --external` could add each build to
  the external group itself. Worth it once builds go out weekly.

## His calls

**Answered 17 October 2026**: "Go with your recommendations: B for the reviewer, my Gmail as
feedback email, email invites, add the Paste line to Share. I'll name the group and the first
testers."

1. **How a reviewer gets in: A, B or C** (§2). I'd do **B**.
2. **The feedback email**: his Gmail, which every tester sees, or a new mailbox such as
   `beta@chipschat.ai` (email forwarding from Squarespace or Google Workspace, his to set up). I'd
   use his Gmail now.
3. **Email invites or a public link** (§3). I'd do **email invites** now and a public link later.
4. **Should the invite's Share text add "Copy this, open Chips, tap Paste"?** Yes or no. I'd say yes:
   it is one string, and it goes out with the next build.
5. **The external group's name, and the first people to invite.**
