use serde::de::DeserializeOwned;
use tauri::{
    plugin::{PluginApi, PluginHandle},
    AppHandle, Runtime,
};

use crate::models::*;

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_ios_push);

pub fn init<R: Runtime, C: DeserializeOwned>(
    _app: &AppHandle<R>,
    api: PluginApi<R, C>,
) -> crate::Result<IosPush<R>> {
    #[cfg(target_os = "android")]
    let handle = {
        let handle = api.register_android_plugin("app.tauri.iospush", "IosPushPlugin")?;
        handle
    };
    #[cfg(target_os = "ios")]
    let handle = api.register_ios_plugin(init_plugin_ios_push)?;

    Ok(IosPush(handle))
}

/// Access to the iOS push APIs.
pub struct IosPush<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> IosPush<R> {
    pub fn request_push_permission(&self) -> crate::Result<PermissionState> {
        self.0
            .run_mobile_plugin("requestPushPermission", ())
            .map_err(Into::into)
    }

    pub fn get_push_token(&self) -> crate::Result<String> {
        let result: PushTokenResponse = self
            .0
            .run_mobile_plugin("getPushToken", ())
            .map_err(Into::into)?;

        Ok(result.token)
    }
}
