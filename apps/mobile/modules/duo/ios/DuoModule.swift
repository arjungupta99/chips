import ExpoModulesCore
import UIKit

/**
 * What the iPhone Duo tells an app about its screens (ADR 0256, the mock's section 11), which React
 * Native has no way to ask.
 *
 * On iOS 27.1 the Duo stands an app's bars in a column down one edge of the screen, folded or open,
 * with the status bar at its top, and adds the column's width to the safe area on that side. UIKit
 * moves its own bars there; the tabs and the + Chips draws it does not, so Chips draws them in the
 * column itself, and needs to know which edge it is on and how wide. Open, the inner screen folds
 * down the middle, and the list stands on one page and the room on the other.
 *
 * One view at the root of the window says them all (`DuoWatch`), whenever any of them changes: the
 * edge from the window's traits, its width from the window's safe area on that side, the lane in
 * it UIKit stands its own buttons in from the bar layout region, how far down UIKit stands its bars
 * across the top from the same region along the top, and the fold from the reserved
 * regions UIKit gives a view, in the window's points, active or not. The hinge moving, the traits
 * changing and the window being laid out again each ask again; what is said is said only when it
 * differs. Before iOS 27.1, and on any phone but the Duo, there is no column and no fold.
 */
public class DuoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsDuo")

    View(DuoWatch.self) {
      Events("onDuo")
    }
  }
}

final class DuoWatch: ExpoView {
  let onDuo = EventDispatcher()
  /** What was last said, so the same is not said twice. */
  private var said: NSDictionary?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    if #available(iOS 27.1, *) {
      registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) {
        (watch: DuoWatch, _: UITraitCollection) in watch.tell()
      }
      addInteraction(UIHingeInteraction { [weak self] _, _ in self?.tell() })
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    tell()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    tell()
  }

  override func safeAreaInsetsDidChange() {
    super.safeAreaInsetsDidChange()
    tell()
  }

  private func tell() {
    guard let window else { return }
    let now = NSDictionary(dictionary: Self.read(self, in: window))
    if now == said { return }
    said = now
    onDuo(now as? [String: Any] ?? [:])
  }

  /**
   * The edge as the screen draws it, left or right, since Chips lays out by left and right; the
   * column's width, the window's safe area on that side; the lane down it for buttons; and the
   * fold as a frame in the window, and whether it is kept clear.
   */
  private static func read(_ view: UIView, in window: UIWindow) -> [String: Any] {
    guard #available(iOS 27.1, *) else { return ["edge": "none", "column": 0] }
    let rightToLeft = window.effectiveUserInterfaceLayoutDirection == .rightToLeft
    let edge: String
    switch window.traitCollection.verticalBarEdge {
    case .leading: edge = rightToLeft ? "right" : "left"
    case .trailing: edge = rightToLeft ? "left" : "right"
    default: edge = "none"
    }
    let insets = window.safeAreaInsets
    let column = edge == "right" ? insets.right : edge == "left" ? insets.left : 0
    var read: [String: Any] = ["edge": edge, "column": column]
    if edge != "none" {
      read["bar"] = Self.frame(of: Self.lane(on: edge == "left" ? .left : .right, in: window))
      // The status bar is in the column, and the window's top inset is 0; UIKit still stands its
      // own bars across the top this far down, as on an iPad (24 points, folded and open).
      read["top"] = Self.barInsets(on: .top, in: window).top
    }
    // Open flat, UIKit has the fold inactive, since nothing need keep off a flat screen; the two
    // pages still meet there. Half open it is active. Either way it is 40 points down the middle,
    // the crease and 20 either side (the Duo simulator, iOS 27.2, 2 November 2026).
    let folds = view.reservedRegions(kind: .division, options: .includeInactive)
    if let fold = folds.first(where: \.isActive) ?? folds.first {
      var said = Self.frame(of: view.convert(fold.frame, to: window))
      said["active"] = fold.isActive
      read["fold"] = said
    }
    return read
  }

  /**
   * The lane down the column that UIKit stands its own buttons in: under the status at the column's
   * top, over the home indicator at its foot, 48 points wide and 24 in from the screen's edge. A
   * room's back button and a sheet's close stand in it (the Duo simulator, iOS 27.2: x 394 to 442,
   * from 174 down, folded; from 124 down, open). iOS 27.2 says its width; 27.1 is asked for 48.
   */
  @available(iOS 27.1, *)
  private static func lane(on edge: UIRectEdge, in window: UIWindow) -> CGRect {
    return window.bounds.inset(by: barInsets(on: edge, in: window))
  }

  /** The bar layout region along an edge, as insets from the window's. */
  @available(iOS 27.1, *)
  private static func barInsets(on edge: UIRectEdge, in window: UIWindow) -> UIEdgeInsets {
    if #available(iOS 27.2, *) {
      return window.edgeInsets(for: .bar(onEdge: edge))
    }
    return window.edgeInsets(for: .bar(onEdge: edge, extent: 48))
  }

  private static func frame(of rect: CGRect) -> [String: Any] {
    return ["x": rect.minX, "y": rect.minY, "width": rect.width, "height": rect.height]
  }
}
