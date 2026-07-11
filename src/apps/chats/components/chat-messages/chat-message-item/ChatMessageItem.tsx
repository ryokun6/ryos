import { memo } from "react";
import { motion } from "motion/react";
import EmojiAquarium from "@/components/shared/EmojiAquarium";
import { isMessagesCompactedMarker } from "@/apps/chats/utils/messageCompaction";
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

  if (isMessagesCompactedMarker(message)) {
    return (
      <motion.div
        variants={CHAT_BUBBLE_VARIANTS}
        initial={isInitialMessage ? "animate" : "initial"}
        animate="animate"
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="flex w-full justify-center z-10 py-1"
        style={{
          contentVisibility: "auto",
          containIntrinsicSize: "auto 20px",
        }}
      >
        <span
          className={`${
            props.isMacOSTheme ? "text-[10px]" : "text-[16px]"
          } chat-messages-meta text-neutral-400 font-['Geneva-9'] antialiased select-text text-center`}
        >
          {vm.t("apps.chats.status.previousMessagesCompacted")}
        </span>
      </motion.div>
    );
  }

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
        // Skip layout/paint for rows far outside the viewport so long
        // threads stay cheap (especially while another message streams).
        // `auto` intrinsic sizing remembers each row's rendered height, so
        // scroll position and stick-to-bottom behavior are unaffected.
        contentVisibility: "auto",
        containIntrinsicSize: "auto 48px",
        // content-visibility implies contain:paint, which clips ink overflow
        // (the Aqua bubble drop shadows) at the row box. Grow the containment
        // box by the shadow extent and cancel it with negative margins +
        // width so layout and bubble spacing are unchanged.
        width: "calc(100% + 16px)",
        padding: "4px 8px 10px",
        margin: "-4px -8px -10px",
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
