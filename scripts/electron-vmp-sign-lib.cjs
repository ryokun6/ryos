/**
 * Production VMP signing for Castlabs Electron (Widevine).
 * Requires castlabs-evs (`python3 -m pip install castlabs-evs`) and EVS
 * credentials (EVS_ACCOUNT_NAME, EVS_PASSWD). Skips when unset.
 *
 * @see https://github.com/castlabs/electron-releases/wiki/EVS
 */

const { execSync } = require("node:child_process");

function pythonCommand() {
  return process.env.PYTHON ?? (process.platform === "win32" ? "python" : "python3");
}

function hasEvsCredentials() {
  return Boolean(process.env.EVS_ACCOUNT_NAME?.trim() && process.env.EVS_PASSWD);
}

function shouldVmpSign(platform, hook) {
  if (platform === "darwin" && hook === "afterPack") {
    return true;
  }
  if (platform === "win32" && hook === "afterSign") {
    return true;
  }
  return false;
}

function vmpSignPkg(appOutDir) {
  if (!hasEvsCredentials()) {
    console.warn(
      "[electron] Skipping VMP signing — set EVS_ACCOUNT_NAME and EVS_PASSWD for production Apple Music DRM."
    );
    return;
  }

  const python = pythonCommand();
  // --no-ask is a top-level vmp flag (-n), not a sign-pkg argument.
  const cmd = `${python} -m castlabs_evs.vmp -n sign-pkg "${appOutDir}"`;
  console.log("[electron] VMP signing package:", appOutDir);
  execSync(cmd, {
    stdio: "inherit",
    env: {
      ...process.env,
      EVS_NO_ASK: "1",
    },
  });
}

module.exports = {
  hasEvsCredentials,
  shouldVmpSign,
  vmpSignPkg,
};
