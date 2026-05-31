import {
  CaretLeft,
  CaretRight,
  SquaresFour,
  List,
  GearSix,
  CaretDown,
} from "@phosphor-icons/react";
import { SearchInput } from "@/components/ui/search-input";
import { ToolbarButton, ToolbarButtonGroup } from "@/components/ui/toolbar-button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { ViewType } from "../FinderMenuBar";
import type { TFunction } from "i18next";

export interface FinderMacToolbarProps {
  t: TFunction;
  isAirDropView: boolean;
  currentPath: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewType: ViewType;
  setViewType: (view: ViewType) => void;
  canNavigateBack: () => boolean;
  canNavigateForward: () => boolean;
  canCreateFolder: boolean;
  navigateBack: () => void;
  navigateForward: () => void;
  navigateAwayFromAirDrop: () => void;
  navigateUp: () => void;
  handleNewFolder: () => void;
  handleImportFile: () => void;
  handleNewWindow: () => void;
}

export function FinderMacToolbar({
  t,
  isAirDropView,
  currentPath,
  searchQuery,
  setSearchQuery,
  viewType,
  setViewType,
  canNavigateBack,
  canNavigateForward,
  canCreateFolder,
  navigateBack,
  navigateForward,
  navigateAwayFromAirDrop,
  navigateUp,
  handleNewFolder,
  handleImportFile,
  handleNewWindow,
}: FinderMacToolbarProps) {
  return (
    <div
      className="flex items-center justify-between py-1.5 gap-2 px-1"
      style={{ background: "transparent" }}
    >
      <div className="flex items-center gap-1.5">
        <ToolbarButtonGroup>
          <ToolbarButton
            icon
            onClick={() => {
              if (isAirDropView) {
                navigateAwayFromAirDrop();
              } else {
                navigateBack();
              }
            }}
            disabled={!isAirDropView && !canNavigateBack()}
          >
            <CaretLeft size={14} weight="fill" className="scale-x-150 scale-y-90" />
          </ToolbarButton>
          <ToolbarButton icon onClick={navigateForward} disabled={!canNavigateForward()}>
            <CaretRight size={14} weight="fill" className="scale-x-150 scale-y-90" />
          </ToolbarButton>
        </ToolbarButtonGroup>
        <ToolbarButtonGroup>
          <ToolbarButton
            icon
            data-state={viewType === "large" ? "on" : "off"}
            onClick={() => setViewType("large")}
          >
            <SquaresFour size={14} />
          </ToolbarButton>
          <ToolbarButton
            icon
            data-state={viewType === "list" ? "on" : "off"}
            onClick={() => setViewType("list")}
          >
            <List size={14} />
          </ToolbarButton>
        </ToolbarButtonGroup>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolbarButtonGroup>
              <ToolbarButton icon className="gap-0.5">
                <GearSix size={14} weight="fill" style={{ transform: "rotate(30deg)" }} />
                <CaretDown size={8} weight="bold" />
              </ToolbarButton>
            </ToolbarButtonGroup>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem
              className="text-md h-6 px-3"
              onClick={handleNewFolder}
              disabled={!canCreateFolder}
            >
              {t("apps.finder.contextMenu.newFolder")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-md h-6 px-3" onClick={handleImportFile}>
              {t("apps.finder.menu.import")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-md h-6 px-3"
              onClick={navigateUp}
              disabled={currentPath === "/"}
            >
              {t("apps.finder.menu.goUp")}
            </DropdownMenuItem>
            <DropdownMenuItem className="text-md h-6 px-3" onClick={handleNewWindow}>
              {t("apps.finder.menu.newWindow")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="flex-1" />
      <SearchInput value={searchQuery} onChange={setSearchQuery} width="150px" />
    </div>
  );
}
