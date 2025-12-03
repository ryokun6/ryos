import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useThemeStore } from "@/stores/useThemeStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AboutFinderDialog } from "@/components/dialogs/AboutFinderDialog";
import { AnyApp } from "@/apps/base/types";
import { AppId } from "@/config/appIds";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { getTranslatedAppName } from "@/utils/i18n";

interface StartMenuProps {
  apps: AnyApp[];
}

export function StartMenu({ apps }: StartMenuProps) {
  const { t } = useTranslation();
  const launchApp = useLaunchApp();
  const [isStartMenuOpen, setIsStartMenuOpen] = useState(false);
  const [aboutFinderOpen, setAboutFinderOpen] = useState(false);
  const currentTheme = useThemeStore((state) => state.current);

  const handleAppClick = (appId: string) => {
    launchApp(appId as AppId);
    setIsStartMenuOpen(false);
  };

  return (
    <>
      <DropdownMenu open={isStartMenuOpen} onOpenChange={setIsStartMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="flex items-center gap-1 px-2 text-white font-bold transition-all"
            style={{
              width: currentTheme === "xp" ? "auto" : "auto",
              minWidth: currentTheme === "xp" ? "100px" : "auto",
              height: currentTheme === "xp" ? "100%" : "85%",
              marginTop: currentTheme === "win98" ? "2px" : "0px",
              marginLeft: currentTheme === "win98" ? "4px" : "0px",
              borderRadius: currentTheme === "xp" ? "0 12px 12px 0" : "0",
              background:
                currentTheme === "xp"
                  ? isStartMenuOpen
                    ? "linear-gradient(0deg, #2f892f 0%, #4eb64e 6%, #4eb64e 51%, #4eb64e 63%, #4eb64e 77%, #c4ffc4 85%, #c4ffc4 93%, #2f892f 97%)"
                    : "linear-gradient(0deg, #0c450c 0%, #308f2f 6%, #308f2f 51%, #308f2f 63%, #308f2f 77%, #97c597 85%, #97c597 93%, #308f2f 97%)"
                  : "#c0c0c0", // Flat gray for Windows 98
              border: currentTheme === "xp" ? "none" : "none", // Windows 98 uses box-shadow instead of border
              color: currentTheme === "xp" ? "#ffffff" : "#000000",
              fontWeight: currentTheme === "xp" ? "500" : "bold",
              fontSize: currentTheme === "xp" ? "1.1rem" : "11px",
              fontStyle: currentTheme === "xp" ? "italic" : "normal",
              boxShadow:
                currentTheme === "xp"
                  ? "-2px -2px 10px #0000008e inset"
                  : isStartMenuOpen
                  ? "inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px grey" // Windows 98 pressed
                  : "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf", // Windows 98 raised
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
            onMouseEnter={(e) => {
              if (currentTheme === "win98" && !isStartMenuOpen) {
                // Windows 98 hover - keep raised style, don't depress
                e.currentTarget.style.boxShadow =
                  "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
              }
            }}
            onMouseLeave={(e) => {
              if (currentTheme === "win98" && !isStartMenuOpen) {
                // Windows 98 return to normal raised state
                e.currentTarget.style.boxShadow =
                  "inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px grey, inset 2px 2px #dfdfdf";
              }
            }}
          >
            <ThemedIcon
              name="apple.png"
              alt="Start"
              className={`[image-rendering:pixelated] ${
                currentTheme === "xp" ? "w-5 h-4" : "w-5 h-5"
              }`}
              style={{
                filter:
                  currentTheme === "xp"
                    ? "drop-shadow(2px 2px 2px rgba(0, 0, 0, 0.705))"
                    : "none",
              }}
            />
            <span
              className={`tracking-wider whitespace-nowrap ${
                currentTheme === "xp" ? "pr-2" : ""
              }`}
              style={{
                textShadow:
                  currentTheme === "xp"
                    ? "2px 2px 2px rgba(0, 0, 0, 0.685)"
                    : "none",
              }}
            >
              {currentTheme === "xp" ? t("common.startMenu.start").toLowerCase() : t("common.startMenu.start")}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={0}
          className="p-0 overflow-hidden"
          style={{
            // Narrower overall width; differentiate slightly for themes if desired
            width: "280px",
            maxHeight: "80vh",
            background:
              currentTheme === "xp" || currentTheme === "win98"
                ? "#ece9d8"
                : "#c0c0c0",
            border:
              currentTheme === "xp"
                ? "3px solid #0855dd"
                : currentTheme === "win98"
                ? "2px outset #c0c0c0"
                : "2px outset #c0c0c0",
            borderRadius: currentTheme === "xp" ? "5px 5px 0 0" : "0",
          }}
        >
          <div className="flex h-full">
            {/* Left Panel with rotated text */}
            {(currentTheme === "xp" || currentTheme === "win98") && (
              <div
                className="relative w-[32px] overflow-hidden"
                style={{
                  background:
                    currentTheme === "xp"
                      ? "linear-gradient(to bottom, #3a6fd8, #2559ce)"
                      : "linear-gradient(to bottom, #1e4096, #143366)",
                  borderRight: "1px solid #1f4788",
                }}
              >
                <div
                  className="absolute whitespace-nowrap text-white font-semibold"
                  style={{
                    bottom: "8px",
                    left: "50%",
                    transform: "rotate(-90deg)",
                    transformOrigin: "left",
                    fontSize: "16px",
                    textShadow: "1px 1px 2px rgba(0,0,0,0.5)",
                    width: "400px",
                    textAlign: "left",
                  }}
                >
                  ryOS{" "}
                  <span style={{ fontWeight: "100" }}>
                    {currentTheme === "xp" ? t("common.startMenu.ryosProfessional") : t("common.startMenu.ryos98")}
                  </span>
                </div>
              </div>
            )}

            {/* Right Panel with menu items */}
            <div
              className="flex-1 flex flex-col"
              style={{
                background:
                  currentTheme === "xp" || currentTheme === "win98"
                    ? "#ffffff"
                    : "#c0c0c0",
                maxHeight: "80vh", // Responsive height to enable scrolling
              }}
            >
              {/* All Menu Items Section */}
              <div className="py-1 overflow-y-auto flex-1 min-h-0">
                {/* About This Computer */}
                <DropdownMenuItem
                  onClick={() => setAboutFinderOpen(true)}
                  className="h-8 px-3 flex items-center gap-2 hover:bg-blue-500 hover:text-white"
                  style={{
                    fontSize: "11px",
                    color: "#000000",
                    fontFamily: "var(--font-ms-sans)",
                    imageRendering: "pixelated",
                  }}
                >
                  <ThemedIcon
                    name="info.png"
                    alt="About"
                    className="w-6 h-6 [image-rendering:pixelated]"
                  />
                  {t("common.startMenu.aboutThisComputer")}
                </DropdownMenuItem>

                {/* Separator */}
                <div
                  className="border-b mx-2 my-1"
                  style={{ borderColor: "#9e9e9e" }}
                />

                {/* Apps */}
                {apps.map((app) => (
                  <DropdownMenuItem
                    key={app.id}
                    onClick={() => handleAppClick(app.id)}
                    className="h-8 px-3 flex items-center gap-2 hover:bg-blue-500 hover:text-white"
                    style={{
                      fontSize: "11px",
                      color: "#000000",
                      fontFamily: "var(--font-ms-sans)",
                      imageRendering: "pixelated",
                    }}
                  >
                    {typeof app.icon === "string" ? (
                      app.icon.startsWith("/icons/") ? (
                        <ThemedIcon
                          name={app.icon}
                          alt={app.name}
                          className="w-6 h-6 [image-rendering:pixelated]"
                        />
                      ) : (
                        <div className="w-6 h-6 flex items-center justify-center">
                          {app.icon}
                        </div>
                      )
                    ) : (
                      <ThemedIcon
                        name={app.icon.src}
                        alt={app.name}
                        className="w-6 h-6 [image-rendering:pixelated]"
                      />
                    )}
                    {getTranslatedAppName(app.id as AppId)}
                  </DropdownMenuItem>
                ))}
              </div>
            </div>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <AboutFinderDialog
        isOpen={aboutFinderOpen}
        onOpenChange={setAboutFinderOpen}
      />
    </>
  );
}
