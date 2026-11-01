//! Your folder (ADR 0224): the room's project as a folder on this Mac, through the carried
//! `chips project folder <op> --json`. The page asks the server for a project token and hands it
//! over with the room, the server and the person; they go into the command's environment, never
//! among its words, and its one line of JSON comes back. The shell takes nine words and values in
//! the shapes Chips makes them, so the page can have it run nothing else: no git of its own, no
//! path outside the folder, no option a program would read. Run (ADR 0226) runs only what the
//! folder's `chips.json` says, and only when that is the command the person was shown; it and Open
//! in browser happen only for the server on this Mac, fetched over loopback (ADR 0231).

use std::path::Path;
use std::process::{Command, Stdio};

/// What the card can ask for.
pub const OPS: [&str; 9] = [
    "look", "open", "send", "editor", "file", "view", "run", "stop", "status",
];

/// What happens only for the server on this Mac (ADR 0231): Run, and Open in browser. Each fetches
/// the project from that server over loopback, and from no address the page names.
pub const HERE_OPS: [&str; 2] = ["run", "view"];

/// What the page asks with.
#[derive(Debug, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asked {
    pub space_id: String,
    pub title: String,
    pub server: String,
    pub person_id: String,
    pub name: String,
    pub token: String,
    pub words: Option<String>,
    pub file: Option<String>,
    /// For Run, the command the person was shown.
    pub command: Option<String>,
}

/// An id Chips made: its prefix, then letters and digits.
fn id(said: &str, prefix: &str, len: std::ops::RangeInclusive<usize>) -> bool {
    said.strip_prefix(prefix).is_some_and(|rest| {
        len.contains(&rest.len()) && rest.chars().all(|c| c.is_ascii_alphanumeric())
    })
}

/// Words a person wrote: no longer than `most`, and nothing a terminal or a file name would read.
fn words(said: &str, most: usize, lines: bool) -> bool {
    said.chars().count() <= most
        && !said
            .chars()
            .any(|c| c.is_control() && !(lines && (c == '\n' || c == '\t')))
}

/// Whether the page's ask is one the shell takes. `here` is where the server on this Mac answers,
/// when one does.
pub fn checked(op: &str, asked: &Asked, here: Option<&str>) -> Result<(), String> {
    if !OPS.contains(&op) {
        return Err("Your folder can't do that.".to_string());
    }
    if HERE_OPS.contains(&op) && here != Some(asked.server.as_str()) {
        return Err(
            "Run and Open in browser work only on the Mac where this workspace's server runs, for its owner."
                .to_string(),
        );
    }
    let server = asked.server.starts_with("http://") || asked.server.starts_with("https://");
    let token = asked.token.starts_with("chips_pt_")
        && asked.token.len() <= 512
        && asked
            .token
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '.' || c == '-');
    let file = asked.file.as_deref().map_or(true, |file| {
        words(file, 1024, false)
            && !file.starts_with('/')
            && !file.starts_with('-')
            && !file.split('/').any(|part| part == "..")
    });
    let fits = id(&asked.space_id, "spc_", 26..=26)
        && id(&asked.person_id, "usr_", 8..=64)
        && server
        && asked.server.len() <= 512
        && !asked
            .server
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || c == '\'' || c == '"')
        && token
        && words(&asked.title, 200, false)
        && words(&asked.name, 100, false)
        && asked
            .words
            .as_deref()
            .map_or(true, |said| words(said, 4000, true))
        && asked
            .command
            .as_deref()
            .map_or(true, |said| words(said, 1100, true))
        && file;
    if fits {
        Ok(())
    } else {
        Err("That isn't a space and a token Chips made.".to_string())
    }
}

/// The environment the command is run with: the ask, and nothing of it among its words.
pub fn environment(asked: &Asked) -> Vec<(&'static str, String)> {
    let mut env = vec![
        ("CHIPS_FOLDER_SPACE", asked.space_id.clone()),
        ("CHIPS_FOLDER_TITLE", asked.title.clone()),
        ("CHIPS_FOLDER_SERVER", asked.server.clone()),
        ("CHIPS_FOLDER_PERSON", asked.person_id.clone()),
        ("CHIPS_FOLDER_NAME", asked.name.clone()),
        ("CHIPS_FOLDER_TOKEN", asked.token.clone()),
    ];
    if let Some(said) = &asked.words {
        env.push(("CHIPS_FOLDER_WORDS", said.clone()));
    }
    if let Some(file) = &asked.file {
        env.push(("CHIPS_FOLDER_FILE", file.clone()));
    }
    if let Some(command) = &asked.command {
        env.push(("CHIPS_FOLDER_COMMAND", command.clone()));
    }
    env
}

/// `chips project folder <op> --json`, its last line of JSON, or what it said on the way out.
pub fn run(program: &Path, op: &str, asked: &Asked, here: Option<&str>) -> Result<String, String> {
    checked(op, asked, here)?;
    let output = Command::new(program)
        .args(["project", "folder", op, "--json"])
        .envs(environment(asked))
        .stdin(Stdio::null())
        .output()
        .map_err(|error| error.to_string())?;
    let said = String::from_utf8_lossy(&output.stdout);
    match said
        .lines()
        .rev()
        .find(|line| line.trim_start().starts_with('{'))
    {
        Some(line) => Ok(line.trim().to_string()),
        None => {
            let errors = String::from_utf8_lossy(&output.stderr);
            let last = errors.lines().rev().find(|line| !line.trim().is_empty());
            Err(last
                .map(|line| line.trim().to_string())
                .unwrap_or_else(|| "Chips couldn't reach your folder.".to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn asked() -> Asked {
        Asked {
            space_id: "spc_01K4ZQPX000000000000000001".to_string(),
            title: "Sudoku mini".to_string(),
            server: "http://127.0.0.1:4431".to_string(),
            person_id: "usr_01K4ZQPX000000000000000002".to_string(),
            name: "Arjun".to_string(),
            token: "chips_pt_dev_01K4.1790000000.ab12".to_string(),
            words: Some("Bigger cells\n\nOn small screens.".to_string()),
            file: Some("src/style.css".to_string()),
            command: Some("npm install\nnpm run dev".to_string()),
        }
    }

    const HERE: Option<&str> = Some("http://127.0.0.1:4431");

    #[test]
    fn takes_a_room_and_a_token_chips_made() {
        assert!(checked("send", &asked(), HERE).is_ok());
        assert!(checked("run", &asked(), HERE).is_ok());
        assert!(checked("view", &asked(), HERE).is_ok());
        assert!(checked("rm", &asked(), HERE).is_err());
        for bad in [
            Asked {
                space_id: "spc_../etc".to_string(),
                ..asked()
            },
            Asked {
                token: "Bearer x".to_string(),
                ..asked()
            },
            Asked {
                server: "file:///etc".to_string(),
                ..asked()
            },
            Asked {
                server: "http://a b".to_string(),
                ..asked()
            },
            Asked {
                file: Some("../../.ssh/id_rsa".to_string()),
                ..asked()
            },
            Asked {
                file: Some("/etc/hosts".to_string()),
                ..asked()
            },
            Asked {
                file: Some("-a".to_string()),
                ..asked()
            },
            Asked {
                title: "a\u{1b}b".to_string(),
                ..asked()
            },
            Asked {
                command: Some("x".repeat(1101)),
                ..asked()
            },
        ] {
            assert!(checked("look", &bad, HERE).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn runs_and_opens_in_a_browser_only_for_the_server_on_this_mac() {
        let elsewhere = Asked {
            server: "https://chips.example.net:4431".to_string(),
            ..asked()
        };
        for op in HERE_OPS {
            assert!(checked(op, &asked(), HERE).is_ok(), "{op}");
            assert!(checked(op, &elsewhere, HERE).is_err(), "{op}");
            assert!(checked(op, &asked(), None).is_err(), "{op}");
            assert!(
                checked(op, &asked(), Some("http://127.0.0.1:4500")).is_err(),
                "{op}"
            );
        }
        // Your folder stays for any workspace: a look, Send, Open folder, a file, Stop.
        for op in ["look", "send", "open", "editor", "file", "stop", "status"] {
            assert!(checked(op, &elsewhere, None).is_ok(), "{op}");
        }
    }

    #[test]
    fn hands_everything_over_in_the_environment() {
        let env = environment(&asked());
        assert!(env.contains(&(
            "CHIPS_FOLDER_TOKEN",
            "chips_pt_dev_01K4.1790000000.ab12".to_string()
        )));
        assert!(env.contains(&("CHIPS_FOLDER_FILE", "src/style.css".to_string())));
        assert!(env.contains(&(
            "CHIPS_FOLDER_COMMAND",
            "npm install\nnpm run dev".to_string()
        )));
        let bare = environment(&Asked {
            words: None,
            file: None,
            command: None,
            ..asked()
        });
        assert_eq!(bare.len(), 6);
    }
}
