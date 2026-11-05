import ExpoModulesCore
import ImageIO
import UIKit
import UniformTypeIdentifiers

/**
 * A space's room, as somewhere to drop photos and files from other apps (ADR 0256, the mock's
 * section 10). What is dragged over it is said (`onDragOver`), so the room can say where it will
 * go; what is dropped is copied out of the other app into this one's temporary folder and handed
 * over as files (`onDropFiles`), which the composer stages as the + stages what it picks.
 *
 * A photo comes as the file Photos keeps, JPEG or HEIC as it was taken, a film as its movie, and
 * anything else as the file it is. A drag from inside this app is not taken: that is text being
 * moved in a field, not something brought in.
 */
final class DropView: ExpoView, UIDropInteractionDelegate {
  let onDragOver = EventDispatcher()
  let onDropFiles = EventDispatcher()
  /** Whether there is a composer to stage files in. */
  var enabled = true

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    addInteraction(UIDropInteraction(delegate: self))
  }

  func dropInteraction(_ interaction: UIDropInteraction, canHandle session: UIDropSession) -> Bool {
    enabled && session.localDragSession == nil
      && session.hasItemsConforming(toTypeIdentifiers: [UTType.item.identifier])
  }

  func dropInteraction(
    _ interaction: UIDropInteraction, sessionDidUpdate session: UIDropSession
  ) -> UIDropProposal {
    UIDropProposal(operation: .copy)
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnter session: UIDropSession) {
    onDragOver(["over": true])
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidExit session: UIDropSession) {
    onDragOver(["over": false])
  }

  func dropInteraction(_ interaction: UIDropInteraction, sessionDidEnd session: UIDropSession) {
    onDragOver(["over": false])
  }

  func dropInteraction(_ interaction: UIDropInteraction, performDrop session: UIDropSession) {
    let providers = session.items.map(\.itemProvider)
    var files = [[String: Any]?](repeating: nil, count: providers.count)
    // Each file comes in on a queue of its own.
    let lock = NSLock()
    let group = DispatchGroup()
    for (index, provider) in providers.enumerated() {
      guard let type = DropView.typeOf(provider) else { continue }
      group.enter()
      provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
        // The file is the other app's, and gone once this returns: copied out first.
        let kept = url.flatMap { DropView.keep($0, type: type, suggested: provider.suggestedName) }
        lock.lock()
        files[index] = kept
        lock.unlock()
        group.leave()
      }
    }
    group.notify(queue: .main) { [weak self] in
      self?.onDropFiles(["files": files.compactMap { $0 }])
    }
  }

  /**
   * What to ask for: a picture as it is kept, JPEG or PNG first, else a film, else whatever file it
   * is. Never one of Photos' own private kinds, which are thumbnails.
   */
  private static func typeOf(_ provider: NSItemProvider) -> UTType? {
    let types = provider.registeredTypeIdentifiers
      .filter { !$0.contains(".private.") }
      .compactMap { UTType($0) }
    if let plain = types.first(where: { $0 == .jpeg || $0 == .png }) { return plain }
    for wanted in [UTType.image, UTType.movie, UTType.content, UTType.data] {
      if let found = types.first(where: { $0.conforms(to: wanted) }) { return found }
    }
    return nil
  }

  /** The dropped file copied where it stays, with what the composer needs to know of it. */
  private static func keep(_ url: URL, type: UTType, suggested: String?) -> [String: Any]? {
    let folder = FileManager.default.temporaryDirectory
      .appendingPathComponent("dropped", isDirectory: true)
      .appendingPathComponent(UUID().uuidString, isDirectory: true)
    let ext = url.pathExtension.isEmpty ? (type.preferredFilenameExtension ?? "") : url.pathExtension
    var name = suggested ?? url.deletingPathExtension().lastPathComponent
    if !ext.isEmpty, !name.lowercased().hasSuffix(".\(ext.lowercased())") { name += ".\(ext)" }
    let kept = folder.appendingPathComponent(name)
    do {
      try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
      try FileManager.default.copyItem(at: url, to: kept)
    } catch {
      return nil
    }
    var file: [String: Any] = [
      "uri": kept.absoluteString,
      "name": name,
      "mimeType": type.preferredMIMEType ?? "application/octet-stream",
    ]
    if let size = try? kept.resourceValues(forKeys: [.fileSizeKey]).fileSize { file["size"] = size }
    if type.conforms(to: .image), let pixels = pixelSize(kept) {
      file["width"] = pixels.width
      file["height"] = pixels.height
    }
    return file
  }

  /** A picture's size in pixels, read from its header rather than by decoding it. */
  private static func pixelSize(_ url: URL) -> (width: Int, height: Int)? {
    guard let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any],
      let width = properties[kCGImagePropertyPixelWidth] as? Int,
      let height = properties[kCGImagePropertyPixelHeight] as? Int
    else { return nil }
    return (width, height)
  }
}
