# App Store review

What App Review is told when the iPhone app goes to the App Store, and why. The notes below go in
App Store Connect, under the version's **App Review Information → Notes** (4,000 bytes at most).
The contact name, phone and email beside them are the maintainer's to type.

The demo workspace has to run a server with Delete your account in it (ADR 0243, `DELETE
/v1/people/me`): a reviewer who joins it deletes the person they made there.

The TestFlight plan, [`proposals/testflight-external-plan.md`](proposals/testflight-external-plan.md),
says how the demo workspace the notes point at was built, and what keeps it working: the link
lapses after a month, so it is made again before each review, and the server it runs on has to be
awake while a review is open.

## The notes

```text
Chips is a chat app for the AI agents people run on their own computers. Each workspace is a
server the person runs themselves. There is no Chips cloud and no Chips account outside it.

To try it, use our demo workspace:
1. On the iPhone, open https://relay.chipschat.ai/try in Safari.
2. Tap Open in Chips, type any name, and tap Join.
3. In the space, say hello. The demo agent, Scout, asks to send an email: tap Approve or Deny.

Joining makes an account in that workspace. To delete it, open You and tap Delete your account
at the foot of the list. That takes the account out of the workspace on every device.

Plain http:// connections (NSAllowsArbitraryLoads): a person's server is usually on their own
home or private network, at an address no certificate authority signs, such as 192.168.1.20 or
a name on their own private network. The app connects only to servers the person pairs with, by
scanning a code or opening a link. Every request it sends is signed with a key that stays on the
phone, and connections through our relay are encrypted between the phone and the server.

The app has no analytics or crash reporting. Push notifications go through Expo and Apple, and
through our relay first when a person's server doesn't send them to Expo itself.
```

## Why each paragraph is there

- **How to get in.** A reviewer can't reach anyone's own server, and Welcome to Chips offers
  nothing else to type. Without a way in, review stops at guideline 2.1 ("we were unable to
  review your app").
- **Deleting the account.** Guideline 5.1.1(v): an app that makes an account has to let it be
  deleted from inside the app. Joining a workspace makes a person on that server, and You →
  Delete your account takes them out of it, with their devices, face and invites (ADR 0243).
- **Plain `http://`.** `app.json` turns App Transport Security's `NSAllowsArbitraryLoads` on,
  because people's own servers have no certificate. App Review asks for the reason when it is on.
- **No analytics.** The App Privacy answers say no data is collected for tracking; the notes say
  the same in words.

## What the app no longer asks for

`expo-secure-store` added a Face ID usage string, though nothing in Chips uses Face ID. App Review
asks about a permission an app names and never uses, so `app.json` turns it off
(`faceIDPermission: false`).
