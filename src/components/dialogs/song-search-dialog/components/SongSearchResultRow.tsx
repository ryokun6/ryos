import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { decodeHtmlEntities } from "@/utils/decodeHtmlEntities";
import type { Track } from "@/stores/useIpodStore";
import type { SongSearchResult } from "../types";

type SongSearchResultRowProps = {
  index: number;
  selected: boolean;
  isAppleMusicMode: boolean;
  appleMusicResult?: Track;
  youtubeResult?: SongSearchResult;
  fontClass: string;
  fontStyle: CSSProperties | undefined;
  onSelectIndex: (index: number) => void;
  onSelectAndAdd: (index: number) => void | Promise<void>;
};

export function SongSearchResultRow({
  index,
  selected,
  isAppleMusicMode,
  appleMusicResult,
  youtubeResult,
  fontClass,
  fontStyle,
  onSelectIndex,
  onSelectAndAdd,
}: SongSearchResultRowProps) {
  const rowStyle: CSSProperties = {
    ...fontStyle,
    padding: "8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    boxSizing: "border-box",
    background: selected
      ? undefined
      : index % 2 === 1
        ? "var(--os-color-list-row-alt-bg)"
        : "var(--os-color-input-bg)",
  };

  if (isAppleMusicMode && appleMusicResult) {
    return (
      <div
        key={appleMusicResult.id}
        onClick={() => onSelectIndex(index)}
        onDoubleClick={() => void onSelectAndAdd(index)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void onSelectAndAdd(index);
          }
        }}
        tabIndex={0}
        role="button"
        className={cn(fontClass, "w-full")}
        data-selected={selected ? "true" : undefined}
        style={rowStyle}
      >
        {appleMusicResult.cover && (
          <img
            src={appleMusicResult.cover}
            alt=""
            style={{
              width: "42px",
              height: "42px",
              objectFit: "cover",
              borderRadius: "4px",
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0, width: 0 }}>
          <div className="font-semibold truncate">{appleMusicResult.title}</div>
          <div
            className="truncate"
            style={{
              opacity: selected ? 0.8 : 1,
              color: selected ? undefined : "var(--os-color-text-secondary)",
            }}
          >
            {[appleMusicResult.artist, appleMusicResult.album]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      </div>
    );
  }

  if (!youtubeResult) return null;

  return (
    <div
      key={youtubeResult.videoId}
      onClick={() => onSelectIndex(index)}
      onDoubleClick={() => void onSelectAndAdd(index)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          void onSelectAndAdd(index);
        }
      }}
      tabIndex={0}
      role="button"
      className={cn(fontClass, "w-full")}
      data-selected={selected ? "true" : undefined}
      style={rowStyle}
    >
      {youtubeResult.thumbnail && (
        <img
          src={youtubeResult.thumbnail}
          alt=""
          style={{
            width: "48px",
            height: "36px",
            objectFit: "cover",
            borderRadius: "4px",
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0, width: 0 }}>
        <div className="font-semibold truncate">
          {decodeHtmlEntities(youtubeResult.title)}
        </div>
        <div
          className="truncate"
          style={{
            opacity: selected ? 0.8 : 1,
            color: selected ? undefined : "var(--os-color-text-secondary)",
          }}
        >
          {decodeHtmlEntities(youtubeResult.channelTitle)}
        </div>
      </div>
    </div>
  );
}
