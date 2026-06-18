const { shouldVmpSign, vmpSignPkg } = require("./electron-vmp-sign-lib.cjs");

/** @param {import("electron-builder").AfterPackContext} context */
exports.default = function electronVmpAfterSign(context) {
  if (!shouldVmpSign(context.electronPlatformName, "afterSign")) {
    return;
  }
  vmpSignPkg(context.appOutDir);
};
