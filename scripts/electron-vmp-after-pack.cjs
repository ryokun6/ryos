const { shouldVmpSign, vmpSignPkg } = require("./electron-vmp-sign-lib.cjs");

/** @param {import("electron-builder").AfterPackContext} context */
exports.default = function electronVmpAfterPack(context) {
  if (!shouldVmpSign(context.electronPlatformName, "afterPack")) {
    return;
  }
  vmpSignPkg(context.appOutDir);
};
