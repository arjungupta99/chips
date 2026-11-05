# App Store review

What App Review is told when the iPhone app goes to the App Store, and why. The notes below go in
App Store Connect, under the version's **App Review Information → Notes** (4,000 bytes at most),
and the recording below goes beside them under **Attachments**. The contact name, phone and email
are the maintainer's to type.

## No demo workspace

There is no workspace for a reviewer to join. The one these notes used to name, at
`relay.chipschat.ai/try` (built as
[`proposals/testflight-external-plan.md`](proposals/testflight-external-plan.md) describes), was
retired on 4 November 2026:

- ADR 0232 makes every invite lapse 30 minutes after it is made, so no link lasts a review. The
  App Review link had been dead since the demo server took that code on 31 October.
- Keeping one alive meant a server on the maintainer's Mac making a new link every few minutes,
  letting in whoever came, and staying awake for as long as a review was open.

So the notes send the reviewer to Look around, which is on the phone, and a recording shows what
needs a real workspace: joining one, an agent's ask, and Delete your account.

## The recording

`chips-app-review.mp4`, about 40 seconds. It is not in the repo: the maintainer keeps it with the
release's files. It was made on 4 November 2026 from 1.0.0's JavaScript on an iPhone simulator,
against a throwaway `chipsd` in dev mode with a scripted agent:

1. Open a member invite link, type a name, tap Join.
2. Ask the agent to confirm an order. It asks before it sends an email; tap Approve.
3. You → Delete your account, type the workspace's name, tap Delete your account. It ends on
   "You've left Demo".

To make it again, end the recording before the first screen's list of computers on the network
comes in: it names the Macs around the simulator, with their addresses.

## The notes

```text
Chips is a chat app for the AI agents people run on their own computers. Each workspace is a
server the person runs themselves. There is no Chips cloud and no Chips account outside it.

To try it without a server of your own, open Chips, tap Skip on the first screen (or let the short
film finish), then tap Look around. It opens a sample workspace on the phone, with agents and
spaces.

The attached recording, chips-app-review.mp4, shows a real workspace: joining from an invite link,
saying hello, the agent asking before it sends an email, and Delete your account.

Joining a workspace makes an account in it. To delete it, open You and tap Delete your account
at the foot of the list. That takes the account out of the workspace on every device.

Plain http:// connections (NSAllowsArbitraryLoads): a person's server is usually on their own
home or private network, at an address no certificate authority signs, such as 192.168.1.20 or
a name on their own private network. The app connects only to servers the person pairs with, by
scanning a code or opening a link. Every request it sends is signed with a key that stays on the
phone, and connections through our relay are encrypted between the phone and the server.

The app has no analytics or crash reporting. Push notifications go through Expo and Apple, and
through our relay first when a person's server doesn't send them to Expo itself.
```

1.0.0 went to review with notes naming the `/try` workspace. They were replaced while it was in
review, with one more sentence after Look around's paragraph: "The demo workspace our earlier
notes named, at relay.chipschat.ai/try, has been retired."

## Why each paragraph is there

- **How to get in.** A reviewer can't reach anyone's own server. Without a way in, review stops
  at guideline 2.1 ("we were unable to review your app"). Look around needs nothing, and the
  recording covers what Look around can't show.
- **Deleting the account.** Guideline 5.1.1(v): an app that makes an account has to let it be
  deleted from inside the app. Joining a workspace makes a person on that server, and You →
  Delete your account takes them out of it, with their devices, face and invites (ADR 0243).
  Look around makes no account, so the recording shows it.
- **Plain `http://`.** `app.json` turns App Transport Security's `NSAllowsArbitraryLoads` on,
  because people's own servers have no certificate. App Review asks for the reason when it is on.
- **No analytics.** The App Privacy answers say no data is collected for tracking; the notes say
  the same in words.

## What the app no longer asks for

`expo-secure-store` added a Face ID usage string, though nothing in Chips uses Face ID. App Review
asks about a permission an app names and never uses, so `app.json` turns it off
(`faceIDPermission: false`).
