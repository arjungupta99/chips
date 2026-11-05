import { describe, expect, it } from "vitest";
import {
  FACE_GROUND_NAMES,
  FACE_GROUND_ROWS,
  faceWords,
  groundName,
  whyFaceNotSaved,
} from "./faceWords.js";

const known = (mark: string) => mark === "cup";

describe("the face picker's words", () => {
  it("names each of the 27 grounds once, and lays every one out once, nine to a row", () => {
    expect(FACE_GROUND_NAMES).toHaveLength(27);
    expect(new Set(FACE_GROUND_NAMES).size).toBe(27);
    for (const row of FACE_GROUND_ROWS) expect(row).toHaveLength(9);
    expect([...FACE_GROUND_ROWS.flat()].sort((a, b) => a - b)).toEqual(
      FACE_GROUND_NAMES.map((_, index) => index),
    );
    expect(groundName(99)).toBe("Colour 100");
  });

  it("says a face as its Icon row does", () => {
    expect(faceWords(undefined, known)).toBe("Default");
    expect(faceWords({ icon: "cup", ground: 3 }, known)).toBe("Cup on Teal");
    expect(faceWords({ icon: "", ground: 23, letters: "AB" }, known)).toBe("AB on Navy");
    expect(faceWords({ icon: "", ground: 3 }, known)).toBe("Teal");
    expect(faceWords({ icon: "comet", ground: 3 }, known)).toBe("Teal");
  });

  it("says why a pick did not stick, and an older server plainly", () => {
    expect(whyFaceNotSaved(new Error("404 No route matches that."))).toBe(
      "Not saved: this server is older than the app, and has no icons yet.",
    );
    expect(whyFaceNotSaved(new Error("Guests can't change faces."))).toBe(
      "Not saved: Guests can't change faces.",
    );
    expect(whyFaceNotSaved("nothing")).toBe("Not saved: the server would not take it.");
  });
});
