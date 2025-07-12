import { Extension } from "@tiptap/core";
import Suggestion, {
  SuggestionOptions,
  SuggestionProps,
} from "@tiptap/suggestion";
import { Editor } from "@tiptap/react";
import {
  DropdownMenu,
  DropdownMenuContent,
} from "@/components/ui/dropdown-menu";
import { createRoot } from "react-dom/client";
import { useState, useEffect } from "react";
import { Check } from "lucide-react";

interface CommandItem {
  title: string;
  description: string;
  command: (editor: Editor) => void;
}

const SlashMenuContent = ({
  items,
  onCommand,
  editor,
}: {
  items: CommandItem[];
  onCommand: (command: CommandItem) => void;
  editor: Editor;
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset selection when items change (when filtering)
  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const isActive = (item: CommandItem) => {
    switch (item.title) {
      case "Text":
        return editor.isActive("paragraph");
      case "Heading 1":
        return editor.isActive("heading", { level: 1 });
      case "Heading 2":
        return editor.isActive("heading", { level: 2 });
      case "Heading 3":
        return editor.isActive("heading", { level: 3 });
      case "Bullet List":
        return editor.isActive("bulletList");
      case "Numbered List":
        return editor.isActive("orderedList");
      default:
        return false;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle navigation keys
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((prev) => (prev + 1) % items.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((prev) => (prev - 1 + items.length) % items.length);
          break;
        case "Enter":
          e.preventDefault();
          if (items.length > 0) {
            onCommand(items[selectedIndex]);
          }
          break;
        // Let other keys pass through to the editor
        default:
          return;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [items, selectedIndex, onCommand]);

  return (
    <div>
      {items.map((item, index) => (
        <button
          key={index}
          role="menuitem"
          onClick={() => onCommand(item)}
          onMouseEnter={() => setSelectedIndex(index)}
          className={`relative flex w-full items-center h-8 px-2 text-sm ${
            index === selectedIndex ? "bg-gray-100" : ""
          }`}
        >
          {item.title}
          {isActive(item) && (
            <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
              <Check className="h-4 w-4" />
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

const commands: CommandItem[] = [
  {
    title: "Text",
    description: "Just start typing with plain text",
    command: (editor: Editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    title: "Heading 1",
    description: "Large section heading",
    command: (editor: Editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    title: "Heading 2",
    description: "Medium section heading",
    command: (editor: Editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    title: "Heading 3",
    description: "Small section heading",
    command: (editor: Editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    title: "Bullet List",
    description: "Create a simple bullet list",
    command: (editor: Editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    title: "Numbered List",
    description: "Create a numbered list",
    command: (editor: Editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    title: "Task List",
    description: "Create a checklist with checkboxes",
    command: (editor: Editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
];

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
    props: { command: CommandItem };
  }) => {
    props.command.command(editor);
    editor.commands.deleteRange(range);
  },
  items: ({ query }: { query: string }) => {
    return commands
      .filter((item) => item.title.toLowerCase().includes(query.toLowerCase()))
      .slice(0, 10);
  },
  render: () => {
    let root: ReturnType<typeof createRoot> | null = null;
    let container: HTMLElement | null = null;

    const cleanup = () => {
      if (root) {
        root.unmount();
      }
      if (container) {
        container.remove();
      }
    };

    return {
      onStart: (props: SuggestionProps) => {
        const rect = props.clientRect?.();
        if (!rect) return;

        container = document.createElement("div");
        if (!container) return;

        container.style.position = "absolute";
        container.style.zIndex = "50";
        document.body.appendChild(container);

        root = createRoot(container);
        if (!root) return;

        root.render(
          <DropdownMenu open>
            <DropdownMenuContent
              style={{
                position: "fixed",
                top: `${rect.top + rect.height}px`,
                left: `${rect.left}px`,
              }}
              className="w-72"
            >
              <SlashMenuContent
                items={props.items}
                editor={props.editor}
                onCommand={(command: CommandItem) => {
                  props.command({ command });
                  cleanup();
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },

      onUpdate: (props: SuggestionProps) => {
        const rect = props.clientRect?.();
        if (!rect || !root || !container) return;

        container.style.position = "absolute";
        container.style.zIndex = "50";

        root.render(
          <DropdownMenu open>
            <DropdownMenuContent
              style={{
                position: "fixed",
                top: `${rect.top + rect.height}px`,
                left: `${rect.left}px`,
              }}
              className="w-72"
            >
              <SlashMenuContent
                items={props.items}
                editor={props.editor}
                onCommand={(command: CommandItem) => {
                  props.command({ command });
                  cleanup();
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },

      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === "Escape") {
          cleanup();
          // Ensure editor regains focus after menu dismissal
          props.event.preventDefault();
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
