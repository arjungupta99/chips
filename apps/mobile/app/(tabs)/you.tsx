/**
 * The You tab. The screen itself is `src/you/You.tsx`; this is the route.
 *
 * On an iPad the list stands beside the page its row opens, as Settings does (ADR 0256): People,
 * Invite someone, Relay, Media and Connection open in the pane (`YouPane`), kept by the tabs as
 * Spaces keeps its room (`ui/opened.tsx`), and so do the rows' sheets, as pages (ADR 0276). A
 * person opened from People stands in a third column beside it, and so does every ask so far,
 * opened from Allowed always.
 * One You draws the list and hands the pane those pages (`useYou`), so a row and its page are one
 * state.
 */

import type { Device, Store } from "@chipschat/core";
import type { FileService } from "../../src/spaces/files";
import { useChips } from "../../src/store/provider";
import { useLayout } from "../../src/ui/layout";
import { type Opened, useOpened } from "../../src/ui/opened";
import { Split } from "../../src/ui/Split";
import { isYouPage, isYouThird, YouBeside } from "../../src/you/pages";
import { useYou, You } from "../../src/you/You";
import { YOU_OPEN, YouPane, youThird } from "../../src/you/YouPane";

export default function YouScreen() {
  const { paired } = useChips();
  const { wide } = useLayout();
  if (paired === undefined) return null;
  if (!wide) return <You device={paired.device} store={paired.store} />;
  return <Beside device={paired.device} store={paired.store} files={paired.files} />;
}

function Beside({
  device,
  store,
  files,
}: {
  readonly device: Device;
  readonly store: Store;
  readonly files: FileService;
}) {
  const [opened, go] = useOpened("you", YOU_OPEN);
  const page = opened["page"];
  const third = opened["third"];
  return (
    <YouBeside
      value={{
        open: isYouPage(page) ? page : undefined,
        go: (next) => go(next === undefined ? {} : { page: next }),
        third: isYouThird(third) ? third : undefined,
        // Another column's open in place of the one there; shut, the page stands alone again.
        goThird: (next) => go(next === undefined ? { page } : { page, third: next }),
      }}
    >
      <Halves device={device} store={store} files={files} opened={opened} go={go} />
    </YouBeside>
  );
}

/** The list and the page beside it, inside `YouBeside`, which the list's rows read. */
function Halves({
  device,
  store,
  files,
  opened,
  go,
}: {
  readonly device: Device;
  readonly store: Store;
  readonly files: FileService;
  readonly opened: Opened;
  readonly go: (next: Opened) => void;
}) {
  const you = useYou({ device, store });
  return (
    <Split
      tab="you"
      list={you.screen}
      detail={
        <YouPane
          device={device}
          store={store}
          files={files}
          opened={opened}
          go={go}
          pages={you.pages}
        />
      }
      third={youThird({ device, store, opened, go })}
    />
  );
}
