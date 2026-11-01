import ExpoModulesCore
import UIKit

/**
 * A blur and nothing over it (ADR 0129): what is behind, softened, in its own colours.
 *
 * Every blur UIKit offers in public is a material, and a material is a blur with a tint laid over
 * it so that words on it read. On a dark page the tint is grey, and the band under a tab's name
 * stood out as a grey shelf over the black (Arjun, 6 October 2026). The mock it was dialled on
 * blurred with nothing over it (`backdrop-filter: blur()`), so this does too: UIKit's own blur at a
 * radius, `+[UIBlurEffect effectWithBlurRadius:]`, which leaves one filter on the backdrop, the
 * Gaussian. It is not in UIKit's headers. It is looked up by name and its signature checked, and an
 * iOS without it gets the thinnest material, which is the look the band had before.
 *
 * `_UICustomBlurEffect`, the class this kind of blur used to be made with, is still there on iOS
 * 26.5, but its setters do nothing: made that way the band was the room unblurred and grey, at
 * saturation nought.
 */
public class ClearBlurModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsClearBlur")

    View(ClearBlurView.self) {
      // The blur's radius in points: a true radius, not a material's intensity.
      Prop("radius") { (view: ClearBlurView, radius: Double) in
        view.radius = CGFloat(radius)
      }
    }
  }
}

final class ClearBlurView: ExpoView {
  private let glass = UIVisualEffectView(effect: nil)

  var radius: CGFloat = -1 {
    didSet {
      if radius != oldValue { glass.effect = clearBlur(radius) }
    }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    glass.frame = bounds
    glass.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(glass)
  }
}

/** UIKit's blur at `radius` with nothing over it; the thinnest material on an iOS without it. */
private func clearBlur(_ radius: CGFloat) -> UIVisualEffect {
  let make = NSSelectorFromString("effectWithBlurRadius:")
  guard
    let method = class_getClassMethod(UIBlurEffect.self, make),
    // An object back, from the class, its selector and one double: `@24@0:8d16` on arm64.
    let types = method_getTypeEncoding(method).map({ String(cString: $0) }),
    types.hasPrefix("@"), types.contains("d")
  else {
    return UIBlurEffect(style: .systemUltraThinMaterial)
  }
  typealias Make = @convention(c) (AnyClass, Selector, CGFloat) -> UIBlurEffect
  let effect = unsafeBitCast(method_getImplementation(method), to: Make.self)
  return effect(UIBlurEffect.self, make, max(0, radius))
}
