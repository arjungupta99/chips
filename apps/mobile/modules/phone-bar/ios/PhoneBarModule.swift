import ExpoModulesCore
import UIKit

/**
 * What the tab bar this app draws on an iPhone asks of UIKit (ADR 0233).
 *
 * UIKit's own bar is still there, hidden under the drawn one, and still does the switching. A press
 * on the drawn bar chooses the tab as a finger on UIKit's bar would (`choose`): UIKit shows it at
 * once, and the navigator hears of it after, so a tab comes up in the frame it is pressed rather
 * than once React has drawn it. Asked through the router, it came up a quarter of a second late (the
 * simulator, 25 October 2026). The tab in front pressed again goes the same way, and its list goes
 * back to the top, as it did under UIKit's bar: by the watcher standing in it, since the delegate
 * looks for a list only down the first view of each and missed the Agents tab's.
 *
 * And it says whether a tab's list is being read (`ReadingView`), so the bar can shrink while it is.
 */
public class PhoneBarModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsPhoneBar")

    // The tab named `title`, chosen as a finger on UIKit's bar chooses it. False when there is no
    // such tab, and the router is asked instead.
    AsyncFunction("choose") { (title: String) -> Bool in
      PhoneBarModule.choose(title)
    }.runOnQueue(.main)

    View(ReadingView.self) {
      Events("onReading")
    }
  }

  /**
   * What UIKit does with a finger on a tab: asks its delegate, selects, and tells its delegate.
   * The delegate here is react-native-screens' controller, which keeps the navigator in step.
   */
  static func choose(_ title: String) -> Bool {
    guard let tabs = tabBarController(),
      let tab = tabs.viewControllers?.first(where: { $0.tabBarItem.title == title })
    else { return false }
    if tabs.selectedViewController === tab { ReadingView.toTop() }
    if tabs.delegate?.tabBarController?(tabs, shouldSelect: tab) == false { return true }
    tabs.selectedViewController = tab
    tabs.delegate?.tabBarController?(tabs, didSelect: tab)
    return true
  }

  private static func tabBarController() -> UITabBarController? {
    let windows = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
    for window in windows.sorted(by: { $0.isKeyWindow && !$1.isKeyWindow }) {
      if let found = find(in: window.rootViewController) { return found }
    }
    return nil
  }

  private static func find(in controller: UIViewController?) -> UITabBarController? {
    guard let controller else { return nil }
    if let tabs = controller as? UITabBarController { return tabs }
    for child in controller.children {
      if let found = find(in: child) { return found }
    }
    return nil
  }
}

/**
 * Whether a tab's list is being read down, said from the scroll view itself. Every offset of the
 * list passes through here and none through React: the view stands at the foot of the list's
 * content (`PlusRoom`), finds the scroll view it is in by walking up, watches its offset, and speaks
 * only when the answer changes, a few times a scroll at most. The bar's spring runs on the UI thread
 * from there.
 */
final class ReadingView: ExpoView {
  /** Every one standing in a list, so a second press of the tab in front can find its list. */
  private static let standing = NSHashTable<ReadingView>.weakObjects()

  /**
   * How far the list goes down in one movement before it is being read (24 points), how far back
   * up before it is not (16), and the stretch at the top where it never is (40 points: past the
   * first row). Back within 24 points of the top, the bar comes back whichever way the list went.
   */
  private static let down: CGFloat = 24
  private static let up: CGFloat = 16
  private static let pastFirstRow: CGFloat = 40
  private static let top: CGFloat = 24

  let onReading = EventDispatcher()

  private weak var list: UIScrollView?
  private var watch: NSKeyValueObservation?
  /** The offset last seen, the movement it is part of, and whether that movement has spoken. */
  private var last: CGFloat = 0
  private var run: CGFloat = 0
  private var spoken = false
  private var atTop = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    isUserInteractionEnabled = false
    ReadingView.standing.add(self)
  }

  deinit {
    watch?.invalidate()
  }

  /** The list on screen back to its top. */
  static func toTop() {
    for view in standing.allObjects where view.window != nil {
      guard let list = view.list else { continue }
      list.setContentOffset(
        CGPoint(x: list.contentOffset.x, y: -list.adjustedContentInset.top), animated: true)
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    follow()
  }

  override func didMoveToSuperview() {
    super.didMoveToSuperview()
    follow()
  }

  private func follow() {
    let found = window == nil ? nil : enclosing()
    if found === list { return }
    watch?.invalidate()
    watch = nil
    list = found
    run = 0
    spoken = false
    atTop = false
    guard let found else { return }
    last = clamped(found)
    // Every change of offset, by a finger, a fling, a jump to the top or UIKit adjusting the inset,
    // on the main thread in the frame the list moves.
    watch = found.observe(\.contentOffset) { [weak self] list, _ in
      self?.moved(list)
    }
  }

  /** The nearest scroll view above this one: the list whose content it stands at the foot of. */
  private func enclosing() -> UIScrollView? {
    var view = superview
    while let current = view {
      if let scrollView = current as? UIScrollView { return scrollView }
      view = current.superview
    }
    return nil
  }

  /** How far down the list is from its top, a bounce past either end taken off. */
  private func clamped(_ list: UIScrollView) -> CGFloat {
    let inset = list.adjustedContentInset
    let top = -inset.top
    let bottom = max(top, list.contentSize.height + inset.bottom - list.bounds.height)
    return min(max(list.contentOffset.y, top), bottom) - top
  }

  private func moved(_ list: UIScrollView) {
    let y = clamped(list)
    let dy = y - last
    last = y
    guard window != nil else { return }
    if y < ReadingView.top {
      run = 0
      spoken = false
      if !atTop {
        atTop = true
        say(false)
      }
      return
    }
    atTop = false
    if dy == 0 { return }
    // A turn starts a new movement, which may speak once.
    if (dy > 0) != (run > 0) {
      run = 0
      spoken = false
    }
    run += dy
    if spoken { return }
    if run > ReadingView.down && y > ReadingView.pastFirstRow {
      spoken = true
      say(true)
    } else if run < -ReadingView.up {
      spoken = true
      say(false)
    }
  }

  private func say(_ reading: Bool) {
    onReading(["reading": reading])
  }
}
