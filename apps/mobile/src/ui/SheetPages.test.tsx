/**
 * Pages in a sheet (`SheetPages.tsx`): what Jest can see of a turn, which is who is there and
 * how each stands as it starts. The spring itself is the native driver's, a mock here that
 * finishes a frame later; the simulator is where the motion is watched.
 */

import { render, screen, userEvent, waitFor } from "@testing-library/react-native";
import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import { SheetPages } from "./SheetPages";

type Page = "first" | "second";

function Pages() {
  const [page, setPage] = useState<Page>("first");
  return (
    <SheetPages
      page={page}
      keyOf={(shown) => shown}
      render={(shown) =>
        shown === "first" ? (
          <Pressable accessibilityRole="button" onPress={() => setPage("second")}>
            <Text>Deeper</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setPage("first")}>
            <Text>Back</Text>
          </Pressable>
        )
      }
    />
  );
}

/** A page's style as its turn has it now. */
function styleOf(page: Page) {
  return StyleSheet.flatten(
    screen.getByTestId(`sheet-page-${page}`, { includeHiddenElements: true }).props["style"],
  );
}

describe("pages in a sheet", () => {
  it("keeps the page it leaves, unseen by a reader, until the new one is in", async () => {
    await render(<Pages />);
    await userEvent.press(screen.getByRole("button", { name: "Deeper" }));
    expect(screen.getByRole("button", { name: "Back" })).toBeOnTheScreen();
    // Still drawn as it goes, but not there to a screen reader, and not to a finger.
    expect(screen.queryByRole("button", { name: "Deeper" })).toBeNull();
    expect(screen.getByText("Deeper", { includeHiddenElements: true })).toBeOnTheScreen();
    await waitFor(() =>
      expect(screen.queryByText("Deeper", { includeHiddenElements: true })).toBeNull(),
    );
  });

  it("turns in place: the new page starts unseen where it will stand, and nothing goes across", async () => {
    await render(<Pages />);
    await userEvent.press(screen.getByRole("button", { name: "Deeper" }));
    // Across while the sheet's top glides up or down is a slant ("the motion looks diagonal").
    expect(styleOf("second").opacity).toBe(0);
    expect(styleOf("second").transform).toBeUndefined();
    expect(styleOf("first").opacity).toBe(1);
    expect(styleOf("first").transform).toBeUndefined();
  });
});
