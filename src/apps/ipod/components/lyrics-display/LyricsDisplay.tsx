import { useTranslation } from "react-i18next";
import type { LyricsDisplayProps } from "./types";
import { ErrorState, LoadingState } from "./LoadingErrorStates";
import { useLyricsDisplayController } from "./useLyricsDisplayController";
import { LyricsDisplayLines } from "./LyricsDisplayLines";

export function LyricsDisplay(props: LyricsDisplayProps) {
  const { t } = useTranslation();
  const vm = useLyricsDisplayController(props);

  const {
    visible = true,
    isLoading,
    error,
    isTranslating = false,
  } = props;

  if (!visible) return null;
  if (isLoading) {
    return <LoadingState bottomPaddingClass={vm.bottomPaddingClass} />;
  }
  if (error) {
    return (
      <ErrorState
        error={error}
        bottomPaddingClass={vm.bottomPaddingClass}
        textSizeClass={vm.textSizeClass}
        fontClassName={vm.fontClassName}
      />
    );
  }
  if (!vm.displayOriginalLines.length && !isLoading && !isTranslating) {
    return (
      <ErrorState
        error={t("apps.ipod.lyrics.noLyricsAvailable")}
        bottomPaddingClass={vm.bottomPaddingClass}
        textSizeClass={vm.textSizeClass}
        fontClassName={vm.fontClassName}
      />
    );
  }

  return (
    <div
      className={`absolute inset-x-0 mx-auto top-0 left-0 right-0 bottom-0 w-full h-full overflow-hidden flex flex-col items-center justify-end ${vm.gapClass} z-40 select-none no-select-gesture px-2 ${vm.bottomPaddingClass} ${vm.isOldSchoolKaraoke ? "lyrics-old-school" : ""}`}
      style={{
        ...(vm.containerStyle || {}),
        pointerEvents: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
      onWheel={vm.handleWheel}
      onTouchStart={vm.handleTouchStart}
      onTouchMove={vm.handleTouchMove}
      onTouchEnd={vm.handleTouchEnd}
      onTouchCancel={vm.handleTouchCancel}
    >
      <LyricsDisplayLines vm={vm} />
    </div>
  );
}
