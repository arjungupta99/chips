# Feedback prompts, not pull requests

Arjun, 26 October 2026: "How can anyone give tool feedback? Also I do not want to accept pull
requests from people, I want to ask them to submit a feedback prompt, that can be used to improve
the tool." Mocks: [Chips feedback prompts](https://claude.ai/artifact/2XEcuD74jX6ke1UurjtqYD). His
pick from them, the same day: a GitHub issue form, pull requests turned off, and the app and site
open the form already filled in. He then chose: "Go with your picks on all seven calls, put the
plan in docs/proposals, and start the build." So each call below went as recommended.

Today nobody can send feedback at all. The app has no row for it, and "Not right?" on a message
goes to the agent, not to us. support@chipschat.ai has no mailbox, and the repository is private.

## The shape

There's one place a feedback prompt lands: a **Feedback prompt** issue form on the public
repository. Everything else opens that form:

- **The apps** (phone, web and Mac): You → Send feedback.
- **chipschat.ai/feedback**, plus **chipschat.ai/feedback.md**, which any agent can read to help
  someone write one.
- **The repository**: New issue, and `CONTRIBUTING.md`.

A feedback prompt has three parts: what you saw, what you'd change, and how to tell it's done.
Bugs and ideas both fit those three parts, so there is one form, not two.

Chips itself sends nothing. The app opens github.com with the words in the link, and nothing is
public until the person presses Create on GitHub. So the Privacy page stays true as written, and
there's no new service, mailbox or inbox to run.

## Your calls

1. **Boxes in the app, or straight to GitHub.** The mocks have a Chips sheet with the three boxes,
   then hand the words to GitHub. GitHub's form has the same three boxes, and the person has to
   sign in there anyway, so they'd see the same boxes twice. I'd drop the sheet. "Write it
   yourself" opens GitHub's form with the Chips version filled in. The Send board in the mocks
   then goes away.
2. **"Write it with your agent".** The mocks put Milo in a new space, but a Main agent stays in
   its Main space, so that can't happen as drawn. I'd keep the option with a different flow:
   - It opens the Main space with this line in the composer, not sent: "Read
     https://chipschat.ai/feedback.md and help me write a feedback prompt for Chips."
   - The agent asks a question or two, then ends its reply with an "Open it on GitHub" link that
     has every box filled in.

   It's the same line the site gives for any agent, so it needs no new kind of message or card.
   The limit is that an agent whose harness can't read web pages can't read feedback.md. It
   should say so, and the person can still write the prompt themselves. Or cut it: the site's
   line already works with any agent.
3. **The licence line.** The form ends with a required box to tick: "The people who make Chips may
   use this prompt, and anything made from it, under any licence." This needs a lawyer's look
   before the repository is public. A form link can only fill text fields, so the person ticks the
   box on GitHub. The form works without the line if you'd rather leave it out.
4. **Credit in the release notes.** The form has an optional "Name in the release notes" box, and
   the site says "When a change comes from your prompt, the release notes say so." That's a
   promise you'd keep by hand in each GitHub release ("Thanks to @rosa, #12"). I'd keep it,
   because it's the only thing a person gets back for a prompt. To drop it, remove the box and
   that section of /feedback.
5. **Pull requests: off, or collaborators only.** GitHub's two settings (Settings → General →
   Features, added February 2026) are:
   - **Off:** the tab is hidden and nobody can open one.
   - **Collaborators only:** the tab stays and only people with write access can open one.

   I'd turn them off. Nothing here uses pull requests (main is trunk-based). One thing to know:
   with them off, Dependabot can still raise alerts but can't open fix PRs. GitHub's mobile app
   still shows the tab for now, but nobody can open a pull request from it.
6. **Sign-off on our own commits.** With no outside code coming in, the DCO and the CLA have no
   job. I'd remove both from `CONTRIBUTING.md` and keep `git commit -s` and the CI check on our
   own commits. They cost nothing, and taking them out means changing CI and ADR 0014 for no gain.
7. **Security reports.** The new issue page will link a security problem to `SECURITY.md`, which
   names security@chipschat.ai, and that has no mailbox yet. I'd turn on GitHub's private
   vulnerability reporting when the repository goes public and have `SECURITY.md` point to it
   too. He asked for it to be turned on straight away (26 October). GitHub offers it only on
   public repositories, and its API answers 404 for it on this private one, so it's the first of
   the going-public steps.

## What gets built

### Phase 1 · The repository

- **`.github/ISSUE_TEMPLATE/feedback-prompt.yml`**, worded as in the GitHub board, with the label
  `feedback-prompt`. Each field's `id` is the name a link fills it by:

  | id | Field | Required |
  | --- | --- | --- |
  | `title` | Title (the issue's own) | yes |
  | `saw` | What you saw: what you were doing, and what Chips did. | yes |
  | `change` | What you'd change: the change, in your own words. You don't need to know the code. | yes |
  | `done` | How to tell it's done: what someone would do to check that it works. | yes |
  | `version` | Chips version: in the app, You → Version. | no |
  | `credit` | Name in the release notes: leave it empty to stay unnamed. | no *(call 4)* |
  | `grant` | The licence line, as a box to tick. | yes *(call 3)* |

- **`.github/ISSUE_TEMPLATE/config.yml`**: blank issues turned off, and two links, "A security
  problem" → `SECURITY.md` and "What makes a good prompt" → chipschat.ai/feedback.
- **`CONTRIBUTING.md`**, rewritten from the GitHub board: Chips doesn't take pull requests, so send
  a feedback prompt, and here's where; security goes to `SECURITY.md`; you can still fork Chips and
  change it for yourself, as its licences allow. "Getting set up" stays for people building
  their own fork. "How we work" and "What CI enforces" are for us, so they move to
  `docs/working-on-chips.md`.
- **An ADR**, numbered whatever's next: Chips takes feedback prompts, not pull requests. It
  replaces the contribution parts of ADRs 0014 and 0128 (the DCO for others, and the CLA).
- **A guardrail test** that the form's ids are the ones the apps' link uses.

### Phase 2 · The apps

- **One function, `feedbackLink()`, that the phone and web both use.** It builds
  `https://github.com/arjungupta99/chips/issues/new?template=feedback-prompt.yml&version=…`,
  where the version is the Version row's words plus the system, for example "Chips 1.2.0 (410) ·
  iOS 26.1".
- **Phone.** You gets a "Send feedback" row in its own group at the foot, under the phone's group
  that holds Version. Its sub-line is "Tell the people who make Chips what you'd change." Tapping
  it opens a small sheet:
  - **Write it with \<Main agent's name\>** *(call 2)*. Opens the Main space with the line in the
    composer.
  - **Write it on GitHub** *(call 1)*. Opens the form.
  - Under both: "Chips sends nothing. GitHub opens with your Chips version filled in, and nothing
    is public until you post it there."

  If call 2 is cut, the row opens GitHub straight away and there's no sheet.
- **Web and Mac.** The same row and sheet on You. The Mac opens the link in the browser.
- **One switch, off until the repository is public.** While it's off, the row isn't drawn, so a
  TestFlight build never shows a row that leads to a 404. Going public turns it on, the way
  `site.github` waits on the site.
- **Tests.** The link at unit level, and an e2e test that the row opens the right address, with the
  opener stubbed. Run `pnpm check` and the e2e suite before landing.

### Phase 3 · The site (chips-website)

- **`/feedback`**, from the Site board:
  - The three ways: the app, any agent (the line to paste), and GitHub.
  - What a good prompt says, with the example.
  - Why prompts.
  - "After you send it", if call 4 stays.
- **`/feedback.md`, for agents.** It says:
  - What a feedback prompt is, and its three parts.
  - Ask one or two questions, then write it in the person's own words.
  - Nothing from their spaces or files goes in unless they say so.
  - End with the filled link to the form, with each field id as a query name, the person's words
    URL-encoded, and the title kept short.
  - If the link would pass about 6,000 characters (GitHub refuses long ones with 414 URI Too Long),
    give the text to paste and the form's plain link instead.
- **Elsewhere on the site.** A Feedback link in the footer. A line on Support sending ideas and
  bugs to /feedback. `llms.txt` lists feedback.md.
- **The repository link.** Every link to the form comes from `site.github`, which is already
  pending while the repository is private, so `pnpm ship` refuses until it's public.

### Phase 4 · Going public (your steps)

- Make the repository public, and turn pull requests off (call 5).
- Turn on private vulnerability reporting (call 7). It can't be on before this.
- Create the `feedback-prompt` label, which I can do with `gh` on your word.
- Turn the apps' switch on, and take `site.github` off the site's pending list.
- Open the form once from the phone, once from the site and once through an agent, and check
  each fills the boxes.

## What stays as it is

- "Not right?" on a message still goes to the agent. This is about Chips itself.
- The licences, and forks, as `LICENSING.md` has them.

## Not doing

- An inbox or an email address for feedback. You picked GitHub, and either would mean Chips
  receiving things.
- Discussions on the repository.
- A `chips feedback` command. Mac owners have the app row and the site.
