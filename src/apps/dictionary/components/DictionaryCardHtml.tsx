import { useEffect, useRef } from "react";
import DOMPurify from "dompurify";
import { cn } from "@/lib/utils";
import { dictionaryMediaKey, getDictionaryMediaUrl } from "../utils/anki/media";
import {
  isRelativeMediaSrc,
  replaceSoundTags,
  sanitizeCardCss,
} from "../utils/anki/cardHtml";
import { decodeHtmlEntities } from "../utils/anki/template";

const BASE_CSS = `
:host { display: block; }
.card { font-family: system-ui, -apple-system, "PingFang SC", "Hiragino Sans", sans-serif; font-size: 20px; text-align: center; line-height: 1.4; overflow-wrap: anywhere; }
img { max-width: 100%; height: auto; }
.cloze { font-weight: bold; color: #2563eb; }
.ryos-sound { display: inline-flex; vertical-align: middle; width: 26px; height: 26px; margin: 2px 4px; padding: 0; border: 0; border-radius: 6px; cursor: pointer; color: inherit; opacity: .6; background: transparent center / 18px no-repeat; background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 256 256' fill='%23888'><path d='M155.5 24.8a8 8 0 0 0-8.4.9L77.3 80H32a16 16 0 0 0-16 16v64a16 16 0 0 0 16 16h45.3l69.8 54.3A8 8 0 0 0 160 224V32a8 8 0 0 0-4.5-7.2ZM192 96a8 8 0 0 1 8 8v48a8 8 0 0 1-16 0v-48a8 8 0 0 1 8-8Zm32-16a8 8 0 0 1 8 8v80a8 8 0 0 1-16 0V88a8 8 0 0 1 8-8Z'/></svg>"); }
.ryos-sound:hover, .ryos-sound[data-playing] { opacity: 1; background-color: rgba(127,127,127,.15); }
`;

// The face supplies the surface; notetype backgrounds/colors would fight it.
const OVERRIDE_CSS = `.card { background: transparent !important; color: inherit !important; }`;

export function DictionaryCardHtml({
  html,
  css,
  mediaScope,
  isDark,
  playLabel,
  playingSound,
  onPlaySound,
  className,
}: {
  html: string;
  css?: string;
  mediaScope?: string;
  isDark: boolean;
  playLabel: string;
  playingSound?: string | null;
  onPlaySound: (filename: string) => void;
  className?: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onPlayRef = useRef(onPlaySound);
  onPlayRef.current = onPlaySound;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    const fragment = DOMPurify.sanitize(replaceSoundTags(html, playLabel), {
      RETURN_DOM_FRAGMENT: true,
      ADD_TAGS: ["ruby", "rb", "rt", "rp"],
      FORBID_TAGS: ["style", "link", "meta", "form", "input", "textarea", "select"],
    });

    let cancelled = false;
    for (const img of Array.from(fragment.querySelectorAll("img"))) {
      const src = img.getAttribute("src") ?? "";
      img.removeAttribute("src");
      if (!mediaScope || !isRelativeMediaSrc(src)) continue;
      void getDictionaryMediaUrl(dictionaryMediaKey(mediaScope, decodeHtmlEntities(src).trim())).then(
        (url) => {
          if (!cancelled && url) img.setAttribute("src", url);
        }
      );
    }
    for (const el of Array.from(fragment.querySelectorAll("audio[src], video[src], source[src]"))) {
      el.removeAttribute("src");
    }

    const style = document.createElement("style");
    style.textContent = `${BASE_CSS}\n${sanitizeCardCss(css ?? "")}\n${OVERRIDE_CSS}`;
    const card = document.createElement("div");
    card.className = cn("card", isDark && "nightMode night_mode");
    card.appendChild(fragment);
    root.replaceChildren(style, card);

    const handleClick = (event: Event) => {
      const target = (event.target as Element | null)?.closest?.(".ryos-sound");
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      onPlayRef.current(target.getAttribute("data-sound") ?? "");
    };
    root.addEventListener("click", handleClick);
    return () => {
      cancelled = true;
      root.removeEventListener("click", handleClick);
    };
  }, [html, css, mediaScope, isDark, playLabel]);

  useEffect(() => {
    const root = hostRef.current?.shadowRoot;
    if (!root) return;
    for (const button of Array.from(root.querySelectorAll(".ryos-sound"))) {
      if (playingSound && button.getAttribute("data-sound") === playingSound) {
        button.setAttribute("data-playing", "");
      } else {
        button.removeAttribute("data-playing");
      }
    }
  }, [playingSound, html]);

  return <div ref={hostRef} className={cn("dictionary-card-html w-full", className)} />;
}
