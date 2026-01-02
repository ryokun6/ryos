import { v4 as uuidv4 } from "uuid";

const DEVICE_ID_KEY = "ryos:device-id";

export function getOrCreateDeviceId(): string {
  if (typeof localStorage === "undefined") {
    // Fallback for non-browser environments
    return uuidv4();
  }
  const existing = localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const newId = uuidv4();
  localStorage.setItem(DEVICE_ID_KEY, newId);
  return newId;
}
