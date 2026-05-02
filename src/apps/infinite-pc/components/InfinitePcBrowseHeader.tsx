import { useTranslation } from "react-i18next";

export type InfinitePcBrowseTab = "os" | "games";

interface InfinitePcBrowseHeaderProps {
  tab: InfinitePcBrowseTab;
  onTabChange: (tab: InfinitePcBrowseTab) => void;
  osCount: number;
  gamesCount: number;
  gamesReady: boolean;
}

export function InfinitePcBrowseHeader({
  tab,
  onTabChange,
  osCount,
  gamesCount,
  gamesReady,
}: InfinitePcBrowseHeaderProps) {
  const { t } = useTranslation();

  const tabClass = (active: boolean) =>
    `font-apple-garamond !text-[18px] leading-tight transition-colors border-0 bg-transparent p-0 cursor-pointer ${
      active
        ? "text-white"
        : "text-gray-500 hover:text-gray-300"
    }`;

  return (
    <div className="bg-black px-4 py-2 border-b border-[#3a3a3a] shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 min-w-0">
          <button
            type="button"
            onClick={() => onTabChange("os")}
            className={tabClass(tab === "os")}
          >
            {t("apps.pc.tabs.os")}
          </button>
          <span
            className="font-apple-garamond !text-[18px] leading-tight text-gray-600 select-none"
            aria-hidden
          >
            |
          </span>
          <button
            type="button"
            onClick={() => onTabChange("games")}
            className={tabClass(tab === "games")}
          >
            {t("apps.pc.tabs.games")}
          </button>
        </div>
        <div className="font-geneva-12 text-gray-400 text-[12px] shrink-0 text-right">
          {tab === "os"
            ? t("apps.pc.systemsAvailable", { count: osCount })
            : gamesReady
              ? t("apps.pc.programsAvailable", { count: gamesCount })
              : t("apps.pc.loadingEmulator")}
        </div>
      </div>
    </div>
  );
}
