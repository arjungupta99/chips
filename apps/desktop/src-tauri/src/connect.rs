//! Connect a bridge's card on this Mac (ADR 0218, phase 5): the carried `chips connect <id>
//! --json`, with the link in its environment rather than among its words, where the process list
//! would show it, and beside it the name the sheet showed, which `chips connect` checks against
//! its own card of that id (SEC-51). Each line it prints goes to the page as it comes; when it
//! ends without saying where it stopped, its last words are said as a failed step. The page can
//! stop it, and the bridge it started, at any time. Nothing here reads what a line means: that is
//! the page's.

use std::collections::{HashMap, VecDeque};
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::Mutex;

/// The runs under way, by the page's name for each, with the process group each leads.
#[derive(Default)]
pub struct Runs(pub Mutex<HashMap<String, u32>>);

/// A card's id as the cards name one: lower case letters, digits and dashes.
pub fn card_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 41
        && !id.starts_with('-')
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// A link Chips made, `http(s)://…/j/chips_j_…`, with nothing a shell would read twice.
pub fn join_link(link: &str) -> bool {
    (link.starts_with("http://") || link.starts_with("https://"))
        && link.contains("/j/chips_j_")
        && link.len() <= 512
        && !link
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || c == '\'' || c == '"')
}

/// A card's name as the sheet showed it: a few words a person reads.
pub fn card_name(name: &str) -> bool {
    !name.trim().is_empty() && name.chars().count() <= 60 && !name.chars().any(char::is_control)
}

/// A run's name, as the page makes one.
pub fn run_name(run: &str) -> bool {
    run.starts_with("run_")
        && run.len() <= 64
        && run.chars().all(|c| c.is_ascii_alphanumeric() || c == '_')
}

/// `chips connect <id> --json`, as the app runs it: the link is not among its words.
pub fn connect_args(id: &str) -> Vec<String> {
    vec!["connect".to_string(), id.to_string(), "--json".to_string()]
}

/// Whether a line ends a run: connected, or where it stopped.
pub fn ends(line: &str) -> bool {
    serde_json::from_str::<serde_json::Value>(line)
        .ok()
        .and_then(|said| {
            said.get("step")
                .and_then(|step| step.as_str())
                .map(String::from)
        })
        .is_some_and(|step| step == "connected" || step == "failed")
}

/// How many of its last lines on standard error are kept, for a run that ends without a word.
const LAST_LINES: usize = 3;

/// A run that ended without saying where it stopped, as a failed step: its last words.
pub fn last_words(code: i32, said: &VecDeque<String>) -> String {
    let words = said
        .iter()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let sentence = if words.is_empty() {
        "Chips couldn't connect it here.".to_string()
    } else {
        words
    };
    serde_json::json!({ "step": "failed", "sentence": sentence, "code": code }).to_string()
}

/// Start it, in a process group of its own so it can be stopped whole: each line to `said`, then,
/// once it has ended, its code to `ended`. Its process group's id, which is its own.
pub fn start(
    program: &Path,
    id: &str,
    name: &str,
    link: &str,
    said: impl Fn(String) + Send + 'static,
    ended: impl FnOnce(i32) + Send + 'static,
) -> Result<u32, String> {
    let mut command = Command::new(program);
    command
        .args(connect_args(id))
        .env("CHIPS_JOIN_LINK", link)
        .env("CHIPS_CARD_NAME", name)
        // The PATH a Terminal has, not Finder's: the harness, its adapter and Node are found, and
        // the bridge it keeps running keeps the same (the new-person sweep's finding 5).
        .env("PATH", crate::shell_path::for_bridges())
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    let group = child.id();
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    std::thread::spawn(move || {
        // Its log, read as it comes so it never fills the pipe; the last few lines kept.
        let errors = std::thread::spawn(move || {
            let mut last = VecDeque::new();
            if let Some(stream) = stderr {
                for line in BufReader::new(stream).lines().map_while(Result::ok) {
                    last.push_back(line);
                    if last.len() > LAST_LINES {
                        last.pop_front();
                    }
                }
            }
            last
        });
        let mut finished = false;
        if let Some(stream) = stdout {
            for line in BufReader::new(stream).lines().map_while(Result::ok) {
                finished |= ends(&line);
                said(line);
            }
        }
        let code = child
            .wait()
            .ok()
            .and_then(|status| status.code())
            .unwrap_or(1);
        let last = errors.join().unwrap_or_default();
        if !finished && code != 0 {
            said(last_words(code, &last));
        }
        ended(code);
    });
    Ok(group)
}

/// Stop a run and whatever it started: its whole process group.
pub fn stop(group: u32) {
    let _ = Command::new("/bin/kill")
        .args(["-TERM", &format!("-{group}")])
        .status();
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::mpsc;
    use std::time::Duration;

    #[test]
    fn only_a_card_and_a_link_chips_made_are_run() {
        assert!(card_id("hermes"));
        assert!(card_id("claude-code"));
        assert!(!card_id("--json"));
        assert!(!card_id("Hermes"));
        assert!(!card_id("a;b"));
        assert!(join_link(
            "http://192.168.1.20:4431/j/chips_j_q7Rk2mWx9TbN4pLs8VfY3cHd6JzA1eUo"
        ));
        assert!(!join_link(
            "http://192.168.1.20:4431/j/chips_j_x' && rm -rf ~"
        ));
        assert!(!join_link("file:///j/chips_j_x"));
        assert!(card_name("Claude Code"));
        assert!(!card_name(" "));
        assert!(!card_name("Calendar\nhelper"));
        assert!(!card_name(&"x".repeat(61)));
        assert!(run_name("run_mgx1abc23de"));
        assert!(!run_name("run_../x"));
    }

    #[test]
    fn the_link_is_never_among_its_words() {
        assert_eq!(connect_args("hermes"), ["connect", "hermes", "--json"]);
    }

    #[test]
    fn a_run_ends_on_connected_or_where_it_stopped() {
        assert!(ends("{\"step\":\"connected\"}"));
        assert!(ends("{\"step\":\"failed\",\"sentence\":\"No.\"}"));
        assert!(!ends("{\"step\":\"checking\"}"));
        assert!(!ends("Downloading…"));
    }

    #[test]
    fn last_words_are_a_failed_step() {
        let said: VecDeque<String> = ["", "Error: the bridge crashed", "at main.js:1"]
            .iter()
            .map(|line| line.to_string())
            .collect();
        let line: serde_json::Value = serde_json::from_str(&last_words(9, &said)).unwrap();
        assert_eq!(line["step"], "failed");
        assert_eq!(line["sentence"], "Error: the bridge crashed at main.js:1");
        assert_eq!(line["code"], 9);
        let quiet: serde_json::Value =
            serde_json::from_str(&last_words(1, &VecDeque::new())).unwrap();
        assert_eq!(quiet["sentence"], "Chips couldn't connect it here.");
    }

    /// A stand-in `chips`: a script in a folder of its own.
    fn script(body: &str) -> std::path::PathBuf {
        let folder = std::env::temp_dir().join(format!(
            "chips-connect-{}-{}",
            std::process::id(),
            body.len()
        ));
        std::fs::create_dir_all(&folder).unwrap();
        let path = folder.join("chips");
        std::fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        path
    }

    #[test]
    fn its_lines_come_in_order_with_the_link_in_its_environment_and_its_last_words_after() {
        let chips = script(
            "echo \"{\\\"step\\\":\\\"checking\\\",\\\"words\\\":\\\"$*\\\",\\\"link\\\":\\\"$CHIPS_JOIN_LINK\\\",\\\"name\\\":\\\"$CHIPS_CARD_NAME\\\"}\"\necho 'it went wrong' >&2\nexit 3",
        );
        let (tx, rx) = mpsc::channel();
        let ending = tx.clone();
        start(
            &chips,
            "hermes",
            "Hermes",
            "http://h/j/chips_j_x",
            move |line| tx.send(line).unwrap(),
            move |code| ending.send(format!("end {code}")).unwrap(),
        )
        .unwrap();
        let heard: Vec<String> = (0..3)
            .map(|_| rx.recv_timeout(Duration::from_secs(10)).unwrap())
            .collect();
        let first: serde_json::Value = serde_json::from_str(&heard[0]).unwrap();
        assert_eq!(first["words"], "connect hermes --json");
        assert_eq!(first["link"], "http://h/j/chips_j_x");
        assert_eq!(first["name"], "Hermes");
        let failed: serde_json::Value = serde_json::from_str(&heard[1]).unwrap();
        assert_eq!(failed["sentence"], "it went wrong");
        assert_eq!(heard[2], "end 3");
    }

    #[test]
    fn stopped_it_ends_with_what_it_started() {
        let chips = script("echo '{\"step\":\"checking\"}'\nsleep 30 &\nwait");
        let (tx, rx) = mpsc::channel();
        let ending = tx.clone();
        let group = start(
            &chips,
            "hermes",
            "Hermes",
            "http://h/j/chips_j_x",
            move |line| tx.send(line).unwrap(),
            move |code| ending.send(format!("end {code}")).unwrap(),
        )
        .unwrap();
        assert_eq!(
            rx.recv_timeout(Duration::from_secs(10)).unwrap(),
            "{\"step\":\"checking\"}"
        );
        stop(group);
        let rest: Vec<String> = rx.iter().take(2).collect();
        assert!(rest[0].contains("\"failed\""), "{rest:?}");
        assert!(rest[1].starts_with("end "), "{rest:?}");
    }
}
