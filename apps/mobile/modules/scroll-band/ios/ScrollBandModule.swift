import ExpoModulesCore
import UIKit

/**
 * The glass under a tab's name, lowered into place as the list under it scrolls (ADR 0098).
 *
 * At rest the band stands a ramp's length higher than its place, its ramp tucked into the name,
 * and it comes down over the list's first points of scroll. That used to be a native-driven
 * `Animated.event` from the list to the band's transform, which on Arjun's iPhone sometimes left
 * the band up while the list went under it. Here nothing between the two is React Native's: the
 * view watches the scroll view's own offset, reads where rest is from UIKit's adjusted inset rather
 * than assuming the status bar's, and moves what it holds by its layer's `sublayerTransform`, a
 * property React never writes.
 */
public class ScrollBandModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsScrollBand")

    View(ScrollBandView.self) {
      // The list's React tag. Nothing until the list has mounted.
      Prop("scrollView") { (view: ScrollBandView, tag: Int?) in
        view.scrollViewTag = tag
      }

      // How far the band stands above its place at rest, and how far the list scrolls to lower it.
      Prop("ramp") { (view: ScrollBandView, ramp: Double) in
        view.ramp = CGFloat(ramp)
      }
    }
  }
}

final class ScrollBandView: ExpoView {
  private weak var list: UIScrollView?
  private var watch: NSKeyValueObservation?

  var scrollViewTag: Int? {
    didSet {
      if scrollViewTag != oldValue { follow() }
    }
  }

  var ramp: CGFloat = 0 {
    didSet { place() }
  }

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
  }

  deinit {
    watch?.invalidate()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    follow()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    // The list's view may be found only once the mount that made it has finished.
    if list == nil { follow() }
    place()
  }

  private func follow() {
    watch?.invalidate()
    watch = nil
    list = nil
    if window != nil, let tag = scrollViewTag, let scrollView = find(tag) {
      list = scrollView
      // Every change of offset, by a finger, a fling, a jump to the top or UIKit adjusting the
      // inset, and on the main thread in the same frame as the list moves.
      watch = scrollView.observe(\.contentOffset) { [weak self] _, _ in
        self?.place()
      }
    }
    place()
  }

  private func place() {
    var moved: CGFloat = 0
    if let list {
      moved = list.contentOffset.y + list.adjustedContentInset.top
    }
    let lowered = ramp > 0 ? min(max(moved / ramp, 0), 1) : 1
    layer.sublayerTransform = CATransform3DMakeTranslation(0, -ramp * (1 - lowered), 0)
  }

  /** React's scroll view is a component view holding UIKit's, one level down. */
  private func find(_ tag: Int) -> UIScrollView? {
    guard let view = appContext?.findView(withTag: tag, ofType: UIView.self) else { return nil }
    if let scrollView = view as? UIScrollView { return scrollView }
    return view.subviews.lazy.compactMap { $0 as? UIScrollView }.first
  }
}
