import { useEffect, useCallback, useRef, useState } from "react";
import type { DragEvent } from "react";
import { useAirDropStore } from "@/stores/useAirDropStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useContactsStore } from "@/stores/useContactsStore";
import { getContactInitials } from "@/utils/contacts";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ThemedIcon } from "@/components/shared/ThemedIcon";

function getUsernameInitials(username: string): string {
  const base = username.replace(/^@+/, "").trim();
  if (!base) return "?";
  return base.slice(0, 2).toUpperCase();
}

const avatarInitialsTextShadow =
  "0 2px 3px rgba(0, 0, 0, 0.45), 0 0 3px rgba(0, 0, 0, 0.15)";

interface UserAvatarProps {
  username: string;
  picture?: string | null;
  initials: string;
  label: string;
  size?: "sm" | "lg";
  onDrop?: (username: string, fileName: string, content: string, fileType: string) => void;
}

function UserAvatar({ username, picture, initials, label, size = "sm", onDrop }: UserAvatarProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const isLarge = size === "lg";
  const avatarSize = isLarge ? "w-16 h-16" : "w-14 h-14";

  const handleDragOver = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    },
    []
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
      if (!onDrop) return;

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
    [onDrop, username]
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
          "rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)] flex items-center justify-center font-semibold text-white overflow-hidden transition-all",
          avatarSize,
          isLarge ? "text-xl" : "text-[13px]",
          isDragOver && "ring-4 ring-blue-400 scale-110",
          "hover:scale-105"
        )}
        style={
          picture
            ? { background: "rgba(255, 255, 255, 0.72)" }
            : {
                background: "linear-gradient(to bottom, #dcdcdc, #b8b8b8)",
                textShadow: avatarInitialsTextShadow,
              }
        }
        aria-label={label}
      >
        {picture ? (
          <img
            src={picture}
            alt={label}
            className="w-full h-full object-contain"
          />
        ) : (
          initials
        )}
      </div>
      <span
        className={cn(
          "text-center leading-tight max-w-[80px] truncate",
          isLarge ? "text-[12px] font-semibold" : "text-[11px]"
        )}
      >
        {label}
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

  const myContact = useContactsStore((s) =>
    s.myContactId
      ? s.contacts.find((c) => c.id === s.myContactId) ?? null
      : null
  );

  const selfLabel = myContact?.displayName || username || "";
  const selfInitials = myContact
    ? getContactInitials(myContact)
    : getUsernameInitials(username || "");
  const selfPicture = myContact?.picture ?? null;

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

  const otherUsers = nearbyUsers.filter((u) => u !== username);

  return (
    <div
      ref={containerRef}
      className="flex flex-col items-center justify-center h-full gap-6 px-8 select-none"
    >
      <UserAvatar
        username={username}
        picture={selfPicture}
        initials={selfInitials}
        label={selfLabel}
        size="lg"
        onDrop={onSendFile}
      />

      {otherUsers.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-5 max-w-[360px]">
          {otherUsers.map((user) => (
            <UserAvatar
              key={user}
              username={user}
              initials={getUsernameInitials(user)}
              label={`@${user}`}
              onDrop={onSendFile}
            />
          ))}
        </div>
      )}

      {otherUsers.length === 0 && (
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
