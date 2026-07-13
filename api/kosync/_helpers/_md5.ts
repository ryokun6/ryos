/**
 * Server-side re-exports of shared KOReader MD5 helpers, plus field validators.
 */

export {
  md5Hex,
  partialMd5Hex,
  filenameMd5FromPath,
} from "../../../src/shared/kosync/md5.js";

/** Non-empty string without `:` (redis key field constraint from the Lua server). */
export function isValidKosyncKeyField(field: unknown): field is string {
  return typeof field === "string" && field.length > 0 && !field.includes(":");
}

export function isValidKosyncField(field: unknown): field is string {
  return typeof field === "string" && field.length > 0;
}
