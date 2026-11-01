/**
 * What the relay's pages share (ADRs 0207, 0210): the app's colours, the headers, and the way a
 * page is put together, so `/join` and `/pair` are built alike and held to the same rules.
 *
 * Each page is one document with its script and style inline and nothing else: no fonts, no
 * pictures, no request to anywhere. Its Content-Security-Policy allows exactly the script and the
 * style it was served with, by their hashes, and nothing may frame it. Everything a page knows
 * comes from its fragment, which a browser never sends, so the relay serves the same bytes to
 * everybody and learns nothing of what the link carries.
 */

import { createHash } from "node:crypto";

// The app's own colours (`apps/mobile/src/ui/tokens.ts`): its ground and ink, and the gold its
// Welcome screen's Paste wears.
export const STYLE = `:root { color-scheme: light dark; --bg: #fbfbf8; --ink: #14161b; --soft: #626670; --line: #dfdfd7; --card: #ffffff; --accent: #a06306; --ahead: #fff3c3; --ahead-ink: #5c4400; }
@media (prefers-color-scheme: dark) { :root { --bg: #0f1013; --ink: #f1f2ed; --soft: #8a8d97; --line: #2a2d35; --card: #17191e; --accent: #f38b00; --ahead: #3c3005; --ahead-ink: #f7ce54; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
main { max-width: 30rem; margin: 0 auto; padding: 56px 20px; }
h1 { font-size: 28px; line-height: 1.2; margin: 0 0 10px; }
p { margin: 0 0 20px; color: var(--soft); }
a { color: var(--accent); }
.open { display: block; width: 100%; text-align: center; padding: 15px; border: 0; border-radius: 14px; background: #f7c431; color: #14161b; font: inherit; font-weight: 600; text-decoration: none; margin: 28px 0 28px; cursor: pointer; }
.note { font-size: 15px; padding-top: 16px; border-top: 1px solid var(--line); }
.code { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; border: 1px solid var(--line); border-radius: 14px; padding: 12px 16px; background: var(--card); }
.code code { font: 700 26px/1.2 ui-monospace, Menlo, monospace; letter-spacing: 3px; color: var(--ink); }
.code span { font-size: 14px; color: var(--soft); }
.ahead { font-size: 15px; background: var(--ahead); color: var(--ahead-ink); border-radius: 12px; padding: 10px 14px; }`;

export interface RelayPage {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

const hashOf = (text: string) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

/** A page as the relay serves it: one document, its own script and style, and nothing else. */
export function relayHtml(page: {
  readonly title: string;
  readonly description: string;
  readonly main: string;
  readonly script: string;
}): RelayPage {
  const body = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta property="og:title" content="${page.title}">
<meta property="og:description" content="${page.description}">
<meta property="og:site_name" content="Chips">
<title>${page.title}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
${page.main}
</main>
<script>${page.script}</script>
</body>
</html>
`;
  return {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": [
        "default-src 'none'",
        `script-src ${hashOf(page.script)}`,
        `style-src ${hashOf(STYLE)}`,
        "base-uri 'none'",
        "form-action 'none'",
        "frame-ancestors 'none'",
      ].join("; "),
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-robots-tag": "noindex",
      "cache-control": "public, max-age=300",
    },
    body,
  };
}
