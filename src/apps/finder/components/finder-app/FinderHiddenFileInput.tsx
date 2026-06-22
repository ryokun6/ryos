import type { RefObject, ChangeEvent } from "react";

export function FinderHiddenFileInput({
  fileInputRef,
  currentPath,
  onChange,
}: {
  fileInputRef: RefObject<HTMLInputElement | null>;
  currentPath: string;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <input
      type="file"
      ref={fileInputRef}
      className="hidden"
      accept={
        currentPath === "/Applets"
          ? ".app,.gz,.html,.htm"
          : currentPath === "/Books"
          ? ".epub,application/epub+zip"
          : ".app,.gz,.txt,.md,text/*"
      }
      onChange={onChange}
    />
  );
}
