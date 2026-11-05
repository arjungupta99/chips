/**
 * The entry point. Loads the device key before rendering, so a paired browser never flashes the
 * pairing screen on its way to the space.
 */

import { loadDevices } from "@chipschat/core";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.tsx";
import { applyStoredFaces, applyStoredTheme } from "./app/appearance.ts";
import { demoAtLaunch } from "./app/demo/kept.ts";
import { watchPresses } from "./app/dialogMotion.ts";
import { MacWindowIfAny } from "./app/MacWindow.tsx";
import { WaitingForAllow } from "./app/WaitingForAllow.tsx";
import { KitchenSink } from "./kitchen-sink/KitchenSink.tsx";
import "@chipschat/ui/styles.css";
import "./styles.css";

const root = document.getElementById("root");
if (root === null) throw new Error("index.html has no #root");

// The kitchen sink needs no key and no server: it is the design system on a page, for the
// visual regression suite and for anyone building a screen. A router arrives with M1.2.
if (location.pathname === "/kitchen-sink") {
  createRoot(root).render(
    <StrictMode>
      <KitchenSink />
    </StrictMode>,
  );
} else {
  // The appearance this computer chose, before anything is drawn, so a dark choice never opens
  // on a light page (ADR 0085). The kitchen sink sets its own, per panel.
  applyStoredTheme();
  applyStoredFaces();
  // What each press landed on, for a dialog that grows out of what opened it (ADR 0274).
  watchPresses();
  const devices = await loadDevices();
  // The demo Look around kept (ADR 0213): built again, beside the devices and never among them.
  const demo = await demoAtLaunch();
  createRoot(root).render(
    <StrictMode>
      <App devices={devices} demo={demo} />
      {/* A link that asks, waiting for its sender's Allow, over everything (ADR 0232). */}
      <WaitingForAllow />
      {/* Chips for Mac's window: the strip under its traffic lights (ADR 0267). */}
      <MacWindowIfAny />
    </StrictMode>,
  );
}
