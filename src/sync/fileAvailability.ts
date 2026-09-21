import { create } from "zustand";

export interface FileTransferState {
  status: "queued" | "downloading" | "available" | "error";
  percentage?: number;
  error?: string;
}

/** Transient presentation state; durable work lives in the account's sync state. */
export const useFileAvailability = create<{
  files: Record<string, FileTransferState>;
  set: (key: string, value: FileTransferState) => void;
  clear: () => void;
}>((set) => ({
  files: {},
  set: (key, value) => set(state => ({ files: { ...state.files, [key]: value } })),
  clear: () => set({ files: {} }),
}));
