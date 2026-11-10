/**
 * Worker-thread entry for runJs. Keeps QuickJS eval off the API event loop
 * so a long/hostile script cannot freeze every other request.
 */

import {
  runJsInSandboxSync,
  type JsSandboxRunResult,
  type RunJsSandboxOptions,
} from "./js-sandbox-runtime.js";

export interface JsSandboxWorkerRequest {
  id: number;
  code: string;
  options?: RunJsSandboxOptions;
}

export interface JsSandboxWorkerResponse {
  id: number;
  result?: JsSandboxRunResult;
  error?: string;
}

declare const self: Worker;

self.onmessage = async (event: MessageEvent<JsSandboxWorkerRequest>) => {
  const { id, code, options } = event.data;
  try {
    const result = await runJsInSandboxSync(code, options);
    const response: JsSandboxWorkerResponse = { id, result };
    self.postMessage(response);
  } catch (error) {
    const response: JsSandboxWorkerResponse = {
      id,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(response);
  }
};
