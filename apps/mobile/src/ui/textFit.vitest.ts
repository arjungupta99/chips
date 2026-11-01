/**
 * `modules/text-fit` puts a paragraph's frame back on the pixel grid before React Native's iOS
 * text layout makes a container of it (PH-23). That holds only while React Native makes every
 * container in the one method it replaces, measures in one of unbounded height, and draws in one of
 * the frame's size: read in React Native's own source, so an upgrade that changes any of it says so
 * here rather than as a paragraph missing its last line.
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("the text layout `text-fit` steps into", () => {
  const root = dirname(createRequire(import.meta.url).resolve("react-native/package.json"));
  const source = readFileSync(
    join(
      root,
      "ReactCommon/react/renderer/textlayoutmanager/platform/ios/react/renderer/textlayoutmanager/RCTTextLayoutManager.mm",
    ),
    "utf8",
  );
  const fit = readFileSync(
    fileURLToPath(new URL("../../modules/text-fit/ios/ChipsTextFit.mm", import.meta.url)),
    "utf8",
  );

  it("makes its containers in the method text-fit replaces, taking what text-fit passes", () => {
    expect(source).toMatch(
      /- \(NSTextStorage \*\)_textStorageAndLayoutManagerWithAttributesString:\(NSAttributedString \*\)attributedString\s+paragraphAttributes:\(ParagraphAttributes\)paragraphAttributes\s+size:\(CGSize\)size\s*\{\s*NSTextContainer \*textContainer = \[\[NSTextContainer alloc\] initWithSize:size\];/,
    );
    expect(source.match(/initWithSize:/g)).toHaveLength(1);
    expect(fit).toContain(
      '@"_textStorageAndLayoutManagerWithAttributesString:paragraphAttributes:size:"',
    );
  });

  it("measures in a container of unbounded height, which text-fit passes on as it came", () => {
    expect(source).toMatch(
      /CGSize maximumSize = CGSize\{layoutConstraints\.maximumSize\.width, CGFLOAT_MAX\};\s*NSTextStorage \*textStorage = \[self _textStorageAndLayoutManagerWithAttributesString:attributedString\s+paragraphAttributes:paragraphAttributes\s+size:maximumSize\];/,
    );
    expect(fit).toContain("if (size.height < CGFLOAT_MAX) {");
  });

  it("draws, finds a touch and reads a rect in a container the size of the frame", () => {
    expect(source.match(/size:frame\.size\]/g)).toHaveLength(3);
  });
});
