import ExpoModulesCore
import UIKit

/**
 * Words handed to the share sheet, which slides up from the bottom of the glass like the app's
 * other sheets (Arjun, 6 October 2026: "It needs to slide in from bottom").
 *
 * Since iOS 26 the share sheet grows out of whatever was last pressed, here a row of the
 * message's menu, and it does that however it is asked to come in: as a page sheet, with a
 * cover-vertical transition, pointed at the foot of the screen, or presented by React Native's
 * `Share.share`. All of those were filmed on the simulator, and it grew out of the row each
 * time. So the sheet that slides up is one of ours, a page sheet with the share sheet inside it.
 * Apple asks for the share sheet to be presented rather than held, so a later iOS may draw it
 * oddly in here. What it should look like: the sheet slides up with the share sheet's own card
 * in it, and its ✕, a swipe down, or an action done closes it.
 */
public class ShareSheetModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ChipsShareSheet")

    // Show the sheet with these words, and answer once it has gone, shared or not.
    AsyncFunction("shareText") { (text: String, promise: Promise) in
      guard let top = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_SHARE_SHEET", "There is nothing to show the share sheet over.")
        return
      }
      let holder = Holder(text: text) { promise.resolve(nil) }
      top.present(holder, animated: true)
    }.runOnQueue(.main)
  }
}

/** A page sheet holding the share sheet, which says once that it has gone. */
final class Holder: UIViewController, UIAdaptivePresentationControllerDelegate {
  private let share: UIActivityViewController
  private var gone: (() -> Void)?

  init(text: String, gone: @escaping () -> Void) {
    share = UIActivityViewController(activityItems: [text], applicationActivities: nil)
    self.gone = gone
    super.init(nibName: nil, bundle: nil)
    modalPresentationStyle = .pageSheet
    sheetPresentationController?.detents = [.medium(), .large()]
    // Swiped down, the holder is gone without the share sheet having said so.
    presentationController?.delegate = self
    // Shared, cancelled with its own ✕, or an action left half way: the share sheet is done.
    share.completionWithItemsHandler = { [weak self] _, _, _, _ in
      self?.dismiss(animated: true)
      self?.finish()
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) {
    fatalError("A holder is made in code.")
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    // The share sheet draws its own card; the holder draws nothing under it.
    view.backgroundColor = .clear
    addChild(share)
    share.view.frame = view.bounds
    share.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(share.view)
    share.didMove(toParent: self)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finish()
  }

  private func finish() {
    gone?()
    gone = nil
  }
}
