use std::path::Path;

fn main() {
    let target = std::env::var("TARGET").unwrap_or_default();
    let profile = std::env::var("PROFILE").unwrap_or_default();

    let libmpv_path = Path::new("binaries/libmpv-2.dll");
    let ytdlp_filename = if target.contains("windows") {
        format!("binaries/yt-dlp-{target}.exe")
    } else {
        format!("binaries/yt-dlp-{target}")
    };
    let ytdlp_path = Path::new(&ytdlp_filename);

    println!("cargo:rerun-if-changed={}", libmpv_path.display());
    println!("cargo:rerun-if-changed={}", ytdlp_path.display());

    // In debug builds (such as `cargo test` / `cargo check`), allow building without
    // manually downloaded runtime binaries unless NOCTURNE_REQUIRE_BINARIES is set.
    let allow_missing_binaries =
        profile == "debug" && std::env::var_os("NOCTURNE_REQUIRE_BINARIES").is_none();

    if allow_missing_binaries && (!libmpv_path.exists() || !ytdlp_path.exists()) {
        let mut override_config = match std::env::var("TAURI_CONFIG") {
            Ok(raw) => serde_json::from_str::<serde_json::Value>(&raw)
                .unwrap_or_else(|_| serde_json::json!({})),
            Err(_) => serde_json::json!({}),
        };

        let root_obj = override_config
            .as_object_mut()
            .expect("TAURI_CONFIG must be a JSON object");
        let bundle_entry = root_obj
            .entry("bundle")
            .or_insert_with(|| serde_json::json!({}));
        if let Some(bundle_obj) = bundle_entry.as_object_mut() {
            if !libmpv_path.exists() {
                bundle_obj.insert("resources".to_string(), serde_json::Value::Null);
            }
            if !ytdlp_path.exists() {
                bundle_obj.insert("externalBin".to_string(), serde_json::Value::Null);
            }
        }

        std::env::set_var("TAURI_CONFIG", override_config.to_string());
    }

    tauri_build::build();
}
