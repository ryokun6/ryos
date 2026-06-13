import type { Editor } from "@tiptap/core";

export interface SlashCommandItem {
  key: string;
  title: string;
  description: string;
  aliases: string[];
  command: (editor: Editor) => void;
}

export interface SlashCommandRange {
  from: number;
  to: number;
}

export const slashCommands: SlashCommandItem[] = [
  {
    key: "text",
    title: "Text",
    description: "Just start typing with plain text",
    aliases: ["paragraph", "plain"],
    command: (editor) => {
      editor.chain().focus().setParagraph().run();
    },
  },
  {
    key: "heading1",
    title: "Heading 1",
    description: "Large section heading",
    aliases: ["h1", "heading"],
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
    },
  },
  {
    key: "heading2",
    title: "Heading 2",
    description: "Medium section heading",
    aliases: ["h2", "subheading"],
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
    },
  },
  {
    key: "heading3",
    title: "Heading 3",
    description: "Small section heading",
    aliases: ["h3"],
    command: (editor) => {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
    },
  },
  {
    key: "bulletList",
    title: "Bullet List",
    description: "Create a simple bullet list",
    aliases: ["bullet", "bullets", "ul", "unordered", "list"],
    command: (editor) => {
      editor.chain().focus().toggleBulletList().run();
    },
  },
  {
    key: "numberedList",
    title: "Numbered List",
    description: "Create a numbered list",
    aliases: ["number", "numbers", "ordered", "ol", "list"],
    command: (editor) => {
      editor.chain().focus().toggleOrderedList().run();
    },
  },
  {
    key: "taskList",
    title: "Task List",
    description: "Create a checklist with checkboxes",
    aliases: ["task", "todo", "checklist", "checkbox"],
    command: (editor) => {
      editor.chain().focus().toggleTaskList().run();
    },
  },
];

export const getSlashCommandItems = (query: string): SlashCommandItem[] => {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return slashCommands.slice(0, 10);
  }

  return slashCommands
    .filter((item) => {
      const searchTargets = [item.title, item.description, ...item.aliases];
      return searchTargets.some((target) =>
        target.toLowerCase().includes(normalizedQuery)
      );
    })
    .slice(0, 10);
};

export const getNextSlashCommandIndex = (
  currentIndex: number,
  itemCount: number,
  direction: 1 | -1
): number => {
  if (itemCount <= 0) return 0;
  return (currentIndex + direction + itemCount) % itemCount;
};

export const executeSlashCommand = (
  editor: Editor,
  range: SlashCommandRange,
  item: SlashCommandItem
): void => {
  editor.chain().focus().deleteRange(range).run();
  item.command(editor);
};
