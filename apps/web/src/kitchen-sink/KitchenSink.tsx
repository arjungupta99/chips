/**
 * `/kitchen-sink`: every component in the design system, in both themes at once, on one page.
 * The visual regression suite photographs each section here, and axe reads the whole page.
 * Nothing on it is live — the numbers and names are the golden scenario's — so a snapshot
 * taken today matches one taken next year.
 */

import {
  ApprovalCard,
  AttachmentChip,
  AutonomyDial,
  Avatar,
  applyTheme,
  Button,
  Card,
  ChipMark,
  Composer,
  ContextRing,
  Dot,
  ICON_NAMES,
  Icon,
  isTheme,
  Pill,
  QuestionCard,
  Receipt,
  RouteCard,
  StatusPill,
  TaskCard,
  THEMES,
  type Theme,
  TierBadge,
  Timeline,
} from "@chipschat/ui";
import { useEffect, useState } from "react";
import { Gallery } from "./gallery.tsx";
import "./kitchen-sink.css";

/** The components on show, in the order the plan lists them. Each is a section with this id. */
export const COMPONENTS = [
  "mark",
  "icon",
  "avatar",
  "ring",
  "pill",
  "button",
  "card",
  "tier",
  "attachment",
  "receipt",
  "timeline",
  "dial",
  "approval",
  "question",
  "composer",
  "route",
  "task",
  "media-viewer",
  "album",
] as const;

function themeFromUrl(): Theme {
  const wanted = new URLSearchParams(location.search).get("theme");
  return isTheme(wanted) ? wanted : "system";
}

export function KitchenSink() {
  const [theme, setTheme] = useState<Theme>(themeFromUrl);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <main className="sink">
      <header className="sink__head">
        <ChipMark size={28} />
        <div>
          <h1>Kitchen sink</h1>
          <p>Every component, both themes, nothing live.</p>
        </div>
        <fieldset className="sink__switch">
          <legend>Page theme</legend>
          {THEMES.map((option) => (
            <label key={option} data-on={option === theme ? "true" : undefined}>
              <input
                type="radio"
                name="page-theme"
                value={option}
                checked={option === theme}
                onChange={() => setTheme(option)}
              />
              {option}
            </label>
          ))}
        </fieldset>
      </header>
      <div className="sink__themes">
        <section
          className="sink__theme"
          data-theme="light"
          data-testid="sink-light"
          aria-label="Light"
        >
          <Gallery />
        </section>
        <section
          className="sink__theme"
          data-theme="dark"
          data-testid="sink-dark"
          aria-label="Dark"
        >
          <Gallery />
        </section>
      </div>
    </main>
  );
}

/* The pieces the gallery is built from are re-exported so `gallery.tsx` has one import line. */
export {
  ApprovalCard,
  AttachmentChip,
  AutonomyDial,
  Avatar,
  Button,
  Card,
  ChipMark,
  Composer,
  ContextRing,
  Dot,
  ICON_NAMES,
  Icon,
  Pill,
  QuestionCard,
  Receipt,
  RouteCard,
  StatusPill,
  TaskCard,
  TierBadge,
  Timeline,
};
