import { del, head } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";

export type BackupStorageProviderName = "vercel_blob" | "disabled";

export interface BackupUploadTokenResult {
  clientToken: string;
  storageProvider: BackupStorageProviderName;
}

export interface BackupObjectInfo {
  size: number;
}

interface CreateUploadTokenArgs {
  pathname: string;
  allowedContentTypes: string[];
  maximumSizeInBytes: number;
}

export interface BackupStorageProvider {
  name: BackupStorageProviderName;
  createUploadToken(args: CreateUploadTokenArgs): Promise<BackupUploadTokenResult>;
  headObject(url: string): Promise<BackupObjectInfo | null>;
  deleteObject(url: string): Promise<void>;
}

function normalizeProviderName(raw: string | undefined): BackupStorageProviderName {
  const value = (raw || "vercel_blob").toLowerCase();
  if (value === "disabled") {
    return "disabled";
  }
  return "vercel_blob";
}

function createDisabledProvider(): BackupStorageProvider {
  return {
    name: "disabled",
    async createUploadToken() {
      throw new Error(
        "Cloud backup uploads are disabled. Set BACKUP_STORAGE_PROVIDER=vercel_blob to enable."
      );
    },
    async headObject() {
      return null;
    },
    async deleteObject() {
      // No-op
    },
  };
}

function createVercelBlobProvider(): BackupStorageProvider {
  return {
    name: "vercel_blob",
    async createUploadToken(args) {
      const clientToken = await generateClientTokenFromReadWriteToken({
        pathname: args.pathname,
        allowedContentTypes: args.allowedContentTypes,
        maximumSizeInBytes: args.maximumSizeInBytes,
        addRandomSuffix: false,
        allowOverwrite: true,
      });
      return {
        clientToken,
        storageProvider: "vercel_blob",
      };
    },
    async headObject(url) {
      const info = await head(url).catch(() => null);
      if (!info) return null;
      return { size: info.size };
    },
    async deleteObject(url) {
      await del(url);
    },
  };
}

export function getBackupStorageProvider(
  providerHint?: string
): BackupStorageProvider {
  const providerName = normalizeProviderName(
    providerHint || process.env.BACKUP_STORAGE_PROVIDER
  );
  if (providerName === "disabled") {
    return createDisabledProvider();
  }
  return createVercelBlobProvider();
}
