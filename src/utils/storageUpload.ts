import { getApiUrl } from "@/utils/platform";

export interface StorageUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface BaseStorageUploadInstruction {
  provider: "s3";
  uploadMethod: string;
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
}

export interface S3UploadInstruction extends BaseStorageUploadInstruction {
  uploadMethod: "presigned-put" | "api-proxy-put";
  uploadUrl: string;
  storageUrl: string;
  headers?: Record<string, string>;
}

export type StorageUploadInstruction = S3UploadInstruction;

export interface StorageUploadRequestOptions {
  onProgress?: (progress: StorageUploadProgress) => void;
  signal?: AbortSignal;
}

function hasStringHeaders(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every((header) => typeof header === "string")
  );
}

export function isStorageUploadInstruction(
  value: unknown
): value is StorageUploadInstruction {
  if (typeof value !== "object" || value === null) return false;
  if (!("provider" in value) || value.provider !== "s3") return false;
  if (
    !("uploadMethod" in value) ||
    (value.uploadMethod !== "presigned-put" &&
      value.uploadMethod !== "api-proxy-put")
  ) {
    return false;
  }
  if (!("pathname" in value) || typeof value.pathname !== "string") return false;
  if (!("contentType" in value) || typeof value.contentType !== "string") {
    return false;
  }
  if (
    !("maximumSizeInBytes" in value) ||
    typeof value.maximumSizeInBytes !== "number" ||
    !Number.isFinite(value.maximumSizeInBytes) ||
    value.maximumSizeInBytes <= 0
  ) {
    return false;
  }
  if (!("uploadUrl" in value) || typeof value.uploadUrl !== "string") return false;
  if (!("storageUrl" in value) || typeof value.storageUrl !== "string") return false;
  if ("headers" in value && value.headers !== undefined) {
    return hasStringHeaders(value.headers);
  }
  return true;
}

function uploadWithXhr(
  uploadUrl: string,
  body: Blob,
  headers: Record<string, string>,
  options: StorageUploadRequestOptions & { withCredentials?: boolean } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    if (options.withCredentials) {
      xhr.withCredentials = true;
    }

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    let settled = false;
    const cleanup = () => {
      options.signal?.removeEventListener("abort", abortUpload);
    };
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };
    const abortUpload = () => xhr.abort();

    xhr.upload.onprogress = (event) => {
      if (!options.onProgress || !event.lengthComputable) {
        return;
      }

      options.onProgress({
        loaded: event.loaded,
        total: event.total,
        percentage: event.total > 0 ? (event.loaded / event.total) * 100 : 0,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finish(resolve);
        return;
      }

      finish(() => reject(new Error(`Upload failed with status ${xhr.status}`)));
    };

    xhr.onerror = () =>
      finish(() =>
        reject(
          new Error(
            "Upload failed before an HTTP response was received. Check endpoint reachability and TLS/mixed-content configuration."
          )
        )
      );
    xhr.ontimeout = () =>
      finish(() => reject(new Error("Upload timed out")));
    xhr.onabort = () =>
      finish(() => reject(new DOMException("Aborted", "AbortError")));

    if (options.signal?.aborted) {
      finish(() => reject(new DOMException("Aborted", "AbortError")));
      return;
    }
    options.signal?.addEventListener("abort", abortUpload, { once: true });
    xhr.send(body);
  });
}

export async function uploadBlobWithStorageInstruction(
  blob: Blob,
  instruction: StorageUploadInstruction,
  options: StorageUploadRequestOptions = {}
): Promise<{ storageUrl: string }> {
  if (instruction.uploadMethod === "api-proxy-put") {
    await uploadWithXhr(
      getApiUrl(instruction.uploadUrl),
      blob,
      instruction.headers || {
        "Content-Type": instruction.contentType,
      },
      { ...options, withCredentials: true }
    );
    return { storageUrl: instruction.storageUrl };
  }

  await uploadWithXhr(
    instruction.uploadUrl,
    blob,
    instruction.headers || {
      "Content-Type": instruction.contentType,
    },
    options
  );

  return { storageUrl: instruction.storageUrl };
}
