import { getApiUrl } from "@/utils/platform";

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

export interface S3ProxyUploadInstruction extends BaseStorageUploadInstruction {
  provider: "s3";
  uploadMethod: "proxy-put";
  /** Same-origin API path (resolved via getApiUrl) the bytes are PUT to. */
  uploadUrl: string;
  storageUrl: string;
  headers?: Record<string, string>;
}

export type StorageUploadInstruction =
  | VercelBlobUploadInstruction
  | S3UploadInstruction
  | S3ProxyUploadInstruction;

function uploadWithXhr(
  uploadUrl: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: (progress: StorageUploadProgress) => void,
  options?: { withCredentials?: boolean }
): Promise<string | undefined> {
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
        resolve(xhr.responseText || undefined);
        return;
      }

      // Surface a server-provided JSON error message when available.
      let serverMessage: string | undefined;
      try {
        serverMessage = (JSON.parse(xhr.responseText) as { error?: string })
          .error;
      } catch {
        serverMessage = undefined;
      }
      reject(
        new Error(serverMessage || `Upload failed with status ${xhr.status}`)
      );
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

  if (instruction.uploadMethod === "proxy-put") {
    // Same-origin upload through our API. Resolve relative API paths and send
    // credentials so the auth cookie rides along.
    const proxyUrl = instruction.uploadUrl.startsWith("http")
      ? instruction.uploadUrl
      : getApiUrl(instruction.uploadUrl);
    const responseText = await uploadWithXhr(
      proxyUrl,
      blob,
      instruction.headers || {
        "Content-Type": instruction.contentType,
      },
      onProgress,
      { withCredentials: true }
    );

    let resolvedStorageUrl = instruction.storageUrl;
    if (responseText) {
      try {
        const parsed = JSON.parse(responseText) as { storageUrl?: string };
        if (parsed.storageUrl) {
          resolvedStorageUrl = parsed.storageUrl;
        }
      } catch {
        // Keep the descriptor's storageUrl when the body isn't JSON.
      }
    }

    return { storageUrl: resolvedStorageUrl };
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
