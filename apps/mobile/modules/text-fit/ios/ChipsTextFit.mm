/**
 * A paragraph drawn whole when its frame comes out a hair short of its lines (PH-23).
 *
 * React Native measures a paragraph's text with TextKit in a container of unbounded height, and
 * then draws it, reads its lines and finds what a touch is on in a container exactly the size of
 * its frame (`RCTTextLayoutManager`, `_textStorageAndLayoutManagerWithAttributesString:…size:`).
 * The frame comes from Yoga, which puts it on the screen's pixel grid in single precision: a
 * paragraph standing a few thousand points down the room's list came out 87.99976 pt tall for four
 * lines of 22. TextKit then had no room for the fourth line, and since a paragraph with no line
 * limit is clipped (`NSLineBreakByClipping`), its words were crammed into the third line and cut
 * ("…stands ta"), with an empty line under it.
 *
 * React Native ships prebuilt here, so its source cannot be patched. This replaces that one method
 * at launch with one that puts a frame's size back on the grid it was meant to stand on, whole
 * sixths of a point (a pixel is a third of one on every iPhone and a half on every iPad), and then
 * calls React Native's own. A size only ever grows, by less than a twelfth of a point, and a
 * measurement (unbounded height) is passed on as it came. If a React Native upgrade renames the
 * method or changes what it takes, nothing is replaced and text is drawn as React Native draws it;
 * `src/ui/textFit.vitest.ts` says so in the gate.
 */

#import <objc/runtime.h>

#import <react/renderer/textlayoutmanager/RCTTextLayoutManager.h>

using facebook::react::ParagraphAttributes;

using TextStorageMaker = NSTextStorage *(*)(id, SEL, NSAttributedString *, ParagraphAttributes, CGSize);

static TextStorageMaker reactNatives;

/** A frame's length back on the grid of sixths, when it came out a hair under a line of it. */
static CGFloat onGrid(CGFloat length)
{
  return MAX(length, round(length * 6) / 6);
}

static NSTextStorage *
textStorage(id self, SEL _cmd, NSAttributedString *string, ParagraphAttributes attributes, CGSize size)
{
  if (size.height < CGFLOAT_MAX) {
    size = CGSizeMake(onGrid(size.width), onGrid(size.height));
  }
  return reactNatives(self, _cmd, string, attributes, size);
}

/** Whether the method takes what `textStorage` passes it: the same arguments, laid out alike. */
static BOOL takesWhatIsPassed(Method method)
{
  if (method_getNumberOfArguments(method) != 5) {
    return NO;
  }
  char *returns = method_copyReturnType(method);
  char *string = method_copyArgumentType(method, 2);
  char *attributes = method_copyArgumentType(method, 3);
  char *size = method_copyArgumentType(method, 4);
  BOOL alike = strcmp(returns, @encode(NSTextStorage *)) == 0 && strcmp(string, @encode(NSAttributedString *)) == 0 &&
      strcmp(attributes, @encode(ParagraphAttributes)) == 0 && strcmp(size, @encode(CGSize)) == 0;
  free(returns);
  free(string);
  free(attributes);
  free(size);
  return alike;
}

@interface ChipsTextFit : NSObject
@end

@implementation ChipsTextFit

+ (void)load
{
  SEL selector = NSSelectorFromString(@"_textStorageAndLayoutManagerWithAttributesString:paragraphAttributes:size:");
  Method method = class_getInstanceMethod([RCTTextLayoutManager class], selector);
  if (method == NULL || !takesWhatIsPassed(method)) {
    NSLog(@"[ChipsTextFit] React Native's text layout has changed; text is drawn as it draws it (PH-23)");
    return;
  }
  reactNatives = (TextStorageMaker)method_getImplementation(method);
  method_setImplementation(method, (IMP)textStorage);
}

@end
