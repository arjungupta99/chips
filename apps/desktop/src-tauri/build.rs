/// The shell's own commands, each allowed only where a capability says (ADR 0231): the main
/// window, and no other window should one ever be made.
const COMMANDS: &[&str] = &[
    "can_run_here",
    "programs_here",
    "signed_in_here",
    "run_here",
    "connect_here",
    "cancel_connect",
    "discover_servers",
    "ask_about",
    "set_badge",
    "tell",
    "take_links",
    "hold_page",
    "project_folder",
    "server_here",
    "come_forward",
    "set_menu",
    "open_link",
    "link_reach",
    "open_tailscale",
    "page_zoom",
    "drawn",
    "update_state",
    "update_now",
];

fn main() {
    // A build made to hand out updates itself (ADR 0298); `update.rs` reads this at compile time.
    println!("cargo:rerun-if-env-changed=CHIPS_MAC_SELF_UPDATE");
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("tauri-build failed");
}
