import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Editor } from "@tiptap/react";

interface CommandItem {
  title: string;
  description: string;
  command: (editor: Editor) => void;
}

interface CommandProps {
  command: CommandItem;
}

interface SlashCommandsListProps {
  items: CommandItem[];
  command: (props: CommandProps) => void;
}

export const SlashCommandsList = forwardRef<
  { onKeyDown: (event: KeyboardEvent) => boolean },
  SlashCommandsListProps
>((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const selectItem = (index: number) => {
    const item = props.items[index];
    if (item) {
      props.command({ command: item });
    }
  };

  const upHandler = () => {
    setSelectedIndex(
      (prev) => (prev + props.items.length - 1) % props.items.length
    );
    return true;
  };

  const downHandler = () => {
    setSelectedIndex((prev) => (prev + 1) % props.items.length);
    return true;
  };

  const enterHandler = () => {
    selectItem(selectedIndex);
    return true;
  };

  useEffect(() => setSelectedIndex(0), [props.items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        return upHandler();
      }
      if (event.key === "ArrowDown") {
        return downHandler();
      }
      if (event.key === "Enter") {
        return enterHandler();
      }
      return false;
    },
  }));

  return (
    <div className="z-50 h-auto max-h-[330px] w-72 overflow-y-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
      {props.items.map((item, index) => (
        <button
          key={index}
          className={`flex w-full items-start gap-2 rounded-md px-2 py-1 text-left ${
            index === selectedIndex ? "bg-gray-100" : ""
          }`}
          onClick={() => selectItem(index)}
        >
          <div className="flex flex-col">
            <span className="text-sm font-medium">{item.title}</span>
            <span className="text-xs text-gray-500">{item.description}</span>
          </div>
        </button>
      ))}
    </div>
  );
});
