//! The menus at the top of the screen, and their keys (ADR 0267).
//!
//! They are the iPad's (ADR 0256's sixth part) where the iPad has them, with the Mac's own around
//! them: the four sections on ⌘1 to ⌘4, New Space on ⌘N, Search Everything on ⇧⌘F, the space
//! before and after on ⌥↑ and ⌥↓, and Settings on ⌘, for You. What a command does is the page's,
//! as everything else is: a row chosen, or its keys, goes to the page by its id, and the page says
//! back which of them it can do now and under what name (`set_menu`). Until it has, they are dim.
//!
//! The shell keeps only what is the window's: how large the page is drawn (⌘0, ⌘+ and ⌘−).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem, Submenu},
    AppHandle, Emitter, Manager, Runtime, Wry,
};

/// What the page hears when one of its commands is chosen: the command's id.
pub const CHOSEN: &str = "chips://menu";

/// What the page hears when it is drawn at another size: the size, so that the strip under the
/// traffic lights stays their height however large the page is drawn.
pub const ZOOMED: &str = "chips://zoom";

/// A command the page carries out: its id, its name until the page gives another, and its keys.
struct Command {
    id: &'static str,
    title: &'static str,
    keys: Option<&'static str>,
}

const fn command(id: &'static str, title: &'static str, keys: Option<&'static str>) -> Command {
    Command { id, title, keys }
}

const SETTINGS: Command = command("settings", "Settings…", Some("CmdOrCtrl+,"));
const NEW_SPACE: Command = command("new-space", "New Space", Some("CmdOrCtrl+N"));
const SECTIONS: [Command; 4] = [
    command("tab-spaces", "Spaces", Some("CmdOrCtrl+1")),
    command("tab-agents", "Agents", Some("CmdOrCtrl+2")),
    command("tab-search", "Search", Some("CmdOrCtrl+3")),
    command("tab-you", "You", Some("CmdOrCtrl+4")),
];
const SEARCH_EVERYTHING: Command = command(
    "search-everything",
    "Search Everything",
    Some("CmdOrCtrl+Shift+F"),
);
const STEPS: [Command; 2] = [
    command("previous-space", "Previous Space", Some("Alt+Up")),
    command("next-space", "Next Space", Some("Alt+Down")),
];
const FEEDBACK: Command = command("feedback", "Send Feedback…", None);

/// The window's own: how large the page is drawn.
const ACTUAL_SIZE: &str = "zoom-actual";
const ZOOM_IN: &str = "zoom-in";
const ZOOM_OUT: &str = "zoom-out";

/// The sizes ⌘+ and ⌘− step through, as Safari's do.
const ZOOMS: [f64; 9] = [0.75, 0.85, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5];

/// The page's commands as the menus hold them, by id, to dim and rename.
#[derive(Default)]
pub struct Commands(Mutex<HashMap<&'static str, MenuItem<Wry>>>);

/// How one command stands now, as the page says it.
#[derive(Debug, serde::Deserialize)]
pub struct Standing {
    id: String,
    title: String,
    enabled: bool,
}

/// The menu bar: Chips, File, Edit, View, Space, Window and Help.
pub fn build(app: &AppHandle) -> tauri::Result<Menu<Wry>> {
    let commands = app.state::<Commands>();
    let mut held = commands.0.lock().map_err(|_| tauri::Error::FailedToReceiveMessage)?;
    let mut item = |made: &Command| -> tauri::Result<MenuItem<Wry>> {
        let item = MenuItem::with_id(app, made.id, made.title, false, made.keys)?;
        held.insert(made.id, item.clone());
        Ok(item)
    };
    let line = || PredefinedMenuItem::separator(app);

    let chips = Submenu::with_items(
        app,
        "Chips",
        true,
        &[
            &PredefinedMenuItem::about(app, Some("About Chips"), None)?,
            &line()?,
            &item(&SETTINGS)?,
            &line()?,
            &PredefinedMenuItem::services(app, None)?,
            &line()?,
            &PredefinedMenuItem::hide(app, Some("Hide Chips"))?,
            &PredefinedMenuItem::hide_others(app, None)?,
            &PredefinedMenuItem::show_all(app, None)?,
            &line()?,
            &PredefinedMenuItem::quit(app, Some("Quit Chips"))?,
        ],
    )?;
    let file = Submenu::with_items(
        app,
        "File",
        true,
        &[&PredefinedMenuItem::close_window(app, None)?],
    )?;
    let edit = Submenu::with_items(
        app,
        "Edit",
        true,
        &[
            &PredefinedMenuItem::undo(app, None)?,
            &PredefinedMenuItem::redo(app, None)?,
            &line()?,
            &PredefinedMenuItem::cut(app, None)?,
            &PredefinedMenuItem::copy(app, None)?,
            &PredefinedMenuItem::paste(app, None)?,
            &PredefinedMenuItem::select_all(app, None)?,
        ],
    )?;
    let [spaces, agents, search, you] = SECTIONS.each_ref().map(&mut item);
    let view = Submenu::with_items(
        app,
        "View",
        true,
        &[
            &spaces?,
            &agents?,
            &search?,
            &you?,
            &line()?,
            &MenuItem::with_id(app, ACTUAL_SIZE, "Actual Size", true, Some("CmdOrCtrl+0"))?,
            &MenuItem::with_id(app, ZOOM_IN, "Zoom In", true, Some("CmdOrCtrl+="))?,
            &MenuItem::with_id(app, ZOOM_OUT, "Zoom Out", true, Some("CmdOrCtrl+-"))?,
            &line()?,
            &PredefinedMenuItem::fullscreen(app, Some("Enter Full Screen"))?,
        ],
    )?;
    let [previous, next] = STEPS.each_ref().map(&mut item);
    // New Space with the other commands for spaces, as on the iPad.
    let space = Submenu::with_items(
        app,
        "Space",
        true,
        &[
            &item(&NEW_SPACE)?,
            &item(&SEARCH_EVERYTHING)?,
            &line()?,
            &previous?,
            &next?,
        ],
    )?;
    let window = Submenu::with_items(
        app,
        "Window",
        true,
        &[
            &PredefinedMenuItem::minimize(app, None)?,
            &PredefinedMenuItem::maximize(app, Some("Zoom"))?,
            &line()?,
            &PredefinedMenuItem::bring_all_to_front(app, None)?,
        ],
    )?;
    let help = Submenu::with_items(app, "Help", true, &[&item(&FEEDBACK)?])?;
    drop(held);

    // macOS lists the windows under Window, and puts its search field in Help.
    window.set_as_windows_menu_for_nsapp()?;
    help.set_as_help_menu_for_nsapp()?;
    Menu::with_items(app, &[&chips, &file, &edit, &view, &space, &window, &help])
}

/// A row chosen, or its keys pressed: the page's commands go to the page, and the window's are
/// done here. The menu bar icon's rows come here too, and are not these. A command chosen with the
/// window closed, from the Dock's Chips, brings the window back to be seen doing it.
pub fn chosen(app: &AppHandle, id: &str) {
    match id {
        ACTUAL_SIZE => zoom(app, |_| 1.0),
        ZOOM_IN => zoom(app, |now| step(now, 1)),
        ZOOM_OUT => zoom(app, |now| step(now, -1)),
        _ => {
            let commands = app.state::<Commands>();
            let page = commands.0.lock().is_ok_and(|held| held.contains_key(id));
            if page {
                if app.get_webview_window(crate::WINDOW).is_some() {
                    crate::show_window(app);
                }
                let _ = app.emit_to(crate::WINDOW, CHOSEN, id);
            }
        }
    }
}

/// The page says which commands it can do now, and what each is called: dim the rest.
pub fn stand(commands: &Commands, standing: &[Standing]) {
    let Ok(held) = commands.0.lock() else {
        return;
    };
    for each in standing {
        if let Some(item) = held.get(each.id.as_str()) {
            let _ = item.set_enabled(each.enabled);
            if item.text().ok().as_deref() != Some(each.title.as_str()) {
                let _ = item.set_text(&each.title);
            }
        }
    }
}

/// The size after `now`, one step larger or smaller, and no further than the ends.
fn step(now: f64, by: i32) -> f64 {
    let at = ZOOMS
        .iter()
        .position(|size| (size - now).abs() < 0.001)
        .map(|at| at as i32)
        // A size off the list (a hand-edited file) steps from where it would sit.
        .unwrap_or_else(|| ZOOMS.iter().filter(|size| **size < now).count() as i32 - (by > 0) as i32);
    ZOOMS[(at + by).clamp(0, ZOOMS.len() as i32 - 1) as usize]
}

/// Draw the page at a new size and keep it for next time.
fn zoom(app: &AppHandle, to: impl Fn(f64) -> f64) {
    let Some(window) = app.get_webview_window(crate::WINDOW) else {
        return;
    };
    let file = zoom_file(app);
    let next = to(file.as_deref().map(read_zoom).unwrap_or(1.0));
    if window.set_zoom(next).is_ok() {
        let _ = app.emit_to(crate::WINDOW, ZOOMED, next);
        if let Some(file) = file {
            let _ = std::fs::create_dir_all(file.parent().unwrap_or(&file));
            let _ = std::fs::write(&file, format!("{next}\n"));
        }
    }
}

/// The size the page was last drawn at, for a window being made.
pub fn kept_zoom<R: Runtime>(app: &AppHandle<R>) -> f64 {
    zoom_file(app).as_deref().map(read_zoom).unwrap_or(1.0)
}

fn zoom_file<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    Some(app.path().app_config_dir().ok()?.join("zoom"))
}

/// One number in a file of its own; anything else, or nothing, is the actual size.
fn read_zoom(file: &std::path::Path) -> f64 {
    std::fs::read_to_string(file)
        .ok()
        .and_then(|said| said.trim().parse::<f64>().ok())
        .filter(|size| (ZOOMS[0]..=ZOOMS[ZOOMS.len() - 1]).contains(size))
        .unwrap_or(1.0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn zoom_steps_along_the_sizes_and_stops_at_the_ends() {
        assert_eq!(step(1.0, 1), 1.1);
        assert_eq!(step(1.0, -1), 0.85);
        assert_eq!(step(2.5, 1), 2.5);
        assert_eq!(step(0.75, -1), 0.75);
    }

    #[test]
    fn a_size_off_the_list_steps_to_its_neighbours() {
        assert_eq!(step(1.2, 1), 1.25);
        assert_eq!(step(1.2, -1), 1.1);
    }

    #[test]
    fn a_file_that_says_no_size_is_the_actual_size() {
        let dir = std::env::temp_dir().join(format!("chips-zoom-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let file = dir.join("zoom");
        std::fs::write(&file, "1.25\n").unwrap();
        assert_eq!(read_zoom(&file), 1.25);
        std::fs::write(&file, "nine").unwrap();
        assert_eq!(read_zoom(&file), 1.0);
        std::fs::write(&file, "40").unwrap();
        assert_eq!(read_zoom(&file), 1.0);
        assert_eq!(read_zoom(&dir.join("none")), 1.0);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn the_page_and_the_shell_name_the_same_commands() {
        // `apps/web/src/app/menuBar.ts` lists these ids; a renamed one would go nowhere.
        let ids: Vec<&str> = [&SETTINGS, &NEW_SPACE, &SEARCH_EVERYTHING, &FEEDBACK]
            .into_iter()
            .chain(SECTIONS.iter())
            .chain(STEPS.iter())
            .map(|each| each.id)
            .collect();
        let page = include_str!("../../../web/src/app/menuBar.ts");
        for id in ids {
            assert!(page.contains(&format!("\"{id}\"")), "the page has no command {id}");
        }
    }
}
