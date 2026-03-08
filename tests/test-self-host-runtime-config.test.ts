import { afterEach, describe, expect, test } from "bun:test";
import {
  buildClientRuntimeConfig,
  getAppPublicOrigin,
  getDocsBaseUrl,
  getRealtimeProvider,
  getRealtimeWebSocketPath,
  isAllowedAppHost,
} from "../api/_utils/runtime-config";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
});

describe("self-host runtime config", () => {
  test("uses APP_PUBLIC_ORIGIN for docs and client config", () => {
    process.env.APP_PUBLIC_ORIGIN = "https://coolify.example.com";
    process.env.REALTIME_PROVIDER = "local";
    process.env.REALTIME_WS_PATH = "/ws";

    expect(getAppPublicOrigin()).toBe("https://coolify.example.com");
    expect(getDocsBaseUrl()).toBe("https://coolify.example.com/docs");
    expect(getRealtimeProvider()).toBe("local");
    expect(getRealtimeWebSocketPath()).toBe("/ws");

    const config = buildClientRuntimeConfig();
    expect(config.appPublicOrigin).toBe("https://coolify.example.com");
    expect(config.docsBaseUrl).toBe("https://coolify.example.com/docs");
    expect(config.websocketUrl).toBe("wss://coolify.example.com/ws");
  });

  test("derives ws protocol from fallback origin", () => {
    delete process.env.APP_PUBLIC_ORIGIN;
    process.env.REALTIME_PROVIDER = "local";
    process.env.REALTIME_WS_PATH = "socket";

    const config = buildClientRuntimeConfig("http://127.0.0.1:3000");
    expect(config.websocketPath).toBe("/socket");
    expect(config.websocketUrl).toBe("ws://127.0.0.1:3000/socket");
  });

  test("allows configured self-host app host", () => {
    process.env.APP_PUBLIC_ORIGIN = "https://ryos.example.net";

    expect(isAllowedAppHost("ryos.example.net")).toBe(true);
    expect(isAllowedAppHost("localhost:3000")).toBe(true);
    expect(isAllowedAppHost("evil.example.net")).toBe(false);
  });
});
