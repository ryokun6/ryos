export interface StorageUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

interface BaseStorageUploadInstruction {
  provider: "vercel-blob" | "s3";
  uploadMethod: string;
  pathname: string;
  contentType: string;
  maximumSizeInBytes: number;
}

export interface VercelBlobUploadInstruction
  extends BaseStorageUploadInstruction {
  provider: "vercel-blob";
  uploadMethod: "vercel-client-token";
  clientToken: string;
}

export interface S3UploadInstruction extends BaseStorageUploadInstruction {
  provider: "s3";
  uploadMethod: "presigned-put";
  uploadUrl: string;
  storageUrl: string;
  headers?: Record<string, string>;
}

export type StorageUploadInstruction =
  | VercelBlobUploadInstruction
  | S3UploadInstruction;

function uploadWithXhr(
  uploadUrl: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (progress: StorageUploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);

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
          `Upload failed before an HTTP response was received for ${uploadUrl}. Check bucket CORS, endpoint reachability, and TLS/mixed-content configuration.`
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
  if (instruction.uploadMethod === "vercel-client-token") {
    const { put } = await import("@vercel/blob/client");
    const result = await put(instruction.pathname, blob, {
      access: "public",
      token: instruction.clientToken,
      contentType: instruction.contentType,
      multipart: blob.size > 4 * 1024 * 1024,
      ...(onProgress ? { onUploadProgress: onProgress } : {}),
    });

    return { storageUrl: result.url };
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
