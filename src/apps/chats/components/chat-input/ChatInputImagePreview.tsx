import { motion, AnimatePresence } from "motion/react";
import { X } from "@phosphor-icons/react";
import type { ChatInputViewModel } from "./useChatInput";

type Props = Pick<
  ChatInputViewModel,
  | "t"
  | "selectedImage"
  | "isInChatRoom"
  | "isMacTheme"
  | "isWindowsTheme"
  | "imageUploadProgress"
  | "handleImageClear"
>;

export function ChatInputImagePreview({
  t,
  selectedImage,
  isInChatRoom,
  isMacTheme,
  isWindowsTheme,
  imageUploadProgress,
  handleImageClear,
}: Props) {
  const isUploading =
    typeof imageUploadProgress === "number" &&
    Number.isFinite(imageUploadProgress);
  const progressPercent = isUploading
    ? Math.max(0, Math.min(100, imageUploadProgress))
    : 0;

  return (
    <AnimatePresence>
      {selectedImage && !isInChatRoom && (
        <motion.div
          key="image-preview"
          initial={{ opacity: 0, height: 0, marginBottom: 0 }}
          animate={{ opacity: 1, height: "auto", marginBottom: 8 }}
          exit={{ opacity: 0, height: 0, marginBottom: 0 }}
          transition={{ duration: 0.15 }}
          className="overflow-visible"
        >
          <div className="relative inline-block">
            <div
              className={`relative overflow-hidden ${
                isMacTheme
                  ? "chat-bubble macosx-link-preview rounded-[16px] bg-neutral-100"
                  : isWindowsTheme
                    ? "rounded-none border border-[#7f9db9] bg-white"
                    : "rounded-md border border-neutral-200 bg-white"
              }`}
            >
              <div
                className={`relative overflow-hidden ${
                  isMacTheme ? "-mx-3 -mt-[6px] -mb-[6px] rounded-[14px]" : ""
                }`}
              >
                <img
                  src={selectedImage}
                  alt={
                    t("apps.chats.ariaLabels.selectedImage") || "Selected image"
                  }
                  className="h-16 w-auto object-cover block"
                  style={{ maxWidth: "120px" }}
                />
                {isUploading ? (
                  <div
                    className="absolute inset-0 flex flex-col justify-end bg-black/35"
                    aria-label={
                      t("apps.chats.status.uploadingImage") ||
                      "Uploading image"
                    }
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(progressPercent)}
                  >
                    <div className="mx-1.5 mb-1.5 h-1.5 overflow-hidden rounded-full bg-white/25">
                      <div
                        className="h-full rounded-full bg-white transition-[width] duration-150 ease-out"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={handleImageClear}
              disabled={isUploading}
              className={`absolute -top-1.5 -right-1.5 size-5 flex items-center justify-center z-20 ${
                isMacTheme
                  ? "rounded-full overflow-hidden"
                  : "rounded-sm bg-black/40 backdrop-blur-sm hover:bg-black/60"
              } transition-colors disabled:opacity-50 disabled:pointer-events-none`}
              style={
                isMacTheme
                  ? {
                      background:
                        "linear-gradient(rgba(160, 160, 160, 0.9), rgba(255, 255, 255, 0.9))",
                      boxShadow:
                        "0 1px 2px rgba(0, 0, 0, 0.2), 0 0.5px 0.5px rgba(0, 0, 0, 0.3), inset 0 1px 1px rgba(0, 0, 0, 0.2), inset 0 1px 2px 0.5px rgba(187, 187, 187, 0.8)",
                    }
                  : undefined
              }
              aria-label={
                t("apps.chats.ariaLabels.clearImage") || "Clear image"
              }
            >
              {isMacTheme && (
                <div
                  className="pointer-events-none absolute left-1/2 -translate-x-1/2"
                  style={{
                    top: "1px",
                    height: "35%",
                    width: "50%",
                    borderRadius: "9999px",
                    background:
                      "linear-gradient(rgba(255,255,255,0.85), rgba(255,255,255,0.2))",
                    filter: "blur(0.3px)",
                    zIndex: 2,
                  }}
                />
              )}
              <X
                className={`size-2.5 relative z-[3] ${isMacTheme ? "text-neutral-500" : "text-white"}`}
                weight="bold"
              />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
