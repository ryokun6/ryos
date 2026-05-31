#!/usr/bin/env python3
"""Assemble user-profile-panel module from monolith backup + upp_parts."""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MONO_PATH = Path("/tmp/UserProfilePanel.monolith.tsx")
DIR = ROOT / "src/apps/admin/components/user-profile-panel"
PARTS = ROOT / "scripts/upp_parts"
PARENT = ROOT / "src/apps/admin/components/UserProfilePanel.tsx"

TYPES = '''export const RECENT_MESSAGES_LIMIT = 50;
export const HEARTBEAT_LOOKBACK_DAYS = 7;

export const SECTION_HEADER_CLASS =
  "!text-[11px] uppercase tracking-wide text-black/50";

export interface UserProfile {
  username: string;
  lastActive: number;
  banned?: boolean;
  banReason?: string;
  bannedAt?: number;
  messageCount?: number;
  rooms?: { id: string; name: string }[];
}

export interface UserMessage {
  id: string;
  roomId: string;
  roomName?: string;
  content: string;
  timestamp: number;
}

export interface UserMemory {
  key: string;
  summary: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface DailyNoteEntry {
  timestamp: number;
  content: string;
}

export interface DailyNote {
  date: string;
  entries: DailyNoteEntry[];
  processedForMemories: boolean;
  updatedAt: number;
}

export interface HeartbeatRecord {
  id: string;
  timestamp: number;
  isoTimestamp?: string;
  localDate?: string;
  localTime?: string;
  timeZone?: string;
  shouldSend: boolean;
  topic: string;
  message: string | null;
  skipReason: string | null;
  stateSummary: string;
}

export interface UserProfilePanelProps {
  username: string;
  onBack: () => void;
  onUserDeleted: () => void;
}
'''

SKELETON = '''import { cn } from "@/lib/utils";

export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("bg-neutral-200 animate-pulse rounded", className)} />
);
'''

SECTION_HEADER = '''import React from "react";
import { CaretRight } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { SECTION_HEADER_CLASS } from "./types";

export interface SectionHeaderProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick?: () => void;
  isOpen?: boolean;
  showCaret?: boolean;
  className?: string;
}

export const SectionHeader = ({
  children,
  icon,
  onClick,
  isOpen,
  showCaret,
  className,
}: SectionHeaderProps) => {
  const Component = onClick ? "button" : "div";
  return (
    <Component
      type={onClick ? "button" : undefined}
      onClick={onClick}
      aria-expanded={onClick ? isOpen : undefined}
      className={cn(
        SECTION_HEADER_CLASS,
        onClick && "flex items-center gap-1.5 text-left",
        className
      )}
    >
      {showCaret && (
        <CaretRight
          className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")}
          weight="bold"
        />
      )}
      {icon}
      <span>{children}</span>
    </Component>
  );
};
'''

REDUCER = Path(__file__).with_name("upp_reducer_snippet.ts")
# inline reducer
REDUCER_SRC = (ROOT / "scripts/upp_reducer.ts") if (ROOT / "scripts/upp_reducer.ts").exists() else None

NOT_FOUND = '''import { Button } from "@/components/ui/button";
import { ArrowLeft, Warning } from "@phosphor-icons/react";
import type { UserProfilePanelViewModel } from "./useUserProfilePanel";

type Props = Pick<UserProfilePanelViewModel, "t" | "onBack">;

export function UserProfilePanelNotFound({ t, onBack }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <Warning className="size-8 text-neutral-400" weight="bold" />
      <span className="text-[11px] text-neutral-500">{t("apps.admin.profile.notFound")}</span>
      <Button variant="ghost" size="sm" onClick={onBack} className="text-[11px]">
        <ArrowLeft className="size-3 mr-1" weight="bold" />
        {t("apps.admin.profile.back")}
      </Button>
    </div>
  );
}
'''

HOOK_HEADER = '''import { useState, useEffect, useCallback, useReducer } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import {
  banAdminUser,
  clearAdminUserMemories,
  deleteAdminUser,
  forceAdminDailyNotes,
  getAdminUserHeartbeats,
  getAdminUserMemories,
  getAdminUserMessages,
  getAdminUserProfile,
  unbanAdminUser,
} from "@/api/admin";
import { ApiRequestError } from "@/api/core";
import {
  HEARTBEAT_LOOKBACK_DAYS,
  RECENT_MESSAGES_LIMIT,
  type DailyNote,
  type HeartbeatRecord,
  type UserMemory,
  type UserMessage,
  type UserProfile,
  type UserProfilePanelProps,
} from "./types";
import {
  initialUiState,
  profileUiReducer,
} from "./profile-ui-reducer";

export function useUserProfilePanel({
  username,
  onBack,
  onUserDeleted,
}: UserProfilePanelProps) {
'''

HOOK_FOOTER = '''
  const dispatchProfileUi = dispatchUi;

  return {
    t,
    username,
    onBack,
    profile,
    messages,
    memories,
    dailyNotes,
    heartbeats,
    isLoading,
    expandedMemories,
    expandedDailyNotes,
    expandedHeartbeats,
    banReason,
    showBanInput,
    isRoomsOpen,
    isMessagesOpen,
    isMemoriesOpen,
    isHeartbeatsOpen,
    hasLoadedMessages,
    hasLoadedMemories,
    hasLoadedHeartbeats,
    isMessagesLoading,
    isMemoriesLoading,
    isHeartbeatsLoading,
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
    isBanDialogOpen,
    setIsBanDialogOpen,
    isClearMemoryDialogOpen,
    setIsClearMemoryDialogOpen,
    isForceProcessDialogOpen,
    setIsForceProcessDialogOpen,
    isClearingMemory,
    isProcessingNotes,
    dispatchProfileUi,
    toggleMemory,
    toggleDailyNote,
    toggleHeartbeat,
    toggleMessagesSection,
    toggleMemoriesSection,
    toggleHeartbeatsSection,
    handleBan,
    handleUnban,
    handleDelete,
    handleClearMemory,
    handleForceProcessDailyNotes,
    formatRelativeTime,
    formatDate,
    isTargetAdmin,
    roomsCount,
    messagesCount,
  };
}

export type UserProfilePanelViewModel = ReturnType<typeof useUserProfilePanel>;
'''


def build_hook(mono: str) -> str:
    m = re.search(
        r"export const UserProfilePanel.*?= \(\{[^}]+\}\) => \{(.*?)if \(!isLoading && !profile\)",
        mono,
        re.S,
    )
    if not m:
        raise SystemExit("Could not extract hook body from monolith")
    inner = m.group(1)
    inner = re.sub(
        r"  type UserProfileUiState.*?  const \[uiState, dispatchUi\] = useReducer\(reducer, initialUiState\);\n",
        "  const [uiState, dispatchUi] = useReducer(profileUiReducer, initialUiState);\n",
        inner,
        flags=re.S,
    )
    inner = re.sub(
        r"  type UserProfileUiAction.*?  const \[uiState, dispatchUi\] = useReducer\(profileUiReducer, initialUiState\);\n",
        "  const [uiState, dispatchUi] = useReducer(profileUiReducer, initialUiState);\n",
        inner,
        flags=re.S,
    )
    inner = re.sub(r"  const initialUiState: UserProfileUiState = \{.*?\};\n", "", inner, flags=re.S)
    inner = re.sub(r"  const reducer = \(.*?\n  \};\n", "", inner, flags=re.S)
    inner = inner.replace(
        "useReducer(reducer, initialUiState)",
        "useReducer(profileUiReducer, initialUiState)",
    )
    return HOOK_HEADER + inner + HOOK_FOOTER


def main() -> int:
    if not MONO_PATH.exists():
        src = PARENT
        if src.read_text().count("\n") < 100:
            sys.exit("Monolith missing")
        MONO_PATH.write_text(src.read_text())
    mono = MONO_PATH.read_text()
    DIR.mkdir(parents=True, exist_ok=True)

    (DIR / "types.ts").write_text(TYPES)
    (DIR / "Skeleton.tsx").write_text(SKELETON)
    (DIR / "SectionHeader.tsx").write_text(SECTION_HEADER)
    reducer_path = ROOT / "scripts/upp_reducer.ts"
    if not reducer_path.exists():
        sys.exit("Missing scripts/upp_reducer.ts")
    (DIR / "profile-ui-reducer.ts").write_text(reducer_path.read_text())
    (DIR / "UserProfilePanelNotFound.tsx").write_text(NOT_FOUND)
    (DIR / "useUserProfilePanel.ts").write_text(build_hook(mono))

    for name in PARTS.iterdir():
        if name.suffix in (".tsx", ".ts"):
            shutil.copy2(name, DIR / name.name)

  # Fix memories return fragment if needed
    mem = DIR / "UserProfilePanelMemoriesSection.tsx"
    if mem.exists():
        t = mem.read_text()
        if "return (\n    <>" not in t and "return (\n      {/* Long-Term" in t:
            t = t.replace(
                "  return (\n      {/* Long-Term Memories */}",
                "  return (\n    <>\n      {/* Long-Term Memories */}",
            )
            t = t.replace(
                "        </div>\n      )}\n\n  );\n}",
                "        </div>\n      )}\n    </>\n  );\n}",
            )
            mem.write_text(t)

    PARENT.write_text('export { UserProfilePanel } from "./user-profile-panel/UserProfilePanel";\n')

    count = len([p for p in DIR.iterdir() if p.is_file()])
    print(f"ASSEMBLED_COUNT={count}")
    if count != 16:
        print([p.name for p in DIR.iterdir()], file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
