/** The appearance chosen in You (ADR 0085): kept by this computer, and back before the first render. */

import { FACES_ATTRIBUTE, THEME_ATTRIBUTE } from "@chipschat/ui";
import { afterEach, describe, expect, it } from "vitest";
import { pageStorage } from "../testing/storage.ts";
import {
  applyStoredFaces,
  applyStoredTheme,
  chooseFaces,
  chooseTheme,
  FACES_KEY,
  storedFaces,
  storedTheme,
  THEME_KEY,
} from "./appearance.ts";

afterEach(() => {
  document.documentElement.removeAttribute(THEME_ATTRIBUTE);
  document.documentElement.removeAttribute(FACES_ATTRIBUTE);
});

describe("the appearance", () => {
  it("follows the system until one is chosen, and where there is no storage at all", () => {
    const storage = pageStorage();
    expect(storedTheme(storage)).toBe("system");
    applyStoredTheme(storage);
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expect(storedTheme(undefined)).toBe("system");
  });

  it("is applied at once, kept, and applied again on the next arrival", () => {
    const storage = pageStorage();
    chooseTheme("dark", storage);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(storage.getItem(THEME_KEY)).toBe("dark");

    document.documentElement.removeAttribute(THEME_ATTRIBUTE);
    applyStoredTheme(storage);
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");

    chooseTheme("system", storage);
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expect(storage.getItem(THEME_KEY)).toBeNull();
  });

  it("ignores a word it does not know, and carries on where storage refuses", () => {
    const storage = pageStorage();
    storage.setItem(THEME_KEY, "sepia");
    expect(storedTheme(storage)).toBe("system");

    const refusing = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => {
        throw new Error("SecurityError");
      },
    } as unknown as Storage;
    expect(storedTheme(refusing)).toBe("system");
    expect(() => chooseTheme("light", refusing)).not.toThrow();
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("light");
  });
});

describe("the faces' colours (ADR 0176)", () => {
  it("are Soothing until one is chosen, and where there is no storage at all", () => {
    const storage = pageStorage();
    expect(storedFaces(storage)).toBe("soothing");
    applyStoredFaces(storage);
    expect(document.documentElement.hasAttribute(FACES_ATTRIBUTE)).toBe(false);
    expect(storedFaces(undefined)).toBe("soothing");
  });

  it("are applied at once, kept, and applied again on the next arrival", () => {
    const storage = pageStorage();
    chooseFaces("bright", storage);
    expect(document.documentElement.getAttribute(FACES_ATTRIBUTE)).toBe("bright");
    expect(storage.getItem(FACES_KEY)).toBe("bright");

    document.documentElement.removeAttribute(FACES_ATTRIBUTE);
    applyStoredFaces(storage);
    expect(document.documentElement.getAttribute(FACES_ATTRIBUTE)).toBe("bright");

    chooseFaces("soothing", storage);
    expect(document.documentElement.hasAttribute(FACES_ATTRIBUTE)).toBe(false);
    expect(storage.getItem(FACES_KEY)).toBeNull();
  });

  it("shrug at a stored word that is not a theme", () => {
    const storage = pageStorage();
    storage.setItem(FACES_KEY, "neon");
    expect(storedFaces(storage)).toBe("soothing");
  });
});
