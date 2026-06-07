import { MediaVisualLayers } from "@/components/shared/MediaVisualLayers";
import { DisplayMode } from "@/types/lyrics";
import type { Track } from "@/stores/useIpodStore";

type KaraokeVisualLayersProps = {
  effectiveDisplayMode: DisplayMode;
  visualBackgroundActive: boolean;
  currentTrack: Track | null;
  coverUrl: string | null | undefined;
  isPlaying: boolean;
  layerClassName: string;
  coverOverlayClassName: string;
  onCoverInteraction: () => void;
};

export function KaraokeVisualLayers({
  effectiveDisplayMode,
  visualBackgroundActive,
  currentTrack,
  coverUrl,
  isPlaying,
  layerClassName,
  coverOverlayClassName,
  onCoverInteraction,
}: KaraokeVisualLayersProps) {
  return (
    <MediaVisualLayers
      effectiveDisplayMode={effectiveDisplayMode}
      isActive={visualBackgroundActive}
      coverUrl={coverUrl}
      isPlaying={isPlaying}
      layerClassName={layerClassName}
      coverOverlayClassName={coverOverlayClassName}
      coverTitle={currentTrack?.title}
      onCoverInteraction={onCoverInteraction}
      requireTrackForBackgrounds
      hasTrack={Boolean(currentTrack)}
    />
  );
}
