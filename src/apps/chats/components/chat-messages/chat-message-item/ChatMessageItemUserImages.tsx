import { ImageAttachment } from "@/components/shared/ImageAttachment";
import { extractImageParts } from "../utils";
import type { ChatMessageItemViewModel } from "./useChatMessageItem";

export function ChatMessageItemUserImages({
  vm,
}: {
  vm: ChatMessageItemViewModel;
}) {
  const { message, messageKey } = vm;

  if (message.role !== "user") return null;

  const imageUrls = extractImageParts(
    message as {
      parts?: Array<{ type: string; url?: string; mediaType?: string }>;
    }
  );
  if (imageUrls.length === 0) return null;

  const imageKeyCounts = new Map<string, number>();
  let imageNumber = 0;

  return (
    <div
      className={`flex flex-col gap-2 w-full mb-1 ${
        message.role === "user" ? "items-end" : "items-start"
      }`}
    >
      {imageUrls.map((url) => {
        imageNumber += 1;
        const urlCount = (imageKeyCounts.get(url) ?? 0) + 1;
        imageKeyCounts.set(url, urlCount);
        return (
          <ImageAttachment
            key={`${messageKey}-img-${url}-${urlCount}`}
            src={url}
            alt={`Attached image ${imageNumber}`}
            showRemoveButton={false}
            className="max-w-[280px]"
          />
        );
      })}
    </div>
  );
}
