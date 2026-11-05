import ExpoModulesCore
import UIKit

/**
 * What an iPad with a keyboard asks of UIKit (ADR 0256, the mock's section 10): the menu bar
 * iPadOS 26 shows at the top of the screen, and the shortcuts in it, which iPadOS lists when ⌘ is
 * held. React Native has no way to add either.
 *
 * The commands are JavaScript's (`src/ui/menuBar.ts`): their names, their keys, which menu each
 * stands in, and whether the screen in front can do it now. They are handed over whole whenever
 * that changes, and the menus are built again from them. A command chosen, from the menu or by its
 * keys, is said back by its id (`onCommand`), and JavaScript does it.
 *
 * Every command acts through one selector that the application itself answers, so wherever the
 * focus is, a field included, the command reaches it; one that cannot be done now is drawn dimmed
 * and does nothing. Before iPadOS 26 there is no menu bar to build, and nothing is.
 *
 * And photos and files dropped onto a space from other apps (`DropView`).
 */
public class MenuBarModule: Module {
  /** The one there is, to say a command back through. */
  fileprivate static weak var current: MenuBarModule?
  /** The commands as last handed over. */
  private static var commands: [MenuCommand] = []
  private static var installed = false

  public func definition() -> ModuleDefinition {
    Name("ChipsMenuBar")

    Events("onCommand")

    OnCreate {
      MenuBarModule.current = self
    }

    AsyncFunction("setCommands") { (commands: [MenuCommand]) in
      MenuBarModule.commands = commands
      MenuBarModule.rebuild()
    }.runOnQueue(.main)

    View(DropView.self) {
      Events("onDragOver", "onDropFiles")
      Prop("enabled") { (view: DropView, enabled: Bool) in
        view.enabled = enabled
      }
    }
  }

  /** A command chosen: said back to JavaScript by its id. */
  fileprivate static func chosen(_ id: String) {
    current?.sendEvent("onCommand", ["id": id])
  }

  private static func rebuild() {
    guard #available(iOS 26.0, *) else { return }
    let system = UIMainMenuSystem.shared
    if !installed {
      installed = true
      let configuration = UIMainMenuSystem.Configuration()
      // A new space, not a new window, is ⌘N here; and the app has no document, printing,
      // formatting, finding in a page or toolbar of its own to offer. Its list and details are
      // React's, not a split view's, so the system's Show Sidebar and Show Inspector would do
      // nothing, and they hold the keys the Space menu's Hide List has (⌃⌘S): a menu with keys
      // another already has is left out whole.
      configuration.newScenePreference = .removed
      configuration.documentPreference = .removed
      configuration.printingPreference = .removed
      configuration.textFormattingPreference = .removed
      configuration.findingPreference = .removed
      configuration.toolbarPreference = .removed
      configuration.sidebarPreference = .removed
      configuration.inspectorPreference = .removed
      system.setBuildConfiguration(configuration) { builder in
        MenuBarModule.build(builder)
      }
    } else {
      system.setNeedsRebuild()
    }
  }

  /**
   * The tabs at the top of View, then the Space menu after it, each run of commands a group of its
   * own between separators. A command for no menu (`hidden`), Esc's, has its keys and no row.
   */
  private static func build(_ builder: UIMenuBuilder) {
    let view = groups(in: "view")
    if !view.isEmpty {
      builder.insertChild(UIMenu(options: .displayInline, children: view), atStartOfMenu: .view)
    }
    let space = groups(in: "space")
    if !space.isEmpty {
      let menu = UIMenu(
        title: "Space", identifier: UIMenu.Identifier("chat.chips.space"), children: space)
      builder.insertSibling(menu, afterMenu: .view)
    }
    let hidden = commands.filter { $0.menu == "hidden" }.map(keyCommand)
    if !hidden.isEmpty {
      builder.insertChild(UIMenu(options: .displayInline, children: hidden), atEndOfMenu: .view)
    }
  }

  private static func groups(in menu: String) -> [UIMenuElement] {
    let inMenu = commands.filter { $0.menu == menu }
    let numbers = inMenu.map(\.group).reduce(into: [Int]()) { seen, group in
      if !seen.contains(group) { seen.append(group) }
    }
    return numbers.map { group in
      UIMenu(
        options: .displayInline,
        children: inMenu.filter { $0.group == group }.map(keyCommand))
    }
  }

  private static func keyCommand(_ command: MenuCommand) -> UIKeyCommand {
    let made = UIKeyCommand(
      title: command.title,
      action: #selector(UIApplication.chipsMenuCommand(_:)),
      input: input(command.input),
      modifierFlags: flags(command.modifiers),
      propertyList: command.id)
    var attributes: UIMenuElement.Attributes = []
    if !command.enabled { attributes.insert(.disabled) }
    if command.menu == "hidden" { attributes.insert(.hidden) }
    made.attributes = attributes
    // ⌥↑ and ⌥↓ move a field's caret a paragraph; here they go to the space before and after.
    if command.input == "up" || command.input == "down" {
      made.wantsPriorityOverSystemBehavior = true
    }
    return made
  }

  private static func input(_ named: String) -> String {
    switch named {
    case "up": return UIKeyCommand.inputUpArrow
    case "down": return UIKeyCommand.inputDownArrow
    case "escape": return UIKeyCommand.inputEscape
    default: return named
    }
  }

  private static func flags(_ named: [String]) -> UIKeyModifierFlags {
    named.reduce(into: UIKeyModifierFlags()) { flags, name in
      switch name {
      case "command": flags.insert(.command)
      case "shift": flags.insert(.shift)
      case "option": flags.insert(.alternate)
      case "control": flags.insert(.control)
      default: break
      }
    }
  }
}

/** One command as JavaScript hands it over (`MenuCommand` in `src/ui/menuBar.ts`). */
struct MenuCommand: Record {
  @Field var id: String = ""
  @Field var title: String = ""
  /** A character, or `up`, `down` or `escape`. */
  @Field var input: String = ""
  /** Any of `command`, `shift`, `option` and `control`. */
  @Field var modifiers: [String] = []
  /** `view`, `space`, or `hidden` for keys with no row. */
  @Field var menu: String = ""
  /** Commands of one group stand together, between separators. */
  @Field var group: Int = 0
  @Field var enabled: Bool = false
}

extension UIApplication {
  /** Every command's action: the application answers it, so it reaches it from any focus. */
  @objc func chipsMenuCommand(_ sender: UICommand) {
    guard let id = sender.propertyList as? String else { return }
    MenuBarModule.chosen(id)
  }
}
