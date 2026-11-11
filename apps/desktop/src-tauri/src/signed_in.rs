//! Whether an agent on this Mac is signed in with its maker (ADR 0290's addendum, option B): the
//! written steps tick themselves off as the person runs them, and signing in is one.
//!
//! The agent's own status command answers, from a fixed list by card: a card names which agent it
//! is, never what to run. What the person signed in as is never read, only whether they are.

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::shell_path;

/// How long a status command has to answer: it reads a file or the keychain, and nothing more.
const PATIENCE: Duration = Duration::from_secs(10);

/// One agent's status command, and how its answer reads as signed in.
struct Status {
    program: &'static str,
    args: &'static [&'static str],
    reads: fn(ok: bool, said: &str) -> bool,
}

/// The agents whose sign-in Chips can see, by their card's id in the docs' gallery.
fn status_of(card: &str) -> Option<Status> {
    match card {
        // `{"loggedIn": true, …}` on its output, and a failure when nobody is.
        "claude-code" => Some(Status {
            program: "claude",
            args: &["auth", "status"],
            reads: claude_signed_in,
        }),
        // "Logged in using ChatGPT" on its error output, and a failure with "Not logged in".
        "codex" => Some(Status {
            program: "codex",
            args: &["login", "status"],
            reads: |ok, _| ok,
        }),
        _ => None,
    }
}

fn claude_signed_in(ok: bool, said: &str) -> bool {
    let start = said.find('{');
    let read = start.and_then(|at| serde_json::from_str::<serde_json::Value>(&said[at..]).ok());
    ok && read.is_some_and(|value| value["loggedIn"] == serde_json::Value::Bool(true))
}

/// Whether `card`'s agent says it is signed in, with `path` as its PATH; nothing when Chips can't
/// ask: a card with no status command here, an agent not installed, or one that didn't answer.
pub fn ask(card: &str, path: &str) -> Option<bool> {
    let status = status_of(card)?;
    let program = shell_path::which(status.program, path)?;
    let mut child = Command::new(program)
        .args(status.args)
        .env("PATH", path)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .ok()?;
    let mut out = child.stdout.take()?;
    let mut err = child.stderr.take()?;
    let reading = std::thread::spawn(move || {
        let mut said = String::new();
        let _ = out.read_to_string(&mut said);
        let _ = err.read_to_string(&mut said);
        said
    });
    let started = Instant::now();
    let ended = loop {
        match child.try_wait() {
            Ok(Some(ended)) => break ended,
            Ok(None) if started.elapsed() < PATIENCE => {
                std::thread::sleep(Duration::from_millis(25))
            }
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                return None;
            }
        }
    };
    let said = reading.join().ok()?;
    Some((status.reads)(ended.success(), &said))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    /// A folder with one program in it, which says `said` on `stream` and exits with `code`.
    fn with_program(name: &str, stream: &str, said: &str, code: i32) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "chips-signed-in-{name}-{code}-{}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let script = dir.join(name);
        let redirect = if stream == "err" { " >&2" } else { "" };
        std::fs::write(
            &script,
            format!("#!/bin/sh\nprintf '%s\\n' '{said}'{redirect}\nexit {code}\n"),
        )
        .unwrap();
        std::fs::set_permissions(&script, std::fs::Permissions::from_mode(0o755)).unwrap();
        dir
    }

    #[test]
    fn reads_codex_by_whether_its_status_succeeds() {
        let yes = with_program("codex", "err", "Logged in using ChatGPT", 0);
        let no = with_program("codex", "err", "Not logged in", 1);
        let path = |dir: &std::path::PathBuf| format!("{}:/usr/bin:/bin", dir.display());
        assert_eq!(ask("codex", &path(&yes)), Some(true));
        assert_eq!(ask("codex", &path(&no)), Some(false));
    }

    #[test]
    fn reads_claude_code_by_logged_in_in_its_answer() {
        let yes = with_program(
            "claude",
            "out",
            r#"{"loggedIn": true, "authMethod": "claude.ai"}"#,
            0,
        );
        let no = with_program(
            "claude",
            "out",
            r#"{"loggedIn": false, "authMethod": "none"}"#,
            1,
        );
        let path = |dir: &std::path::PathBuf| format!("{}:/usr/bin:/bin", dir.display());
        assert_eq!(ask("claude-code", &path(&yes)), Some(true));
        assert_eq!(ask("claude-code", &path(&no)), Some(false));
    }

    #[test]
    fn says_nothing_for_a_card_it_cant_ask_or_an_agent_not_installed() {
        assert_eq!(ask("hermes", "/usr/bin:/bin"), None);
        assert_eq!(ask("codex", "/nowhere"), None);
    }
}
