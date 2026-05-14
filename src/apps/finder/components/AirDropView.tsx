import { useEffect, useCallback, useRef, useState, useMemo } from "react";
import type { DragEvent } from "react";
import { useAirDropStore } from "@/stores/useAirDropStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useContactsStore } from "@/stores/useContactsStore";
import { getContactInitials } from "@/utils/contacts";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { Button } from "@/components/ui/button";

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
  className?: string;
  style?: React.CSSProperties;
}

function UserAvatar({ username, picture, initials, label, size = "sm", onDrop, className, style }: UserAvatarProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const isLarge = size === "lg";
  const avatarSize = isLarge ? "size-16" : "size-12";

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
      className={cn("flex flex-col items-center gap-1 cursor-default select-none", className)}
      style={style}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-semibold text-white overflow-hidden transition-all",
          avatarSize,
          isLarge ? "text-xl" : "text-[13px]",
          picture
            ? "shadow-[inset_0_0_0_1.5px_rgba(0,0,0,0.2),0_0.5px_2px_rgba(0,0,0,0.15)]"
            : "shadow-[inset_0_0_0_1px_rgba(0,0,0,0.15)]",
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
            className="size-full object-contain"
          />
        ) : (
          initials
        )}
      </div>
      <span
        className={cn(
          "text-center leading-tight max-w-[80px] truncate",
          isLarge ? "text-[11px] font-semibold" : "text-[10px]"
        )}
      >
        {label}
      </span>
    </div>
  );
}

function positionsOnRings(count: number): Array<{ ring: number; angle: number }> {
  if (count === 0) return [];
  if (count === 1) return [{ ring: 1, angle: 270 }];
  if (count === 2) return [{ ring: 1, angle: 245 }, { ring: 1, angle: 295 }];

  const positions: Array<{ ring: number; angle: number }> = [];
  const perRing = [3, 4, 6];
  let placed = 0;
  for (let r = 0; r < 3 && placed < count; r++) {
    const slots = Math.min(perRing[r], count - placed);
    const startAngle = 200;
    const endAngle = 340;
    for (let i = 0; i < slots; i++) {
      const angle = slots === 1
        ? (startAngle + endAngle) / 2
        : startAngle + (i / (slots - 1)) * (endAngle - startAngle);
      positions.push({ ring: r + 1, angle });
      placed++;
    }
  }
  return positions;
}

interface AirDropViewProps {
  onSendFile: (recipient: string, fileName: string, content: string, fileType: string) => void;
  onRequestLogin?: () => void;
}

export function AirDropView({
  onSendFile,
  onRequestLogin,
}: AirDropViewProps) {
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

  const otherUsers = useMemo(
    () => nearbyUsers.filter((u) => u !== username),
    [nearbyUsers, username]
  );

  const userPositions = useMemo(
    () => positionsOnRings(otherUsers.length),
    [otherUsers.length]
  );

  if (!isAuthenticated || !username) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-8 text-center">
        <ThemedIcon
          name="/icons/default/cloud-sync.png"
          alt="AirDrop"
          className="size-20"
        />
        <div>
          <p className="text-[13px] font-semibold mb-1">
            {t("apps.finder.airdrop.title")}
          </p>
          <p className="text-[11px] text-neutral-500">
            {t("apps.finder.airdrop.loginRequired")}
          </p>
          <Button
            type="button"
            variant="aqua"
            size="sm"
            className="mt-3 min-w-[112px]"
            onClick={onRequestLogin}
          >
            {t("common.auth.logIn")}
          </Button>
        </div>
      </div>
    );
  }

  const ringRadii = [100, 175, 250];
  const avatarHalfH = 40;

  return (
    <div
      ref={containerRef}
      className="relative size-full select-none overflow-hidden"
    >
      {/* Concentric circles — centered horizontally, bottom-aligned to container */}
      {ringRadii.map((r, i) => (
        <div
          key={i}
          className="absolute rounded-full border pointer-events-none"
          style={{
            width: r * 2,
            height: r * 2,
            bottom: -r + 92,
            left: "50%",
            transform: "translateX(-50%)",
            borderColor: `rgba(0, 0, 0, ${0.12 - i * 0.03})`,
          }}
        />
      ))}

      {/* Self at center of rings (bottom of container) */}
      <div
        className="absolute z-20"
        style={{ bottom: 92 - avatarHalfH, left: "50%", transform: "translateX(-50%)" }}
      >
        <UserAvatar
          username={username}
          picture={selfPicture}
          initials={selfInitials}
          label={selfLabel}
          onDrop={onSendFile}
        />
      </div>

      {/* Users placed on rings (upper half only) */}
      {otherUsers.map((user, idx) => {
        const pos = userPositions[idx];
        if (!pos) return null;
        const r = ringRadii[pos.ring - 1];
        const rad = (pos.angle * Math.PI) / 180;
        const x = Math.cos(rad) * r;
        const y = Math.sin(rad) * r;
        return (
          <UserAvatar
            key={user}
            username={user}
            initials={getUsernameInitials(user)}
            label={`@${user}`}
            onDrop={onSendFile}
            className="absolute z-10"
            style={{
              bottom: 92 - y - avatarHalfH,
              left: "50%",
              transform: `translateX(calc(-50% + ${x}px))`,
            }}
          />
        );
      })}

      {/* Status text pinned to bottom of container */}
      <div className="absolute bottom-4 left-0 right-0 text-center z-0 px-2">
        {otherUsers.length === 0 && (
          isDiscovering ? (
            <p className="text-[11px] text-neutral-400 animate-pulse">
              {t("apps.finder.airdrop.looking")}
            </p>
          ) : (
            <p className="text-[11px] text-neutral-400">
              {t("apps.finder.airdrop.noUsers")}
            </p>
          )
        )}
        {otherUsers.length > 0 && (
          <p className="text-[10px] text-neutral-400">
            {t("apps.finder.airdrop.hint")}
          </p>
        )}
      </div>
    </div>
  );
}
