//! Chips run on this Mac, from the copy the app carries (ADR 0173).
//!
//! The app's resources hold a release of `chips` — the one `install.sh` would unpack, put there by
//! `pnpm desktop` — and "Run Chips on this Mac" runs its `chips up`: the workspace made, the server
//! started as a login service, and one line of JSON with a pairing code in it, which the page pairs
//! with. Nothing here knows a workspace or a code. It runs one command and hands back its line.
//!
//! It also says whether that server answers, for the menu bar (ADR 0215): the server on this Mac
//! is the login service `chips up` installs, and it answers when its `/v1/health` names `chipsd`.

use std::io::{Read, Write};
use std::net::{SocketAddr, TcpStream};
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

/// Who may reach the server, as `chips up --reach` takes it. The page asks for one.
pub const REACHES: [&str; 3] = ["lan", "tailnet", "local"];

/// What the page is told when the app runs from where it was downloaded.
pub const MOVE_FIRST: &str =
    "Move Chips to your Applications folder and open it from there, then run Chips here.";

/// The `chips` this app carries, if it carries one.
pub fn program(resources: &Path) -> Option<PathBuf> {
    let chips = resources.join("chips").join("bin").join("chips");
    chips.is_file().then_some(chips)
}

/// An app opened where it was downloaded runs from a copy macOS makes in a random place, gone at
/// the next launch: a login service pointed into it would point at nothing.
pub fn translocated(program: &Path) -> bool {
    program.to_string_lossy().contains("/AppTranslocation/")
}

/// What linking the `chips` command did (ADR 0218, phase 5).
#[derive(Debug, PartialEq, Eq)]
pub enum Linked {
    /// `~/.local/bin/chips` now runs this app's `chips`.
    Made,
    /// It did already.
    Already,
    /// Something else is there, an install of Chips's own or a file, and it was left alone.
    Theirs,
}

/// A `chips` inside a Mac app: what this app, or another copy of it, carries.
pub fn in_an_app(target: &Path) -> bool {
    target
        .to_string_lossy()
        .contains(".app/Contents/Resources/chips/bin/chips")
}

/// `~/.local/bin/chips` linked to the `chips` this app carries, as `install.sh` links its own, so
/// `chips down` and a bridge's `chips disconnect` work in a terminal: made where there is none,
/// moved here from another copy of the app, and left alone where something else is there.
/// `install.sh` leaves a link into an app alone in turn.
pub fn link_command(home: &Path, program: &Path) -> Result<Linked, String> {
    let bin = home.join(".local").join("bin");
    let path = bin.join("chips");
    match std::fs::symlink_metadata(&path) {
        Err(_) => {}
        Ok(meta) if meta.file_type().is_symlink() => {
            let target = std::fs::read_link(&path).map_err(|error| error.to_string())?;
            if target == program {
                return Ok(Linked::Already);
            }
            if !in_an_app(&target) {
                return Ok(Linked::Theirs);
            }
            std::fs::remove_file(&path).map_err(|error| error.to_string())?;
        }
        Ok(_) => return Ok(Linked::Theirs),
    }
    std::fs::create_dir_all(&bin).map_err(|error| error.to_string())?;
    #[cfg(unix)]
    std::os::unix::fs::symlink(program, &path).map_err(|error| error.to_string())?;
    Ok(Linked::Made)
}

/// `chips up`, as the app runs it: nothing asked, nothing opened, one line of JSON.
pub fn up_args(reach: &str) -> Vec<String> {
    ["up", "--reach", reach, "--json", "--no-open"]
        .iter()
        .map(|arg| (*arg).to_string())
        .collect()
}

/// The line `chips up --json` ends with, or what it said instead.
pub fn answer(succeeded: bool, stdout: &str, stderr: &str) -> Result<String, String> {
    let line = stdout
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| line.starts_with('{'));
    match (succeeded, line) {
        (true, Some(json)) => Ok(json.to_string()),
        _ => {
            let said = stderr.trim();
            Err(if said.is_empty() {
                "Chips did not start.".to_string()
            } else {
                said.to_string()
            })
        }
    }
}

/// Run `chips up` from the app's copy, and wait for its line.
pub fn run(program: &Path, reach: &str) -> Result<String, String> {
    if !REACHES.contains(&reach) {
        return Err(format!("chips up does not know the reach \"{reach}\"."));
    }
    if translocated(program) {
        return Err(MOVE_FIRST.to_string());
    }
    let done = Command::new(program)
        .args(up_args(reach))
        .output()
        .map_err(|error| error.to_string())?;
    answer(
        done.status.success(),
        &String::from_utf8_lossy(&done.stdout),
        &String::from_utf8_lossy(&done.stderr),
    )
}

/// The port Chips listens on when nothing says otherwise.
pub const PORT: u16 = 4431;

/// How long a health check waits, to connect and again to hear back.
const PATIENCE: Duration = Duration::from_secs(2);

/// The server's login service: `~/Library/LaunchAgents/chat.chips.serve.plist`.
pub fn service_path(home: &Path) -> PathBuf {
    home.join("Library/LaunchAgents/chat.chips.serve.plist")
}

/// The port of the server on this Mac, when this Mac runs one as a login service.
pub fn serving(home: &Path) -> Option<u16> {
    std::fs::read_to_string(service_path(home))
        .ok()
        .map(|plist| port_of(&plist))
}

/// The port a service names in `CHIPS_PORT`, else the one Chips listens on anyway.
pub fn port_of(plist: &str) -> u16 {
    plist
        .split_once("<key>CHIPS_PORT</key>")
        .and_then(|(_, after)| after.split_once("<string>"))
        .and_then(|(_, after)| after.split_once("</string>"))
        .and_then(|(port, _)| port.trim().parse().ok())
        .unwrap_or(PORT)
}

/// Whether Chips answers on this port of this Mac.
pub fn answers(port: u16) -> bool {
    health(port).is_some_and(|heard| is_chipsd(&heard))
}

/// What `/v1/health` on this port of this Mac answered, headers and all, or nothing.
fn health(port: u16) -> Option<String> {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let mut stream = TcpStream::connect_timeout(&address, PATIENCE).ok()?;
    let _ = stream.set_read_timeout(Some(PATIENCE));
    let _ = stream.set_write_timeout(Some(PATIENCE));
    let asked = format!("GET /v1/health HTTP/1.0\r\nHost: 127.0.0.1:{port}\r\n\r\n");
    stream.write_all(asked.as_bytes()).ok()?;
    let mut heard = Vec::new();
    let _ = stream.take(16 * 1024).read_to_end(&mut heard);
    Some(String::from_utf8_lossy(&heard).into_owned())
}

/// The server on this Mac, as Run and Open know it (ADR 0231): where it answers on loopback, and
/// the key it answers with, which a device's pinned key must equal for this Mac to act for it.
#[derive(Debug, PartialEq, Eq, serde::Serialize)]
pub struct Serving {
    pub url: String,
    pub key: String,
}

/// The server answering on this port of this Mac, by its key; nothing when none answers as Chips.
pub fn serving_at(port: u16) -> Option<Serving> {
    let key = key_of(&health(port)?)?;
    Some(Serving {
        url: loopback(port),
        key,
    })
}

/// This Mac's own address for a server on `port`, the only one Run and Open fetch a project from.
pub fn loopback(port: u16) -> String {
    format!("http://127.0.0.1:{port}")
}

/// The tunnel key a Chips health answer names (`relay.key`, there with or without a relay,
/// ADR 0191), in the shape keys come in; nothing for any other answer.
pub fn key_of(response: &str) -> Option<String> {
    if !is_chipsd(response) {
        return None;
    }
    let (_, body) = response.split_once("\r\n\r\n")?;
    let said: serde_json::Value = serde_json::from_str(body.trim()).ok()?;
    let key = said.get("relay")?.get("key")?.as_str()?;
    let shaped = key.len() == 43
        && key
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    shaped.then(|| key.to_string())
}

/// A health answer from Chips, and not from something else on the port: a 200 naming `chipsd`.
pub fn is_chipsd(response: &str) -> bool {
    let ok = response
        .lines()
        .next()
        .is_some_and(|status| status.split_whitespace().nth(1) == Some("200"));
    ok && response.replace(' ', "").contains("\"name\":\"chipsd\"")
}

/// The label a service file names, which is what launchd knows it by.
pub fn label_of(plist: &str) -> String {
    plist
        .split_once("<key>Label</key>")
        .and_then(|(_, after)| after.split_once("<string>"))
        .and_then(|(_, after)| after.split_once("</string>"))
        .map(|(label, _)| label.trim().to_string())
        .filter(|label| !label.is_empty())
        .unwrap_or_else(|| "chat.chips.serve".to_string())
}

/// What launchd has of the server's login service.
#[derive(Debug, PartialEq, Eq)]
pub enum Service {
    /// Not loaded: `chips down`, a `launchctl bootout`, or never since this login.
    Unloaded,
    /// Loaded, and not running.
    Stopped,
    /// Running, though perhaps still starting, or too busy to answer.
    Running,
}

/// From `launchctl print`: unloaded when it knows no such service, else whether it runs.
pub fn service_state(found: bool, printed: &str) -> Service {
    if !found {
        return Service::Unloaded;
    }
    let state = printed
        .lines()
        .map(str::trim)
        .find_map(|line| line.strip_prefix("state = "));
    if state == Some("running") {
        Service::Running
    } else {
        Service::Stopped
    }
}

/// What starts it, as `chips up` would: an unloaded one is enabled (`chips down` disables it)
/// and loaded, which runs it; a stopped one is started; a running one is left alone, since it
/// is starting or busy, and launchd keeps it going.
pub fn start_steps(service: &Service, uid: &str, label: &str, file: &Path) -> Vec<Vec<String>> {
    let domain = format!("gui/{uid}");
    let target = format!("{domain}/{label}");
    let step = |words: &[&str]| words.iter().map(|word| (*word).to_string()).collect();
    match service {
        Service::Unloaded => vec![
            step(&["enable", &target]),
            step(&["bootstrap", &domain, &file.to_string_lossy()]),
        ],
        Service::Stopped => vec![step(&["kickstart", &target])],
        Service::Running => vec![],
    }
}

/// What opening the app did about the server here.
#[derive(Debug, PartialEq, Eq)]
pub enum Woke {
    /// This Mac runs no server as a login service.
    NotHere,
    /// It answered.
    Answering,
    /// It runs and does not answer yet; launchd has it.
    Busy,
    /// It was started.
    Started,
}

/// The app was opened by a person and the server here may be down: start its login service when
/// it does not answer (ADR 0215's addendum). What it did, or what `launchctl` said instead.
pub fn wake(home: &Path) -> Result<Woke, String> {
    let file = service_path(home);
    let Ok(plist) = std::fs::read_to_string(&file) else {
        return Ok(Woke::NotHere);
    };
    if answers(port_of(&plist)) {
        return Ok(Woke::Answering);
    }
    let uid = said("/usr/bin/id", &["-u"])?.trim().to_string();
    let label = label_of(&plist);
    let printed = Command::new("/bin/launchctl")
        .args(["print", &format!("gui/{uid}/{label}")])
        .output()
        .map_err(|error| error.to_string())?;
    let service = service_state(
        printed.status.success(),
        &String::from_utf8_lossy(&printed.stdout),
    );
    if service == Service::Running {
        return Ok(Woke::Busy);
    }
    for step in start_steps(&service, &uid, &label, &file) {
        let words: Vec<&str> = step.iter().map(String::as_str).collect();
        said("/bin/launchctl", &words)?;
    }
    Ok(Woke::Started)
}

/// What a program printed, or what it said when it failed.
fn said(program: &str, args: &[&str]) -> Result<String, String> {
    let done = Command::new(program)
        .args(args)
        .output()
        .map_err(|error| error.to_string())?;
    if done.status.success() {
        Ok(String::from_utf8_lossy(&done.stdout).into_owned())
    } else {
        let name = Path::new(program)
            .file_name()
            .map_or(program.into(), |name| name.to_string_lossy());
        let stderr = String::from_utf8_lossy(&done.stderr);
        Err(format!("`{name} {}`: {}", args.join(" "), stderr.trim()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_port_is_the_services_own_or_chips_usual() {
        let written = "<key>CHIPS_HOST</key>\n    <string>0.0.0.0</string>\n    <key>CHIPS_PORT</key>\n    <string>4500</string>";
        assert_eq!(port_of(written), 4500);
        assert_eq!(
            port_of("<key>CHIPS_HOST</key>\n    <string>0.0.0.0</string>"),
            4431
        );
        assert_eq!(port_of("<key>CHIPS_PORT</key><string>nope</string>"), 4431);
    }

    #[test]
    fn only_chips_saying_ok_counts_as_chips() {
        let chips = "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{\"status\":\"ok\",\"name\":\"chipsd\",\"version\":\"0.0.0\"}";
        assert!(is_chipsd(chips));
        assert!(!is_chipsd(
            &chips.replace("200 OK", "503 Service Unavailable")
        ));
        assert!(!is_chipsd(
            "HTTP/1.1 200 OK\r\n\r\n{\"name\":\"something-else\"}"
        ));
        assert!(!is_chipsd(""));
    }

    #[test]
    fn the_key_is_what_chips_names_in_its_health() {
        let key = "Qm9va2tlZXBpbmcgaXMgYSBnb29kIHRoaW5nIHRvIGR";
        let chips = format!(
            "HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n{{\"status\":\"ok\",\"name\":\"chipsd\",\"relay\":{{\"status\":\"off\",\"url\":null,\"key\":\"{key}\"}}}}"
        );
        assert_eq!(key_of(&chips).as_deref(), Some(key));
        // Not Chips, not well, or no key in the shape keys come in: no key at all.
        assert_eq!(key_of(&chips.replace("chipsd", "other")), None);
        assert_eq!(key_of(&chips.replace("200 OK", "503 Unavailable")), None);
        assert_eq!(key_of(&chips.replace(key, "short")), None);
        assert_eq!(key_of(&chips.replace(key, &format!("{}=", &key[..42]))), None);
        assert_eq!(
            key_of("HTTP/1.1 200 OK\r\n\r\n{\"name\":\"chipsd\",\"relay\":{\"key\":null}}"),
            None
        );
        assert_eq!(key_of("HTTP/1.1 200 OK\r\n\r\n{\"name\":\"chipsd\""), None);
    }

    #[test]
    fn the_server_here_is_reached_on_loopback() {
        assert_eq!(loopback(4431), "http://127.0.0.1:4431");
        assert_eq!(serving_at(9), None);
    }

    #[test]
    fn nothing_listening_is_no_answer() {
        // Port 9 (discard) is closed on a Mac; a refused connection must come back at once.
        assert!(!answers(9));
    }

    #[test]
    fn a_mac_without_the_service_serves_nothing() {
        assert_eq!(serving(Path::new("/nowhere/at/all")), None);
        assert_eq!(wake(Path::new("/nowhere/at/all")), Ok(Woke::NotHere));
    }

    #[test]
    fn the_service_is_known_by_the_label_its_file_names() {
        let plist = "<dict>\n  <key>Label</key>\n  <string>chat.chips.serve</string>\n";
        assert_eq!(label_of(plist), "chat.chips.serve");
        assert_eq!(
            label_of("<key>Label</key><string>chat.chips.serve-walk</string>"),
            "chat.chips.serve-walk"
        );
        assert_eq!(label_of("<dict></dict>"), "chat.chips.serve");
    }

    #[test]
    fn launchd_says_whether_it_runs() {
        let running = "gui/501/chat.chips.serve = {\n\tactive count = 1\n\tstate = running\n\n\tendpoints = {\n\t\tstate = active\n\t}\n";
        assert_eq!(service_state(true, running), Service::Running);
        let stopped = "gui/501/chat.chips.serve = {\n\tstate = not running\n\tlast exit code = 1\n";
        assert_eq!(service_state(true, stopped), Service::Stopped);
        assert_eq!(service_state(false, ""), Service::Unloaded);
    }

    #[test]
    fn it_is_started_as_chips_up_starts_it_and_a_running_one_is_left_alone() {
        let file = Path::new("/Users/a/Library/LaunchAgents/chat.chips.serve.plist");
        assert_eq!(
            start_steps(&Service::Unloaded, "501", "chat.chips.serve", file),
            [
                vec!["enable", "gui/501/chat.chips.serve"],
                vec![
                    "bootstrap",
                    "gui/501",
                    "/Users/a/Library/LaunchAgents/chat.chips.serve.plist"
                ],
            ]
        );
        assert_eq!(
            start_steps(&Service::Stopped, "501", "chat.chips.serve", file),
            [vec!["kickstart", "gui/501/chat.chips.serve"]]
        );
        assert!(start_steps(&Service::Running, "501", "chat.chips.serve", file).is_empty());
    }

    #[test]
    fn it_asks_nothing_and_opens_nothing() {
        assert_eq!(
            up_args("lan"),
            ["up", "--reach", "lan", "--json", "--no-open"]
        );
    }

    #[test]
    fn the_answer_is_the_last_line_of_json() {
        let out = "something said first\n{\"url\":\"http://127.0.0.1:4431\"}\n";
        assert_eq!(
            answer(true, out, ""),
            Ok("{\"url\":\"http://127.0.0.1:4431\"}".to_string())
        );
    }

    #[test]
    fn a_refusal_is_what_chips_up_said() {
        assert_eq!(
            answer(
                false,
                "",
                "Something other than Chips answers on port 4431.\n"
            ),
            Err("Something other than Chips answers on port 4431.".to_string())
        );
        assert_eq!(
            answer(false, "", ""),
            Err("Chips did not start.".to_string())
        );
    }

    #[test]
    fn a_downloaded_copy_is_moved_first_and_a_strange_reach_is_refused() {
        let moved = Path::new("/private/var/folders/x/AppTranslocation/ABC/d/Chips.app/Contents/Resources/chips/bin/chips");
        assert_eq!(run(moved, "lan"), Err(MOVE_FIRST.to_string()));
        assert!(run(Path::new("/nowhere"), "everyone").is_err());
    }

    #[test]
    fn the_chips_command_is_linked_to_the_app_and_nothing_else_is_moved() {
        let home = std::env::temp_dir().join(format!("chips-link-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        let app = Path::new("/Applications/Chips.app/Contents/Resources/chips/bin/chips");
        assert_eq!(link_command(&home, app), Ok(Linked::Made));
        let path = home.join(".local/bin/chips");
        assert_eq!(std::fs::read_link(&path).unwrap(), app);
        assert_eq!(link_command(&home, app), Ok(Linked::Already));
        // Another copy of the app: the link moves to this one.
        let copy = Path::new("/Users/a/Downloads/Chips.app/Contents/Resources/chips/bin/chips");
        assert_eq!(link_command(&home, copy), Ok(Linked::Made));
        assert_eq!(std::fs::read_link(&path).unwrap(), copy);
        // An install of Chips's own stays as it is.
        std::fs::remove_file(&path).unwrap();
        #[cfg(unix)]
        std::os::unix::fs::symlink(home.join(".local/lib/chips/current/bin/chips"), &path).unwrap();
        assert_eq!(link_command(&home, app), Ok(Linked::Theirs));
        assert_eq!(
            std::fs::read_link(&path).unwrap(),
            home.join(".local/lib/chips/current/bin/chips")
        );
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn an_app_without_chips_carries_none() {
        assert_eq!(program(Path::new("/nowhere/at/all")), None);
    }
}
