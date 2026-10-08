import type { ReactNode } from "react";
import { Barbell, CalendarCheck, ForkKnife, MagnifyingGlass, Person, SidebarSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { osToolbarSurfaceClassName } from "@/components/shared/osThemePrimitives";
import { cn } from "@/lib/utils";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import { FITNESS_VIEWS, type FitnessView } from "../types";

function ToolbarButton({
  l,
  active,
  onClick,
  label,
  showLabel,
  children,
}: {
  l: FitnessLogic;
  active?: boolean;
  onClick: () => void;
  label: string;
  showLabel?: boolean;
  children: ReactNode;
}) {
  if (l.isMacOSTheme) {
    return (
      <button
        type="button"
        className={cn("metal-inset-btn", showLabel ? "gap-1 px-2 text-[11px]" : "metal-inset-icon")}
        data-state={active ? "on" : "off"}
        onClick={onClick}
        title={label}
        aria-label={label}
        aria-pressed={active}
      >
        {children}
        {showLabel ? <span>{label}</span> : null}
      </button>
    );
  }
  return (
    <Button
      type="button"
      variant={l.isSystem7Theme ? "player" : "ghost"}
      data-state={active ? "on" : "off"}
      onClick={onClick}
      className={cn(
        "h-6 gap-1 px-1.5 text-[11px]",
        !showLabel && "w-6 px-0",
        l.isWindowsTheme && "text-black",
        active && !l.isSystem7Theme && "bg-black/10"
      )}
      title={label}
      aria-label={label}
      aria-pressed={active}
    >
      {children}
      {showLabel ? <span>{label}</span> : null}
    </Button>
  );
}

const VIEW_ICONS: Record<FitnessView, ReactNode> = {
  schedule: <CalendarCheck size={14} />,
  exercises: <MagnifyingGlass size={14} />,
  workouts: <Barbell size={14} />,
  body: <Person size={14} />,
  food: <ForkKnife size={14} />,
};

export function FitnessToolbar({
  l,
  isMobileLayout,
  sheetOpen = false,
  onToggleSheet,
}: {
  l: FitnessLogic;
  isMobileLayout: boolean;
  sheetOpen?: boolean;
  onToggleSheet?: () => void;
}) {
  const { t, isMacOSTheme, isSystem7Theme, isWindowsTheme } = l;
  const group = isMacOSTheme ? "metal-inset-btn-group" : "flex items-center gap-0.5";
  return (
    <div
      className={cn(
        "flex h-[38px] shrink-0 items-center gap-2 py-1.5",
        isMacOSTheme ? "px-1" : "px-2",
        osToolbarSurfaceClassName({ isMacOSTheme, isSystem7Theme, isWindowsTheme })
      )}
    >
      <div className={group} role="toolbar" aria-label={t("common.menu.view")}>
        {FITNESS_VIEWS.map((view) => (
          <ToolbarButton
            key={view}
            l={l}
            active={l.view === view}
            onClick={() => l.setView(view)}
            label={t(`apps.fitness.views.${view}`)}
            showLabel={!isMobileLayout}
          >
            {VIEW_ICONS[view]}
          </ToolbarButton>
        ))}
      </div>
      <div className="flex-1" />
      {onToggleSheet ? (
        <div className={group}>
          <ToolbarButton
            l={l}
            active={sheetOpen}
            onClick={onToggleSheet}
            label={t("apps.fitness.sidebar")}
          >
            <SidebarSimple size={14} mirrored />
          </ToolbarButton>
        </div>
      ) : null}
    </div>
  );
}
