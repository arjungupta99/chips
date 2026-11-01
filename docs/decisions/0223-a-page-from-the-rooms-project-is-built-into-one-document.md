# 0223. A page from the room's project is built into one document before it opens

Date: 23 October 2026
Status: Accepted, 23 October 2026: the plan's call 6 (esbuild in the server), on Arjun's word
"proceed with the full implementation of all remaining phases sequentially and fine to push as
well". The plan is [agents-share-a-project-plan.md](../proposals/agents-share-a-project-plan.md),
Phase 6, "A page from the project runs on the phone". The project is
[ADR 0220](0220-a-rooms-project-is-a-git-repository-chips-holds.md), how a person reads it
[ADR 0222](0222-a-change-goes-with-the-reply-that-made-it.md), and a page's policy
[ADR 0059](0059-a-page-a-harness-sends-opens-on-the-phone-in-a-view-that-reaches-nothing.md) and
[ADR 0201](0201-a-page-a-harness-sends-is-served-from-a-door-of-its-own.md).

## Context

A page runs as one document under `HTML_POLICY`: its own inline script and styles, pictures and
fonts as `data:`, and no network. A game the agents build in a room's project is several files
(`index.html`, `style.css`, `src/game.js` importing `./board.js`), so `index.html` opened alone
shows its markup with no script and no styles.

## Decision

1. **chipsd builds the page.** Opening an HTML file of the project reads it, and every file it
   names by a path inside the project, from the room's repository at `main` or at the change asked
   for, and folds them in:
   - a stylesheet (`<link rel="stylesheet">`) as `<style>`, its `@import`s and `url()`s folded in
     the same way;
   - a script (`<script src>`) inline;
   - a module script, by `src` or inline, bundled with the modules it imports into one module
     (esbuild, in the server); a module a script imports that is not in the project, such as a
     package name or an address, is left as it is;
   - pictures, media, icons and fonts (`src`, `poster`, `srcset`, an icon's `href`, `url()` in
     `<style>` and `style=""`) as `data:` URLs.

   Paths are the page's own: relative to the file naming them, or to the project's top for one
   starting `/`. Anything else, an address on the internet or a path out of the project, is left
   as it is, and the policy keeps it from loading. A file the page names that isn't there is left
   as it is too, and the page opens without it.

2. **Two ways to get it**, both a person's in the room, signed by their device, as ADR 0222's
   reads are:
   - `GET /v1/spaces/:id/project/page?path=&at=`: the built document, for the phone, which writes
     it into its view under the policy (`withHtmlPolicy`), and for a device through a tunnel.
   - `POST /v1/spaces/:id/project/page {path, at?}`: a page door ticket (ADR 0201) holding the
     built document, for a frame on the web, which loads it with the policy as a header. The Mac
     holds the document in its own door (`holdPage`).

3. **Limits.** The built document is held to the upload limit. A page that fetches its files while
   it runs (`fetch('levels.json')`) doesn't find them: only what it names in its tags, its
   stylesheets and its imports is folded in. The room's project note already asks agents to name
   what a page needs.

4. **esbuild is a dependency of the server**, installed beside the bundle as SQLite and sharp are
   (the release's `NATIVE`), and loaded when a page first needs a bundle. Where it can't load, a
   page with no imports between its scripts still opens, and one with them says why it can't.

## Consequences

- A game built in a room opens from Files, from a change, or from a file's history and runs, on
  the phone, the web and the Mac, under the same policy as any page.
- Nothing about what a page may reach changes: it is still one document with no network.
- The server parses HTML (parse5) and bundles scripts (esbuild) for a person who asked, at most the
  upload limit's worth per page.
