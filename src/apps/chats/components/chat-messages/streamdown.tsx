import { createCodePlugin } from "@streamdown/code";
import type { CSSProperties } from "react";
import { Streamdown, type Components as StreamdownComponents } from "streamdown";

export const chatStreamdownComponents: StreamdownComponents = {
  a: ({ children, href, onClick }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="ryos-chat-streamdown-link"
      onClick={(event) => {
        onClick?.(event);
        event.stopPropagation();
      }}
    >
      {children}
    </a>
  ),
};

export const STREAMDOWN_DISALLOWED_ELEMENTS = ["img"] as const;
export const CHAT_STREAMDOWN_SHIKI_THEME: ["github-light", "github-dark"] = [
  "github-light",
  "github-dark",
];
const chatCodePlugin = createCodePlugin({
  themes: CHAT_STREAMDOWN_SHIKI_THEME,
});
export const CHAT_STREAMDOWN_PLUGINS = {
  code: chatCodePlugin,
};
export const CHAT_STREAMDOWN_ANIMATED = {
  animation: "fadeIn",
  duration: 180,
  easing: "ease-out",
  sep: "word",
  stagger: 8,
} as const;

export type ChatMessageStyle = CSSProperties & {
  "--ryos-chat-font-size": string;
};

export const getChatMessageStyle = (
  fontSize: number,
  isEmojiMessage = false
): ChatMessageStyle => {
  const size = isEmojiMessage ? "24px" : `${fontSize}px`;
  return {
    fontSize: size,
    "--ryos-chat-font-size": size,
  };
};

export { Streamdown };
