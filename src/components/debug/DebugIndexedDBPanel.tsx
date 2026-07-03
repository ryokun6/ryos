import { useCallback, useEffect, useState } from "react";
import { CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { DB_NAME } from "@/utils/indexedDB";
import {
  formatIDBEntriesForCopy,
  formatIDBStoresForCopy,
  listIDBStores,
  readIDBStoreEntries,
  IDB_ENTRY_PAGE_SIZE,
  type IDBEntrySummary,
  type IDBStoreSummary,
} from "./indexedDBInspector";

interface DebugIndexedDBPanelProps {
  /** Incremented by the header refresh action to force a reload. */
  refreshToken: number;
  /** Reports the copyable dump of the current view (stores or entries). */
  onCopyTextChange: (text: string) => void;
}

type LoadState = "loading" | "ready" | "error";

const rowClassName =
  "flex w-full items-center gap-1.5 border-b border-black/5 py-0.5 text-left os-mac-aqua-dark:border-white/5";

function EntryRow({ entry }: { entry: IDBEntrySummary }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-black/5 os-mac-aqua-dark:border-white/5">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-1.5 py-0.5 text-left hover:bg-black/5 os-mac-aqua-dark:hover:bg-white/5"
      >
        <span className="shrink-0 opacity-40" aria-hidden>
          {expanded ? "▾" : "▸"}
        </span>
        <span className="min-w-0 flex-1 truncate text-os-text-primary">
          {entry.key}
        </span>
        <span className="shrink-0 tabular-nums text-os-text-secondary">
          {entry.summary}
        </span>
      </button>
      {expanded ? (
        <pre
          className={cn(
            "my-0.5 max-w-full overflow-x-auto border-l pl-2",
            "border-[color:var(--os-color-separator)]",
            "whitespace-pre-wrap break-words font-os-mono text-[10px] leading-[1.45] text-os-text-primary"
          )}
        >
          {entry.preview}
        </pre>
      ) : null}
    </div>
  );
}

/**
 * IndexedDB tab body. Lists the ryOS database's object stores with record
 * counts; drilling into a store shows its records with expandable value
 * previews so persisted state and cached blobs can be inspected on devices
 * where browser dev tools are unavailable.
 */
export function DebugIndexedDBPanel({
  refreshToken,
  onCopyTextChange,
}: DebugIndexedDBPanelProps) {
  const { t } = useTranslation();

  const [stores, setStores] = useState<IDBStoreSummary[]>([]);
  const [selectedStore, setSelectedStore] = useState<string | null>(null);
  const [entries, setEntries] = useState<IDBEntrySummary[]>([]);
  const [entryTotal, setEntryTotal] = useState(0);
  const [entryLimit, setEntryLimit] = useState(IDB_ENTRY_PAGE_SIZE);
  const [loadState, setLoadState] = useState<LoadState>("loading");

  useEffect(() => {
    let cancelled = false;
    setLoadState("loading");

    const load = async () => {
      try {
        if (selectedStore === null) {
          const nextStores = await listIDBStores();
          if (cancelled) return;
          setStores(nextStores);
          onCopyTextChange(formatIDBStoresForCopy(DB_NAME, nextStores));
        } else {
          const page = await readIDBStoreEntries(selectedStore, entryLimit);
          if (cancelled) return;
          setEntries(page.entries);
          setEntryTotal(page.total);
          onCopyTextChange(
            formatIDBEntriesForCopy(selectedStore, page.entries)
          );
        }
        setLoadState("ready");
      } catch (error) {
        if (cancelled) return;
        console.error("[DebugIndexedDBPanel] Failed to read IndexedDB:", error);
        setLoadState("error");
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [selectedStore, entryLimit, refreshToken, onCopyTextChange]);

  const openStore = useCallback((storeName: string) => {
    setEntries([]);
    setEntryTotal(0);
    setEntryLimit(IDB_ENTRY_PAGE_SIZE);
    setSelectedStore(storeName);
  }, []);

  const backToStores = useCallback(() => {
    setSelectedStore(null);
    setEntries([]);
  }, []);

  const loadMore = useCallback(() => {
    setEntryLimit((limit) => limit + IDB_ENTRY_PAGE_SIZE);
  }, []);

  return (
    <div className="h-full overflow-auto px-2 py-1 font-os-mono text-[10px] leading-[1.45]">
      {selectedStore !== null ? (
        <div
          className={cn(
            "sticky -top-1 z-10 -mx-2 flex items-center gap-1 border-b px-2 py-1",
            "border-[color:var(--os-color-separator)] bg-os-window-bg"
          )}
        >
          <button
            type="button"
            onClick={backToStores}
            title={t("debug.idb.backToStores")}
            aria-label={t("debug.idb.backToStores")}
            className="flex size-5 shrink-0 items-center justify-center rounded hover:bg-black/10 os-mac-aqua-dark:hover:bg-white/15"
          >
            <CaretLeft weight="bold" className="size-3" />
          </button>
          <span className="min-w-0 flex-1 truncate font-semibold text-os-text-primary">
            {selectedStore}
          </span>
          <span className="shrink-0 tabular-nums text-os-text-secondary">
            {t("debug.idb.recordCount", { count: entryTotal })}
          </span>
        </div>
      ) : null}

      {loadState === "loading" ? (
        <div className="py-4 text-center text-[11px] opacity-50">
          {t("debug.idb.loading")}
        </div>
      ) : loadState === "error" ? (
        <div className="py-4 text-center text-[11px] text-red-500">
          {t("debug.idb.error")}
        </div>
      ) : selectedStore === null ? (
        stores.length === 0 ? (
          <div className="py-4 text-center text-[11px] opacity-50">
            {t("debug.idb.emptyDatabase")}
          </div>
        ) : (
          stores.map((store) => (
            <button
              key={store.name}
              type="button"
              onClick={() => openStore(store.name)}
              className={cn(
                rowClassName,
                "hover:bg-black/5 os-mac-aqua-dark:hover:bg-white/5"
              )}
            >
              <span className="min-w-0 flex-1 truncate text-os-text-primary">
                {store.name}
              </span>
              <span className="shrink-0 tabular-nums text-os-text-secondary">
                {t("debug.idb.recordCount", { count: store.count })}
              </span>
              <CaretRight
                weight="bold"
                className="size-3 shrink-0 opacity-40"
                aria-hidden
              />
            </button>
          ))
        )
      ) : entries.length === 0 ? (
        <div className="py-4 text-center text-[11px] opacity-50">
          {t("debug.idb.emptyStore")}
        </div>
      ) : (
        <>
          {entries.map((entry) => (
            <EntryRow key={entry.key} entry={entry} />
          ))}
          {entries.length < entryTotal ? (
            <button
              type="button"
              onClick={loadMore}
              className="w-full py-1.5 text-center text-[11px] text-os-text-secondary hover:text-os-text-primary"
            >
              {t("debug.idb.loadMore", {
                count: entryTotal - entries.length,
              })}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
