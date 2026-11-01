import { describe, expect, it } from "vitest";
import {
  applyFaces,
  applyTheme,
  currentTheme,
  FACES_ATTRIBUTE,
  isFaceTheme,
  isTheme,
  THEME_ATTRIBUTE,
  THEMES,
} from "./theme.js";

describe("applying a theme", () => {
  it("writes light and dark as the attribute the stylesheet reads", () => {
    const element = document.createElement("div");
    applyTheme("dark", element);
    expect(element.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(currentTheme(element)).toBe("dark");
    applyTheme("light", element);
    expect(element.getAttribute(THEME_ATTRIBUTE)).toBe("light");
  });

  it("removes the attribute for system, so the media query decides", () => {
    const element = document.createElement("div");
    applyTheme("dark", element);
    applyTheme("system", element);
    expect(element.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
    expect(currentTheme(element)).toBe("system");
  });

  it("defaults to the document root", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute(THEME_ATTRIBUTE)).toBe("dark");
    expect(currentTheme()).toBe("dark");
    applyTheme("system");
    expect(document.documentElement.hasAttribute(THEME_ATTRIBUTE)).toBe(false);
  });

  it("reads an unknown attribute value as system", () => {
    const element = document.createElement("div");
    element.setAttribute(THEME_ATTRIBUTE, "sepia");
    expect(currentTheme(element)).toBe("system");
  });

  it("knows its own names", () => {
    for (const theme of THEMES) expect(isTheme(theme)).toBe(true);
    expect(isTheme("sepia")).toBe(false);
    expect(isTheme(1)).toBe(false);
  });
});

describe("applying the faces' colours (ADR 0176)", () => {
  it("writes Bright on the root, and takes it off again for Soothing, which is no attribute", () => {
    applyFaces("bright");
    expect(document.documentElement.getAttribute(FACES_ATTRIBUTE)).toBe("bright");
    applyFaces("soothing");
    expect(document.documentElement.hasAttribute(FACES_ATTRIBUTE)).toBe(false);
  });

  it("writes either on an element, so a preview holds its faces in its own", () => {
    const element = document.createElement("span");
    applyFaces("soothing", element);
    expect(element.getAttribute(FACES_ATTRIBUTE)).toBe("soothing");
  });

  it("knows its two themes and nothing else", () => {
    expect(isFaceTheme("bright")).toBe(true);
    expect(isFaceTheme("soothing")).toBe(true);
    expect(isFaceTheme("neon")).toBe(false);
  });
});
