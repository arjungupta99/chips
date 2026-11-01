import ExpoModulesCore
import QuickLook
import UIKit

/**
 * A file a room was sent, shown in Quick Look (ADR 0124): the viewer Files, Mail and Messages use,
 * with its pages, zoom, search and its own Share. A PDF on the phone went to the share sheet, where
 * nothing shows one; so did a Word file, a spreadsheet and every other file that is not a page.
 *
 * The file is the copy the phone already keeps (`files.ts`), named for what it is, which is how
 * Quick Look knows how to draw it. It is shown as it is and never changed: no Markup, since the
 * copy is the app's and an edit would leave the room's file behind.
 */
public class QuickLookModule: Module {
  /** What is being shown. Quick Look holds its source weakly, so the module holds it. */
  private var showing: Showing?

  public func definition() -> ModuleDefinition {
    Name("ChipsQuickLook")

    // Whether Quick Look can draw this file. One it cannot goes to the share sheet instead.
    Function("canPreview") { (uri: URL) -> Bool in
      QLPreviewController.canPreview(Item(url: uri, title: nil))
    }

    // Show the file over whatever is in front, and answer once it is up.
    AsyncFunction("preview") { (uri: URL, title: String, promise: Promise) in
      guard let top = self.appContext?.utilities?.currentViewController() else {
        promise.reject("ERR_QUICK_LOOK", "There is nothing to show the file over.")
        return
      }
      let showing = Showing(item: Item(url: uri, title: title)) { [weak self] in
        self?.showing = nil
      }
      self.showing = showing
      let controller = QLPreviewController()
      controller.dataSource = showing
      controller.delegate = showing
      top.present(controller, animated: true) {
        promise.resolve(nil)
      }
    }.runOnQueue(.main)
  }
}

/** One file, under its own name rather than the name the phone keeps it under. */
final class Item: NSObject, QLPreviewItem {
  let previewItemURL: URL?
  let previewItemTitle: String?

  init(url: URL, title: String?) {
    previewItemURL = url
    previewItemTitle = title
  }
}

/** The one file Quick Look is showing, and what to do when it has gone. */
final class Showing: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
  private let item: Item
  private let gone: () -> Void

  init(item: Item, gone: @escaping () -> Void) {
    self.item = item
    self.gone = gone
  }

  func numberOfPreviewItems(in controller: QLPreviewController) -> Int {
    1
  }

  func previewController(_ controller: QLPreviewController, previewItemAt index: Int)
    -> QLPreviewItem
  {
    item
  }

  func previewController(
    _ controller: QLPreviewController, editingModeFor previewItem: QLPreviewItem
  ) -> QLPreviewItemEditingMode {
    .disabled
  }

  func previewControllerDidDismiss(_ controller: QLPreviewController) {
    gone()
  }
}
