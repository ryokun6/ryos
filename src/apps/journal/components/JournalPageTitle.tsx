import { useEffect, useRef, useState } from "react";

export function JournalPageTitle({
  pageId,
  defaultTitle,
  title,
  onSave,
}: {
  pageId: string;
  defaultTitle: string;
  title: string;
  onSave: (pageId: string, title: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    const node = inputRef.current;
    if (!node) return;
    node.focus();
    node.select();
  }, [editing]);

  function finish(value: string, cancel: boolean) {
    setEditing(false);
    if (cancel) return;
    const next = value.trim().replace(/\s+/g, " ");
    onSave(pageId, next === defaultTitle ? "" : next);
  }

  if (editing) {
    return (
      <span className="os-native-chrome-skip block min-w-0 max-w-xl">
        <input
          ref={inputRef}
          aria-label={defaultTitle}
          defaultValue={title}
          className="w-full bg-transparent p-0 text-xl font-medium leading-tight text-inherit outline-none"
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Escape") {
              event.preventDefault();
              finish(title, true);
              return;
            }
            if (event.key === "Enter") {
              event.preventDefault();
              finish(event.currentTarget.value, false);
            }
          }}
          onBlur={(event) => finish(event.currentTarget.value, false)}
        />
      </span>
    );
  }

  return (
    <h2
      className="cursor-text text-xl font-medium leading-tight"
      onDoubleClick={() => setEditing(true)}
    >
      {title}
    </h2>
  );
}
