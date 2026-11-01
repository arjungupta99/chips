/**
 * A modal comes up over whatever is up (ADR 0232's addendum, 25 October 2026).
 *
 * React Native presents a `Modal` from the view controller that holds it. The asks at the app's
 * root, the Allow sheet among them, are held by the root, and the root is already presenting
 * whichever sheet is open: UIKit refuses a controller that is presenting, without a word, and the
 * modal counts itself presented and never asks again. Arjun's phone showed A new phone for Natalie
 * when her request came, and its Allow never rose, there or after the sheet closed.
 *
 * React Native's core comes prebuilt, so its source can't be patched; the two methods are put
 * right as the app loads. Presenting goes from the topmost controller that is up and not on its
 * way out, as UIKit asks of a presenter. Dismissing a modal with another over it goes through the
 * controller that presented it, which takes it and everything above: asked of itself, UIKit takes
 * only the one on top and leaves it up, unseen, over every touch.
 */

#import <UIKit/UIKit.h>
#import <objc/runtime.h>

/** React Native's own: the view controller a view stands in. */
@interface UIView (ChipsReactViewController)
- (UIViewController *)reactViewController;
@end

typedef void (^ChipsDone)(void);

/** The class's own method for a selector, never one it inherits. */
static Method ownMethod(Class cls, SEL selector)
{
  unsigned int count = 0;
  Method *methods = class_copyMethodList(cls, &count);
  Method found = NULL;
  for (unsigned int i = 0; i < count; i++) {
    if (method_getName(methods[i]) == selector) {
      found = methods[i];
      break;
    }
  }
  free(methods);
  return found;
}

@interface ChipsModalOverSheets : NSObject
@end

@implementation ChipsModalOverSheets

+ (void)load
{
  Class host = NSClassFromString(@"RCTModalHostViewComponentView");
  Method present = host == nil ? NULL : ownMethod(host, @selector(presentViewController:animated:completion:));
  Method dismiss = host == nil ? NULL : ownMethod(host, @selector(dismissViewController:animated:completion:));
  if (present == NULL || dismiss == NULL) {
    NSLog(@"[Chips] React Native's modal has changed: a modal over a sheet is not put right");
    return;
  }

  method_setImplementation(
      present, imp_implementationWithBlock(^(UIView *view, UIViewController *modal, BOOL animated, ChipsDone done) {
        UIViewController *from = [view reactViewController];
        while (from.presentedViewController != nil && !from.presentedViewController.isBeingDismissed) {
          from = from.presentedViewController;
        }
        [from presentViewController:modal animated:animated completion:done];
      }));

  void (*dismissAlone)(id, SEL, UIViewController *, BOOL, ChipsDone) =
      (void (*)(id, SEL, UIViewController *, BOOL, ChipsDone))method_getImplementation(dismiss);
  method_setImplementation(
      dismiss, imp_implementationWithBlock(^(UIView *view, UIViewController *modal, BOOL animated, ChipsDone done) {
        UIViewController *presenting = modal.presentingViewController;
        if (presenting != nil && modal.presentedViewController != nil) {
          [presenting dismissViewControllerAnimated:animated completion:done];
          return;
        }
        dismissAlone(view, @selector(dismissViewController:animated:completion:), modal, animated, done);
      }));
}

@end
