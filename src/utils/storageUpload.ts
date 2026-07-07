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

function uploadWithXhr(
  uploadUrl: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (progress: StorageUploadProgress) => void,
  options?: { withCredentials?: boolean }
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    if (options?.withCredentials) {
      xhr.withCredentials = true;
    }

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    xhr.upload.onprogress = (event) => {
      if (!onProgress || !event.lengthComputable) {
        return;
      }

      onProgress({
        loaded: event.loaded,
        total: event.total,
        percentage: event.total > 0 ? (event.loaded / event.total) * 100 : 0,
      });
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }

      reject(new Error(`Upload failed with status ${xhr.status}`));
    };

    xhr.onerror = () =>
      reject(
        new Error(
          `Upload failed before an HTTP response was received for ${uploadUrl}. Check bucket CORS, endpoint reachability, and TLS/mixed-content configuration. For S3-compatible providers without working browser CORS, set STORAGE_CLIENT_UPLOAD=proxy.`
        )
      );
    xhr.ontimeout = () => reject(new Error("Upload timed out"));
    xhr.send(body);
  });
}

export async function uploadBlobWithStorageInstruction(
  blob: Blob,
  instruction: StorageUploadInstruction,
  onProgress?: (progress: StorageUploadProgress) => void
): Promise<{ storageUrl: string }> {
  if (instruction.uploadMethod === "api-proxy-put") {
    await uploadWithXhr(
      getApiUrl(instruction.uploadUrl),
      blob,
      instruction.headers || {
        "Content-Type": instruction.contentType,
      },
      onProgress,
      { withCredentials: true }
    );
    return { storageUrl: instruction.storageUrl };
  }

  await uploadWithXhr(
    instruction.uploadUrl,
    blob,
    instruction.headers || {
      "Content-Type": instruction.contentType,
    },
    onProgress
  );

  return { storageUrl: instruction.storageUrl };
}
