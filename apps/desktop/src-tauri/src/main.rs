// Prevents an extra console window on Windows in release. macOS is what M2.2 builds, but the
// attribute is cheap and the day a Windows build happens it should not be a surprise.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    chips_desktop::run()
}
