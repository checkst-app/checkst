// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Velopack must run before anything else: during install, update and
    // uninstall it may handle the hook and exit or restart the process.
    velopack::VelopackApp::build().run();
    checkst_lib::run()
}
