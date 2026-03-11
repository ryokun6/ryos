import { useEffect, useCallback, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useAirDropStore } from "@/stores/useAirDropStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ThemedIcon } from "@/components/shared/ThemedIcon";

function getUsernameInitials(username: string): string {
  const base = username.replace(/^@+/, "").trim();
  if (!base) return "?";
  return base.slice(0, 2).toUpperCase();
}

const AVATAR_COLORS = [
  "from-blue-400 to-blue-600",
  "from-purple-400 to-purple-600",
  "from-pink-400 to-pink-600",
  "from-green-400 to-green-600",
  "from-orange-400 to-orange-600",
  "from-teal-400 to-teal-600",
  "from-indigo-400 to-indigo-600",
  "from-rose-400 to-rose-600",
];

function getColorForUsername(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

interface UserAvatarProps {
  username: string;
  size?: "sm" | "lg";
  onDrop?: (username: string, fileName: string, content: string, fileType: string) => void;
  isSelf?: boolean;
}

function UserAvatar({ username, size = "sm", onDrop, isSelf }: UserAvatarProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const color = getColorForUsername(username);
  const isLarge = size === "lg";

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      if (isSelf) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    },
    [isSelf]
  );

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      if (isSelf || !onDrop) return;

      try {
        const jsonData = e.dataTransfer.getData("application/json");
        if (jsonData) {
          const { path, name } = JSON.parse(jsonData);
          const ext = name.split(".").pop()?.toLowerCase() || "";
          let fileType = "text";
          if (["png", "jpg", "jpeg", "gif", "webp", "bmp"].includes(ext)) {
            fileType = "image";
          } else if (ext === "html") {
            fileType = "html";
          }
          window.dispatchEvent(
            new CustomEvent("airdrop-file-drop", {
              detail: { username, path, name, fileType },
            })
          );
        }
      } catch {
        // Ignore parse errors
      }
    },
    [isSelf, onDrop, username]
  );

  return (
    <div
      className="flex flex-col items-center gap-1.5 cursor-default select-none"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          "rounded-full flex items-center justify-center text-white font-bold bg-gradient-to-br shadow-lg transition-all",
          color,
          isLarge ? "w-16 h-16 text-xl" : "w-14 h-14 text-base",
          isDragOver && !isSelf && "ring-4 ring-blue-400 scale-110",
          !isSelf && "hover:scale-105"
        )}
      >
        {getUsernameInitials(username)}
      </div>
      <span
        className={cn(
          "text-center leading-tight max-w-[80px] truncate",
          isLarge ? "text-[12px] font-semibold" : "text-[11px]"
        )}
      >
        {isSelf ? "You" : `@${username}`}
      </span>
    </div>
  );
}

interface AirDropViewProps {
  onSendFile: (recipient: string, fileName: string, content: string, fileType: string) => void;
}

export function AirDropView({ onSendFile }: AirDropViewProps) {
  const { t } = useTranslation();
  const username = useChatsStore((s) => s.username);
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const nearbyUsers = useAirDropStore((s) => s.nearbyUsers);
  const isDiscovering = useAirDropStore((s) => s.isDiscovering);
  const startAirDrop = useAirDropStore((s) => s.startAirDrop);
  const stopAirDrop = useAirDropStore((s) => s.stopAirDrop);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isAuthenticated && username) {
      startAirDrop(username);
      return () => stopAirDrop();
    }
  }, [isAuthenticated, username, startAirDrop, stopAirDrop]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as {
        username: string;
        path: string;
        name: string;
        fileType: string;
      };
      onSendFile(detail.username, detail.name, detail.path, detail.fileType);
    };
    window.addEventListener("airdrop-file-drop", handler);
    return () => window.removeEventListener("airdrop-file-drop", handler);
  }, [onSendFile]);

  if (!isAuthenticated || !username) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
        <ThemedIcon name="/icons/default/cloud-sync.png" alt="AirDrop" className="w-20 h-20" />
        <div>
          <p className="text-[13px] font-semibold mb-1">
            {t("apps.finder.airdrop.title")}
          </p>
          <p className="text-[11px] text-neutral-500">
            {t("apps.finder.airdrop.loginRequired")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center h-full gap-6 px-8 select-none"
    >
      <UserAvatar username={username} size="lg" isSelf />

      {nearbyUsers.length > 0 ? (
        <div className="flex flex-wrap items-center justify-center gap-5 max-w-[360px]">
          {nearbyUsers.map((user) => (
            <UserAvatar
              key={user}
              username={user}
              onDrop={onSendFile}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-center">
          {isDiscovering ? (
            <p className="text-[11px] text-neutral-500 animate-pulse">
              {t("apps.finder.airdrop.looking")}
            </p>
          ) : (
            <p className="text-[11px] text-neutral-500">
              {t("apps.finder.airdrop.noUsers")}
            </p>
          )}
        </div>
      )}

      <p className="text-[10px] text-neutral-400 max-w-[260px] text-center">
        {t("apps.finder.airdrop.hint")}
      </p>
    </div>
  );
}
