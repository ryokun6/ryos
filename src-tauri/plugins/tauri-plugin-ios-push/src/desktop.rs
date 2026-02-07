use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};

use crate::models::*;
use crate::Error;

pub fn init<R: Runtime, C: DeserializeOwned>(
    app: &AppHandle<R>,
    _api: PluginApi<R, C>,
) -> crate::Result<IosPush<R>> {
    Ok(IosPush(app.clone()))
}

/// Desktop no-op implementation (kept for cross-platform compilation).
pub struct IosPush<R: Runtime>(AppHandle<R>);

impl<R: Runtime> IosPush<R> {
    pub fn request_push_permission(&self) -> crate::Result<PermissionState> {
        Err(Error::UnsupportedPlatform)
    }

    pub fn get_push_token(&self) -> crate::Result<String> {
        Err(Error::UnsupportedPlatform)
    }
}
