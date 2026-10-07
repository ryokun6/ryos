import type { SqlJsStatic } from "sql.js";

let sqlPromise: Promise<SqlJsStatic> | null = null;

/** Lazily loads sql.js + its wasm only when an Anki import/export starts. */
export function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = Promise.all([
      import("sql.js"),
      import("sql.js/dist/sql-wasm-browser.wasm?url"),
    ])
      .then(([module, wasm]) => module.default({ locateFile: () => wasm.default }))
      .catch((error) => {
        sqlPromise = null;
        throw error;
      });
  }
  return sqlPromise;
}
