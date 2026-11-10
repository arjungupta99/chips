import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

/**
 * The documentation site.
 *
 * Documentation is a product surface, not a manual (blueprint): it is tested in CI, written in
 * the product voice, and linked from every card in the app. Two things make that true rather
 * than aspirational — the reference under `reference/events/` is generated from the Zod schemas
 * by `pnpm gen:protocol`, and a broken link fails the build.
 */
export default defineConfig({
  site: "https://chipschat.ai",
  integrations: [
    starlight({
      title: "Chips",
      description:
        "A chat app where harnesses are teammates and you're in charge. Docs for people running harnesses, and for people connecting them.",
      // No "Edit page" link: Chips takes no pull requests (CONTRIBUTING.md; the onboarding audit, item 36).
      plugins: [starlightLinksValidator({ errorOnRelativeLinks: false })],
      // The design system's faces and tokens, then the file that maps them onto Starlight's.
      customCss: ["@chipschat/ui/fonts.css", "@chipschat/ui/tokens.css", "./src/styles/tokens.css"],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/arjungupta99/chips" }],
      // The eight sections of the blueprint's docs plan, in the order a reader meets them.
      sidebar: [
        { label: "Start here", items: [{ autogenerate: { directory: "start" } }] },
        { label: "Concepts", items: [{ autogenerate: { directory: "concepts" } }] },
        { label: "Connect", items: [{ autogenerate: { directory: "connect" } }] },
        {
          label: "Reference",
          items: [
            { label: "Overview", slug: "reference" },
            { label: "The envelope", slug: "reference/envelope" },
            { label: "Frames", slug: "reference/frames" },
            { label: "HTTP", slug: "reference/http" },
            { label: "The relay and the tunnel", slug: "reference/relay" },
            { label: "Events", items: [{ autogenerate: { directory: "reference/events" } }] },
          ],
        },
        { label: "Operate", items: [{ autogenerate: { directory: "operate" } }] },
        { label: "Supervise", items: [{ autogenerate: { directory: "supervise" } }] },
        { label: "Enterprise", items: [{ autogenerate: { directory: "enterprise" } }] },
        { label: "Contribute", items: [{ autogenerate: { directory: "contribute" } }] },
      ],
    }),
  ],
});
