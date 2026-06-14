import { Extension } from "@tiptap/core";
import Suggestion, {
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import { Editor } from "@tiptap/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { createRoot } from "react-dom/client";
import { Check } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import {
  executeSlashCommand,
  getNextSlashCommandIndex,
  getSlashMenuPosition,
  getSlashCommandItems,
  type SlashCommandItem,
} from "../utils/slashCommandUtils";

const SlashMenuContent = ({
  items,
  onCommand,
  editor,
  selectedIndex,
  onSelectIndex,
}: {
  items: SlashCommandItem[];
  onCommand: (command: SlashCommandItem) => void;
  editor: Editor;
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
}) => {
  const { t } = useTranslation();

  const isActive = (item: SlashCommandItem) => {
    switch (item.key) {
      case "text":
        return editor.isActive("paragraph");
      case "heading1":
        return editor.isActive("heading", { level: 1 });
      case "heading2":
        return editor.isActive("heading", { level: 2 });
      case "heading3":
        return editor.isActive("heading", { level: 3 });
      case "bulletList":
        return editor.isActive("bulletList");
      case "numberedList":
        return editor.isActive("orderedList");
      default:
        return false;
    }
  };

  const getTranslatedTitle = (item: SlashCommandItem) => {
    return t(`apps.textedit.slashCommands.${item.key}.title`);
  };

  return (
    <div>
      {items.map((item, index) => (
        <button
          key={item.key}
          role="menuitem"
          onClick={() => onCommand(item)}
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onSelectIndex(index)}
          className={`relative flex w-full items-center h-8 px-2 text-sm ${
            index === selectedIndex ? "bg-muted" : ""
          }`}
        >
          {getTranslatedTitle(item)}
          {isActive(item) && (
            <span className="absolute right-2 flex size-3.5 items-center justify-center">
              <Check className="size-4" weight="bold" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

const suggestion: Partial<SuggestionOptions> = {
  char: "/",
  startOfLine: false,
  command: ({
    editor,
    range,
    props,
  }: {
    editor: Editor;
    range: { from: number; to: number };
    props: { command: SlashCommandItem };
  }) => {
    executeSlashCommand(editor, range, props.command);
  },
  items: ({ query }: { query: string }) => {
    return getSlashCommandItems(query);
  },
  render: () => {
    let root: ReturnType<typeof createRoot> | null = null;
    let container: HTMLElement | null = null;
    let latestProps: SuggestionProps | null = null;
    let selectedIndex = 0;

    const cleanup = () => {
      if (root) {
        root.unmount();
      }
      if (container) {
        container.remove();
      }
      root = null;
      container = null;
      latestProps = null;
      selectedIndex = 0;
    };

    const renderMenu = (props: SuggestionProps) => {
      const rect = props.clientRect?.();
      if (!rect || !root) return;
      const position = getSlashMenuPosition(rect);

      const itemCount = props.items.length;
      if (itemCount === 0) {
        selectedIndex = 0;
      } else if (selectedIndex >= itemCount) {
        selectedIndex = itemCount - 1;
      }

      root.render(
        <DropdownMenu open modal={false}>
          <DropdownMenuTrigger asChild>
            <div
              aria-hidden="true"
              style={{
                position: "fixed",
                top: position.top,
                left: position.left,
                width: 0,
                height: 0,
                pointerEvents: "none",
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="bottom"
            sideOffset={0}
            alignOffset={0}
            onCloseAutoFocus={(event) => event.preventDefault()}
            className="w-72 max-h-[330px] overflow-y-auto px-0"
          >
            <SlashMenuContent
              items={props.items as SlashCommandItem[]}
              selectedIndex={selectedIndex}
              editor={props.editor}
              onSelectIndex={(index) => {
                selectedIndex = index;
                renderMenu(props);
              }}
              onCommand={(command: SlashCommandItem) => {
                props.command({ command });
                cleanup();
              }}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      );
    };

    return {
      onStart: (props: SuggestionProps) => {
        latestProps = props;
        selectedIndex = 0;

        container = document.createElement("div");
        if (!container) return;

        document.body.appendChild(container);

        root = createRoot(container);
        if (!root) return;

        renderMenu(props);
      },

      onUpdate: (props: SuggestionProps) => {
        if (!root || !container) return;

        latestProps = props;
        selectedIndex = 0;

        renderMenu(props);
      },

      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === "Escape") {
          cleanup();
          // Ensure editor regains focus after menu dismissal
          props.event.preventDefault();
          return true;
        }

        if (!latestProps) return false;

        if (props.event.key === "ArrowDown") {
          props.event.preventDefault();
          selectedIndex = getNextSlashCommandIndex(
            selectedIndex,
            latestProps.items.length,
            1
          );
          renderMenu(latestProps);
          return true;
        }

        if (props.event.key === "ArrowUp") {
          props.event.preventDefault();
          selectedIndex = getNextSlashCommandIndex(
            selectedIndex,
            latestProps.items.length,
            -1
          );
          renderMenu(latestProps);
          return true;
        }

        if (props.event.key === "Enter") {
          props.event.preventDefault();
          const item = latestProps.items[selectedIndex] as
            | SlashCommandItem
            | undefined;
          if (item) {
            latestProps.command({ command: item });
            cleanup();
          }
          return true;
        }

        return false;
      },

      onExit: cleanup,
    };
  },
};

export const SlashCommands = Extension.create({
  name: "slash-commands",
  addOptions() {
    return {
      suggestion,
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      }),
    ];
  },
});
