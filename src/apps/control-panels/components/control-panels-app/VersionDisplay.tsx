import { useTranslation } from "react-i18next";
import { useAppStoreShallow } from "@/stores/useAppStore";
import { getDocsBaseUrl } from "@/utils/runtimeConfig";

export function VersionDisplay() {
  const { t } = useTranslation();
  const { ryOSVersion, ryOSBuildNumber, launchApp } = useAppStoreShallow((state) => ({
    ryOSVersion: state.ryOSVersion,
    ryOSBuildNumber: state.ryOSBuildNumber,
    launchApp: state.launchApp,
  }));

  const displayVersion = ryOSVersion || "...";
  const displayBuild = ryOSBuildNumber ? ` (Build ${ryOSBuildNumber})` : "";

  return (
    <p className="text-[11px] text-neutral-600 font-geneva-12">
      ryOS {displayVersion}
      {displayBuild}
      {" · "}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          launchApp("internet-explorer", { url: "os.ryo.lu/docs/changelog", year: "current" });
        }}
        className="text-os-link hover:underline"
      >
        {t("apps.control-panels.viewChangelog")}
      </a>
      {" · "}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          launchApp("internet-explorer", {
            url: `${getDocsBaseUrl()}/privacy`,
            year: "current",
          });
        }}
        className="text-os-link hover:underline"
      >
        {t("apps.control-panels.privacyPolicy")}
      </a>
      {" · "}
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          launchApp("internet-explorer", {
            url: `${getDocsBaseUrl()}/terms`,
            year: "current",
          });
        }}
        className="text-os-link hover:underline"
      >
        {t("apps.control-panels.termsOfService")}
      </a>
    </p>
  );
}
