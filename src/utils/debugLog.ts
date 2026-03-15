type DebugLogPayload = {
  hypothesisId: string;
  location: string;
  message: string;
  data: Record<string, unknown>;
  timestamp: number;
};

type BunLikeGlobal = typeof globalThis & {
  process?: {
    versions?: {
      bun?: string;
    };
  };
};

export function writeDebugLog(payload: DebugLogPayload): void {
  if (!(globalThis as BunLikeGlobal).process?.versions?.bun) {
    return;
  }

  void Function("return import('node:fs')")()
    .then(
      (fsModule: unknown) =>
        (fsModule as { appendFileSync: (path: string, data: string) => void }).appendFileSync(
          "/opt/cursor/logs/debug.log",
          `${JSON.stringify(payload)}\n`
        )
    )
    .catch(() => {});
}
