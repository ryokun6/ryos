import { Check, Ear, FileText, TextT, Translate, X } from "@phosphor-icons/react";
import { Skeleton } from "../shared/Skeleton";
import type { SongDetail } from "./types";
import type { SongDetailPanelViewModel } from "./useSongDetailPanel";

type Props = Pick<SongDetailPanelViewModel, "t" | "song" | "isLoading">;

function SoramimiStatus({
  song,
  t,
}: {
  song: SongDetail | null;
  t: SongDetailPanelViewModel["t"];
}) {
  const hasSoramimi = song?.soramimi && song.soramimi.length > 0;
  const soramimiByLang = song?.soramimiByLang;
  const hasSoramimiByLang =
    soramimiByLang && Object.keys(soramimiByLang).length > 0;

  if (hasSoramimi || hasSoramimiByLang) {
    const languages: string[] = [];
    if (hasSoramimi) languages.push("zh-TW");
    if (hasSoramimiByLang) {
      Object.keys(soramimiByLang).forEach((lang) => {
        if (!languages.includes(lang)) languages.push(lang);
      });
    }
    return (
      <>
        <Check className="size-3 text-green-500" weight="bold" />
        <span className="text-[11px] text-green-600">
          {languages.map((l) => t(`apps.admin.languages.${l}`, l)).join(", ")}
        </span>
      </>
    );
  }

  return (
    <>
      <X className="size-3 text-neutral-400" weight="bold" />
      <span className="text-[11px] text-neutral-400">
        {t("apps.admin.song.notGenerated", "Not generated")}
      </span>
    </>
  );
}

export function SongDetailPanelLyricsSection({ t, song, isLoading }: Props) {
  return (
    <div className="space-y-2">
      <div className="!text-[11px] uppercase tracking-wide text-os-text-secondary">
        {t("apps.admin.song.lyricsContent", "Lyrics Content")}
      </div>
      <div className="space-y-2">
        <div className="flex items-start gap-2 py-1.5">
          <FileText
            className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5"
            weight="bold"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500">
              {t("apps.admin.song.lyricsSource", "Lyrics")}
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-32 mt-1" />
            ) : (
              <div className="flex items-center gap-1 mt-0.5">
                {song?.lyrics?.lrc ? (
                  <>
                    <Check className="size-3 text-green-500" weight="bold" />
                    <span className="text-[11px] text-green-600">
                      {song.lyrics.parsedLines?.length || 0}{" "}
                      {t("apps.admin.song.lines", "lines")}
                      {song.lyrics.krc && (
                        <span className="text-neutral-400 ml-1">
                          (
                          {t(
                            "apps.admin.song.withWordTiming",
                            "with word timing"
                          )}
                          )
                        </span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <X className="size-3 text-neutral-400" weight="bold" />
                    <span className="text-[11px] text-neutral-400">
                      {t("apps.admin.song.notAvailable", "Not available")}
                    </span>
                  </>
                )}
              </div>
            )}
            {!isLoading && song?.lyricsSource && (
              <div className="text-[10px] text-neutral-400 mt-1">
                {t("apps.admin.song.source", "Source")}: {song.lyricsSource.title}{" "}
                - {song.lyricsSource.artist}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 py-1.5">
          <TextT
            className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5"
            weight="bold"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500">
              {t("apps.admin.song.furigana", "Furigana")}
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-24 mt-1" />
            ) : (
              <div className="flex items-center gap-1 mt-0.5">
                {song?.furigana && song.furigana.length > 0 ? (
                  <>
                    <Check className="size-3 text-green-500" weight="bold" />
                    <span className="text-[11px] text-green-600">
                      {song.furigana.length} {t("apps.admin.song.lines", "lines")}
                    </span>
                  </>
                ) : (
                  <>
                    <X className="size-3 text-neutral-400" weight="bold" />
                    <span className="text-[11px] text-neutral-400">
                      {t("apps.admin.song.notGenerated", "Not generated")}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 py-1.5">
          <Translate
            className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5"
            weight="bold"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500">
              {t("apps.admin.song.translations", "Translations")}
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-32 mt-1" />
            ) : (
              <div className="flex items-center gap-1 mt-0.5">
                {song?.translations &&
                Object.keys(song.translations).length > 0 ? (
                  <>
                    <Check className="size-3 text-green-500" weight="bold" />
                    <span className="text-[11px] text-green-600">
                      {Object.keys(song.translations)
                        .map((lang) =>
                          t(`apps.admin.languages.${lang}`, lang)
                        )
                        .join(", ")}
                    </span>
                  </>
                ) : (
                  <>
                    <X className="size-3 text-neutral-400" weight="bold" />
                    <span className="text-[11px] text-neutral-400">
                      {t("apps.admin.song.notGenerated", "Not generated")}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-start gap-2 py-1.5">
          <Ear
            className="size-3.5 text-neutral-400 flex-shrink-0 mt-0.5"
            weight="bold"
          />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-neutral-500">
              {t("apps.admin.song.soramimi", "Soramimi (空耳)")}
            </div>
            {isLoading ? (
              <Skeleton className="h-4 w-32 mt-1" />
            ) : (
              <div className="flex items-center gap-1 mt-0.5">
                <SoramimiStatus song={song} t={t} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
