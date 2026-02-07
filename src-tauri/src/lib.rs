use tauri::{Manager, Url};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Always load the hosted app (https://os.ryo.lu) so the wrapper uses a stable origin
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let url = Url::parse("https://os.ryo.lu")?;
                window.set_title("")?;
                window.navigate(url)?;
            }
            Ok(())
        });

    builder
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
