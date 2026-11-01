//! Chips for Mac at login, in the menu bar only (ADR 0215).
//!
//! A launch agent opens the app at login with `--background`: no window, no Dock icon, and no
//! page until someone asks for the window. The app writes the agent itself, pointed at wherever it
//! runs from, on a Mac whose server is a login service here, unless the person turned it off from
//! the menu; turning it off leaves a note in the app's own folder so a later launch keeps it off.
//!
//! The agent runs the app's own program, which its team signs, and names the app: so Login Items
//! says Chips, where an agent that ran `/usr/bin/open` was "open" (ADR 0215's addendum of 24
//! October 2026). Every start writes it again, so an install from before moves by itself.

use std::fs;
use std::path::{Path, PathBuf};

/// The agent's label, and its file's name.
pub const LABEL: &str = "chat.chips.desktop";

/// What the agent passes, and how the app knows it was opened at login.
pub const BACKGROUND: &str = "--background";

/// The note that says the person turned it off.
const OFF: &str = "login-off";

/// Whether this launch was the login's.
pub fn opened_at_login() -> bool {
    std::env::args().any(|arg| arg == BACKGROUND)
}

/// The agent's file: `~/Library/LaunchAgents/chat.chips.desktop.plist`.
pub fn agent_path(home: &Path) -> PathBuf {
    home.join("Library/LaunchAgents")
        .join(format!("{LABEL}.plist"))
}

/// The `.app` this program runs from, if it runs from one: `…/Chips.app/Contents/MacOS/x` →
/// `…/Chips.app`. `tauri dev` runs from no app, and an app opened where it was downloaded runs
/// from a copy macOS makes in a random place, gone at the next launch: neither gets an agent.
pub fn bundle_of(program: &Path) -> Option<PathBuf> {
    let bundle = program.parent()?.parent()?.parent()?;
    let is_app = bundle
        .extension()
        .is_some_and(|extension| extension == "app");
    let translocated = bundle.to_string_lossy().contains("/AppTranslocation/");
    (is_app && !translocated).then(|| bundle.to_path_buf())
}

/// What the bundle's `Info.plist` says for `key`, as a string.
fn info(bundle: &Path, key: &str) -> Option<String> {
    let plist = fs::read_to_string(bundle.join("Contents/Info.plist")).ok()?;
    let after = &plist[plist.find(&format!("<key>{key}</key>"))?..];
    let start = after.find("<string>")? + "<string>".len();
    let end = after[start..].find("</string>")?;
    Some(after[start..start + end].trim().to_string())
}

/// The agent: the app's own program with `--background`, once at login, in a session with a
/// screen, naming the app it belongs to, so Login Items shows the app and not what started it.
pub fn agent(bundle: &Path) -> String {
    let program = bundle
        .join("Contents/MacOS")
        .join(info(bundle, "CFBundleExecutable").unwrap_or_else(|| "chips-desktop".to_string()));
    let program = xml(&program.to_string_lossy());
    let identifier = xml(&info(bundle, "CFBundleIdentifier").unwrap_or_else(|| LABEL.to_string()));
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<!-- Chips for Mac opens at login in the menu bar (ADR 0215). Its menu's Open at Login turns it off. -->
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>{program}</string>
    <string>{BACKGROUND}</string>
  </array>
  <key>AssociatedBundleIdentifiers</key>
  <array>
    <string>{identifier}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
</dict>
</plist>
"#
    )
}

/// Whether another copy of this app runs already. Started at login, the app gives way to it: one
/// macOS opened again as the person logged in, or one opened by hand. `open` gave way for it, as
/// macOS does for any app opened twice; the program run by itself does not.
///
/// The app's identifier is its bundle's: this runs before the app has started, when macOS does not
/// yet know this process as an app to ask about.
#[cfg(target_os = "macos")]
pub fn another_running() -> bool {
    use objc2_app_kit::NSRunningApplication;
    use objc2_foundation::NSBundle;
    let Some(identifier) = NSBundle::mainBundle().bundleIdentifier() else {
        return false;
    };
    let pid = std::process::id();
    NSRunningApplication::runningApplicationsWithBundleIdentifier(&identifier)
        .iter()
        .any(|each| u32::try_from(each.processIdentifier()).ok() != Some(pid))
}

#[cfg(not(target_os = "macos"))]
pub fn another_running() -> bool {
    false
}

fn xml(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Whether the app opens at login now.
pub fn is_on(home: &Path) -> bool {
    agent_path(home).is_file()
}

/// Whether the agent should be there when the app starts: kept (pointed at this app) when it is
/// there, and put there on a Mac with a server here unless the person turned it off.
pub fn wanted(on: bool, server_here: bool, turned_off: bool) -> bool {
    on || (server_here && !turned_off)
}

/// At start: write the agent when it is wanted, so it always names the app that runs now.
pub fn keep(home: &Path, notes: &Path, bundle: &Path, server_here: bool) -> std::io::Result<()> {
    if wanted(is_on(home), server_here, notes.join(OFF).exists()) {
        write(home, bundle)?;
    }
    Ok(())
}

/// From the menu: on writes the agent and forgets the note; off removes it and leaves the note.
pub fn turn(home: &Path, notes: &Path, bundle: &Path, on: bool) -> std::io::Result<()> {
    let note = notes.join(OFF);
    if on {
        write(home, bundle)?;
        if note.exists() {
            fs::remove_file(note)?;
        }
    } else {
        let path = agent_path(home);
        if path.exists() {
            fs::remove_file(path)?;
        }
        fs::create_dir_all(notes)?;
        fs::write(note, "")?;
    }
    Ok(())
}

fn write(home: &Path, bundle: &Path) -> std::io::Result<()> {
    let path = agent_path(home);
    if let Some(folder) = path.parent() {
        fs::create_dir_all(folder)?;
    }
    fs::write(path, agent(bundle))
}

#[cfg(test)]
mod tests {
    use super::*;

    /// An app of its own in a folder of the test's: its `Info.plist`, as Tauri writes one.
    fn app(name: &str, program: &str, identifier: &str) -> PathBuf {
        let bundle = std::env::temp_dir()
            .join(format!("chips-login-app-{}-{name}", std::process::id()))
            .join(format!("{name}.app"));
        fs::create_dir_all(bundle.join("Contents/MacOS")).unwrap();
        fs::write(
            bundle.join("Contents/Info.plist"),
            format!("<?xml version=\"1.0\"?>\n<plist version=\"1.0\">\n<dict>\n\t<key>CFBundleExecutable</key>\n\t<string>{program}</string>\n\t<key>CFBundleIdentifier</key>\n\t<string>{identifier}</string>\n</dict>\n</plist>\n"),
        )
        .unwrap();
        bundle
    }

    #[test]
    fn the_agent_runs_the_apps_own_program_in_the_background_at_login_and_names_the_app() {
        let bundle = app("Chips", "chips-desktop", "chat.chips.desktop");
        let plist = agent(&bundle);
        assert!(plist.contains("<key>Label</key>\n  <string>chat.chips.desktop</string>"));
        assert!(plist.contains(&format!(
            "<array>\n    <string>{}/Contents/MacOS/chips-desktop</string>\n    <string>--background</string>\n  </array>",
            bundle.display()
        )));
        assert!(plist.contains(
            "<key>AssociatedBundleIdentifiers</key>\n  <array>\n    <string>chat.chips.desktop</string>\n  </array>"
        ));
        assert!(!plist.contains("/usr/bin/open"));
        assert!(plist.contains("<key>RunAtLoad</key>\n  <true/>"));
        assert!(!plist.contains("KeepAlive"));
        // A build of its own, a walk's, names itself.
        let walk = agent(&app("Walk", "chips-desktop", "chat.chips.walk"));
        assert!(walk.contains("<string>chat.chips.walk</string>"));
    }

    #[test]
    fn a_strange_path_is_written_as_text() {
        let plist = agent(Path::new("/Users/a&b/<Apps>/Chips.app"));
        assert!(plist.contains(
            "<string>/Users/a&amp;b/&lt;Apps&gt;/Chips.app/Contents/MacOS/chips-desktop</string>"
        ));
        // With no Info.plist to read, the app's own name and identifier.
        assert!(plist.contains("<string>chat.chips.desktop</string>\n  </array>"));
    }

    #[test]
    fn a_program_that_is_no_app_has_no_other_copy_to_give_way_to() {
        assert!(!another_running());
    }

    #[test]
    fn an_agent_written_before_names_the_app_once_it_starts_again() {
        let bundle = app("Moved", "chips-desktop", "chat.chips.desktop");
        let root = std::env::temp_dir().join(format!("chips-login-moved-{}", std::process::id()));
        let (home, notes) = (root.join("home"), root.join("notes"));
        fs::create_dir_all(home.join("Library/LaunchAgents")).unwrap();
        fs::write(
            agent_path(&home),
            "<plist><dict><key>ProgramArguments</key><array><string>/usr/bin/open</string></array></dict></plist>",
        )
        .unwrap();
        keep(&home, &notes, &bundle, false).unwrap();
        let written = fs::read_to_string(agent_path(&home)).unwrap();
        assert!(!written.contains("/usr/bin/open"));
        assert!(written.contains("<key>AssociatedBundleIdentifiers</key>"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn only_an_installed_app_gets_an_agent() {
        assert_eq!(
            bundle_of(Path::new(
                "/Applications/Chips.app/Contents/MacOS/chips-desktop"
            )),
            Some(PathBuf::from("/Applications/Chips.app"))
        );
        assert_eq!(
            bundle_of(Path::new("/Users/a/Chips/target/debug/chips-desktop")),
            None
        );
        assert_eq!(
            bundle_of(Path::new(
                "/private/var/folders/x/AppTranslocation/ABC/d/Chips.app/Contents/MacOS/chips-desktop"
            )),
            None
        );
    }

    #[test]
    fn it_comes_on_by_itself_only_where_the_server_is_and_nobody_said_no() {
        assert!(wanted(false, true, false));
        assert!(!wanted(false, true, true));
        assert!(!wanted(false, false, false));
        // Already on: kept, so it names the app that runs now.
        assert!(wanted(true, false, true));
    }

    #[test]
    fn turning_it_off_stays_off_and_on_again_forgets_that() {
        let root = std::env::temp_dir().join(format!("chips-login-{}", std::process::id()));
        let (home, notes) = (root.join("home"), root.join("notes"));
        let bundle = Path::new("/Applications/Chips.app");

        keep(&home, &notes, bundle, true).unwrap();
        assert!(is_on(&home));

        turn(&home, &notes, bundle, false).unwrap();
        assert!(!is_on(&home));
        keep(&home, &notes, bundle, true).unwrap();
        assert!(
            !is_on(&home),
            "a later start does not undo the person's off"
        );

        turn(&home, &notes, bundle, true).unwrap();
        assert!(is_on(&home));
        assert!(!notes.join(OFF).exists());

        fs::remove_dir_all(root).unwrap();
    }
}
