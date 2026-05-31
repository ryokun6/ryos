import { LinkPreview } from "@/components/shared/LinkPreview";
import { isUrlOnly } from "../utils";
import type { ChatMessageItemViewModel } from "./useChatMessageItem";

export function ChatMessageItemLinkPreviews({
  vm,
}: {
  vm: ChatMessageItemViewModel;
}) {
  const { message, messageKey, displayContent, linkPreviewUrls } = vm;

  if (linkPreviewUrls.length === 0) return null;

  return (
    <div
      className={`flex flex-col gap-2 w-full ${
        !isUrlOnly(displayContent) ? "mt-2" : ""
      } ${message.role === "user" ? "items-end" : "items-start"}`}
    >
      {linkPreviewUrls.map((url, index) => (
        <LinkPreview
          key={`${messageKey}-link-${index}`}
          url={url}
          className="max-w-[90%]"
        />
      ))}
    </div>
  );
}
