import { memo } from "react";
import { motion } from "framer-motion";
import EmojiAquarium from "@/components/shared/EmojiAquarium";
import type { ChatMessageItemProps } from "../types";
import { isUrlOnly } from "../utils";
import { CHAT_BUBBLE_VARIANTS } from "../constants";
import { ChatMessageItemMeta } from "./ChatMessageItemMeta";
import { ChatMessageItemUserImages } from "./ChatMessageItemUserImages";
import { ChatMessageItemBubble } from "./ChatMessageItemBubble";
import { ChatMessageItemLinkPreviews } from "./ChatMessageItemLinkPreviews";
import { useChatMessageItem } from "./useChatMessageItem";
import { isTouchDevice } from "./utils";

export const ChatMessageItem = memo(function ChatMessageItem(
  props: ChatMessageItemProps
) {
  const vm = useChatMessageItem(props);
  const {
    message,
    isInitialMessage,
    isStaticGreeting,
    isInteractingWithPreview,
    hasAquarium,
    displayContent,
    setIsHovered,
  } = vm;

  return (
    <motion.div
      variants={CHAT_BUBBLE_VARIANTS}
      initial={isInitialMessage || isStaticGreeting ? "animate" : "initial"}
      animate="animate"
      transition={
        isStaticGreeting ? { duration: 0 } : { duration: 0.15, ease: "easeOut" }
      }
      className={`flex flex-col z-10 w-full ${
        message.role === "user" ? "items-end" : "items-start"
      }`}
      style={{
        transformOrigin:
          message.role === "user" ? "bottom right" : "bottom left",
      }}
      onMouseEnter={() =>
        !isInteractingWithPreview &&
        !isTouchDevice() &&
        setIsHovered(true)
      }
      onMouseLeave={() =>
        !isInteractingWithPreview &&
        !isTouchDevice() &&
        setIsHovered(false)
      }
      onTouchStart={(e) => {
        if (!isInteractingWithPreview && isTouchDevice()) {
          const target = e.target as HTMLElement;
          const isLinkPreview = target.closest("[data-link-preview]");
          if (!isLinkPreview) {
            e.preventDefault();
            setIsHovered(true);
          }
        }
      }}
    >
      <ChatMessageItemMeta vm={vm} />
      {hasAquarium && <EmojiAquarium />}
      <ChatMessageItemUserImages vm={vm} />
      {!isUrlOnly(displayContent) && <ChatMessageItemBubble vm={vm} />}
      <ChatMessageItemLinkPreviews vm={vm} />
    </motion.div>
  );
});
