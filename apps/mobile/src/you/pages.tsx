/**
 * The pages You's rows open: pushed over the tab on a phone, and on an iPad beside the list, as
 * Settings opens its pages there (ADR 0256). A row asks for its page here, and on an iPad wears
 * the chosen ground while its page is the one open.
 *
 * Two kinds. People, Invite someone, Relay, Media and Connection are screens of their own on a
 * phone, pushed over the tab (`usePage`). The shorter settings are sheets on a phone, and on an
 * iPad pages beside the list too (`useSheetPage`, 3 November 2026): they came up as popovers and
 * cards over the split, and Arjun wanted them in the pane, as the Mac's and the web's went there
 * the same day. The sheet and the page hold the same body, and the part of You that holds the
 * setting hands both the same state, so a row beside its page says what the page has just
 * changed. Yes-or-no questions before something that can't be undone stay alerts.
 */

import { useRouter } from "expo-router";
import { createContext, type ReactNode, useContext } from "react";
import { StyleSheet } from "react-native";
import { Pane, type PaneAction } from "../ui/Pane";
import { Screen, UnderName, useColumn } from "../ui/Screen";
import { SPACE } from "../ui/tokens";

/** Screens of their own on a phone: pushed over the tab there, by the same name. */
export const YOU_ROUTES = ["people", "invite", "relay", "media", "connection"] as const;

/** Sheets on a phone: beside the list, they are pages too. */
export const YOU_SHEETS = [
  "face",
  "decisions",
  "quiet",
  "agents",
  "attachments",
  "exchange",
  "always",
  "feedback",
  "pair",
  "delete",
] as const;

export const YOU_PAGES = [...YOU_ROUTES, ...YOU_SHEETS] as const;

export type YouRoute = (typeof YOU_ROUTES)[number];
export type YouSheet = (typeof YOU_SHEETS)[number];
export type YouPage = YouRoute | YouSheet;

/** The pages You's parts hand the pane: each sheet's body as a page, held by the part's state. */
export type YouPages = Readonly<Partial<Record<YouSheet, ReactNode>>>;

export function isYouPage(page: string | undefined): page is YouPage {
  return YOU_PAGES.some((each) => each === page);
}

export function isYouSheet(page: string | undefined): page is YouSheet {
  return YOU_SHEETS.some((each) => each === page);
}

/**
 * What a page beside the list opens in a third column beside itself (ADR 0276): every ask so far,
 * from Allowed always's dots. On a phone each is a screen of its own, by the same name.
 */
export const YOU_THIRDS = ["asks"] as const;

export type YouThird = (typeof YOU_THIRDS)[number];

export function isYouThird(third: string | undefined): third is YouThird {
  return YOU_THIRDS.some((each) => each === third);
}

/**
 * Beside the list: the page open there, and how a row opens another, or shuts the one open; and
 * what stands in a third column beside that page, and how the page opens or shuts it.
 */
interface Beside {
  readonly open: YouPage | undefined;
  readonly go: (page: YouPage | undefined) => void;
  readonly third?: YouThird | undefined;
  readonly goThird?: (third: YouThird | undefined) => void;
}

const BesideContext = createContext<Beside | undefined>(undefined);

/** Put round You beside its pages, which then open there rather than over the tab. */
export const YouBeside = BesideContext.Provider;

/** How a row opens its page, and, beside the list, whether its page is the one open. */
export function usePage(page: YouRoute): {
  readonly onPress: () => void;
  readonly selected: boolean | undefined;
} {
  const beside = useContext(BesideContext);
  const router = useRouter();
  if (beside === undefined) return { onPress: () => router.push(`/${page}`), selected: undefined };
  return { onPress: () => beside.go(page), selected: beside.open === page };
}

/**
 * How a row whose setting is a sheet on a phone opens it: the sheet there (`sheet`), and beside
 * the list its page, which the row is chosen for while it is open. `beside` says which, and `done`
 * shuts the page where the sheet would have closed itself: after a save, or a pick that leaves.
 */
export function useSheetPage(
  page: YouSheet,
  sheet: () => void,
): {
  readonly onPress: () => void;
  readonly selected: boolean | undefined;
  readonly beside: boolean;
  readonly done: () => void;
} {
  const beside = useContext(BesideContext);
  if (beside === undefined) {
    return { onPress: sheet, selected: undefined, beside: false, done: () => undefined };
  }
  return {
    onPress: () => beside.go(page),
    selected: beside.open === page,
    beside: true,
    done: () => beside.go(undefined),
  };
}

/**
 * How a page's row opens what it opens a level deeper: beside the list, in a third column beside
 * the page, which the row is chosen for while it stands there; on a phone, `phone`, which leaves
 * the sheet for the screen of the same name.
 */
export function useThirdPage(
  third: YouThird,
  phone: () => void,
): { readonly onPress: () => void; readonly selected: boolean | undefined } {
  const beside = useContext(BesideContext);
  const goThird = beside?.goThird;
  if (goThird === undefined) return { onPress: phone, selected: undefined };
  return { onPress: () => goThird(third), selected: beside?.third === third };
}

/** The page open beside the list, if any: what a row's value may have changed on. */
export function useOpenPage(): YouPage | undefined {
  return useContext(BesideContext)?.open;
}

/**
 * A sheet's body as a page beside the list: under the pane's bar, which names it where the sheet's
 * head did and holds its Save, on the grouped ground, scrolled as the other pages are. The sheet's
 * X has no place here: another row is the way away, as in Settings. `over` stands over the
 * scroll rather than in it: Allowed always's Undo. A body that scrolls a part of itself, as the
 * face picker scrolls its marks under the colours, is laid out in the page as it is in its sheet
 * (`scrolls`): in a scroll of the page's, its own list had no height to scroll in.
 */
export function SheetPage({
  title,
  action,
  over,
  scrolls = true,
  testID,
  children,
}: {
  readonly title: string;
  readonly action?: PaneAction | undefined;
  readonly over?: ReactNode;
  readonly scrolls?: boolean;
  readonly testID: string;
  readonly children: ReactNode;
}) {
  const column = useColumn();
  return (
    <Pane title={title} action={action} grouped>
      <Screen grouped testID={testID}>
        {scrolls ? (
          <UnderName
            contentContainerStyle={[styles.page, column]}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            {children}
          </UnderName>
        ) : (
          children
        )}
        {over}
      </Screen>
    </Pane>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: SPACE.lg, paddingBottom: SPACE.xxl * 2 },
});
