//! The menu bar (ADR 0215): the icon, its menu, and when it shows.
//!
//! On a Mac that runs the server as a login service, the icon is that server's: it shows while
//! the server answers and goes when it stops, and the app opens at login with this icon and
//! nothing else. On any other Mac the server is somewhere else, and the icon is there for as long
//! as the app runs.

use std::path::PathBuf;
use std::time::Duration;

use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle,
};

use crate::{here, login};

/// The icon's id, which `set_badge` finds it by.
pub const TRAY: &str = "chips";

/// How often the server is asked.
const EVERY: Duration = Duration::from_secs(5);

/// How many checks in a row may go unanswered before the icon goes: a busy Mac can stall one.
const MISSES: u32 = 3;

/// Whether the icon shows, from what the checks have heard: at once on an answer, and gone only
/// after `MISSES` in a row without one. Nothing heard yet counts as down.
pub struct Watch {
    misses: u32,
}

impl Default for Watch {
    fn default() -> Self {
        Self { misses: MISSES }
    }
}

impl Watch {
    pub fn heard(&mut self, answered: bool) -> bool {
        self.misses = if answered {
            0
        } else {
            self.misses.saturating_add(1)
        };
        self.misses < MISSES
    }
}

/// Where the menu bar looks: the person's home, the app's own folder, and the `.app` it runs from.
#[derive(Clone)]
pub struct Places {
    pub home: PathBuf,
    pub notes: PathBuf,
    pub bundle: Option<PathBuf>,
}

/// The icon and its menu, and the watch that shows and hides it.
pub fn install(app: &AppHandle, places: Places) -> tauri::Result<()> {
    let server_here = here::serving(&places.home).is_some();
    let running = MenuItem::with_id(
        app,
        "running",
        "Chips is running on this Mac",
        false,
        None::<&str>,
    )?;
    let open = MenuItem::with_id(app, "open", "Open Chips", true, None::<&str>)?;
    let at_login = CheckMenuItem::with_id(
        app,
        "login",
        "Open at Login",
        places.bundle.is_some(),
        login::is_on(&places.home),
        None::<&str>,
    )?;
    let line = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = if server_here {
        Menu::with_items(app, &[&running, &open, &at_login, &line, &quit])?
    } else {
        Menu::with_items(app, &[&open, &at_login, &line, &quit])?
    };

    let chosen = places.clone();
    TrayIconBuilder::with_id(TRAY)
        .menu(&menu)
        // The mark in one colour, as a template so macOS inks it; the app's own icon is a filled
        // square, and as a template that draws as a white block. macOS draws it 18 points tall,
        // so the 44 square stays sharp on a Retina screen.
        .icon(tauri::include_image!("icons/tray@2x.png"))
        .icon_as_template(true)
        .tooltip(crate::tooltip(0))
        .on_menu_event(move |app, event| match event.id().as_ref() {
            "open" => crate::show_window(app),
            "login" => {
                if let Some(bundle) = &chosen.bundle {
                    let on = at_login.is_checked().unwrap_or(false);
                    if login::turn(&chosen.home, &chosen.notes, bundle, on).is_err() {
                        let _ = at_login.set_checked(login::is_on(&chosen.home));
                    }
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    watch(app.clone(), places.home);
    Ok(())
}

/// Ask the server on this Mac every few seconds, and show the icon while it answers. With no
/// server here the icon simply stays. Looked up afresh each time, so a server `Run Chips here`
/// starts later is followed too.
fn watch(app: AppHandle, home: PathBuf) {
    std::thread::spawn(move || {
        let mut watch = Watch::default();
        let mut shown = None;
        loop {
            let show = match here::serving(&home) {
                Some(port) => watch.heard(here::answers(port)),
                None => true,
            };
            if shown != Some(show) {
                if let Some(tray) = app.tray_by_id(TRAY) {
                    if tray.set_visible(show).is_ok() {
                        shown = Some(show);
                    }
                }
            }
            std::thread::sleep(EVERY);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn nothing_heard_yet_is_down() {
        let mut watch = Watch::default();
        assert!(!watch.heard(false));
    }

    #[test]
    fn an_answer_shows_it_at_once() {
        let mut watch = Watch::default();
        assert!(watch.heard(true));
    }

    #[test]
    fn it_goes_only_after_three_misses_in_a_row() {
        let mut watch = Watch::default();
        assert!(watch.heard(true));
        assert!(watch.heard(false));
        assert!(watch.heard(false));
        assert!(watch.heard(true), "an answer starts the count again");
        assert!(watch.heard(false));
        assert!(watch.heard(false));
        assert!(!watch.heard(false));
        assert!(!watch.heard(false));
        assert!(watch.heard(true));
    }
}
