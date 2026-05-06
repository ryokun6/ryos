import { describe, expect, test } from "bun:test";

import { SsrfBlockedError, validatePublicUrl } from "../api/_utils/_ssrf.js";

describe("SSRF URL validation", () => {
  test("allows public IPv6 literals without DNS lookup", async () => {
    const parsed = await validatePublicUrl("https://[2606:4700:4700::1111]/status");

    expect(parsed.hostname).toBe("[2606:4700:4700::1111]");
    expect(parsed.pathname).toBe("/status");
  });

  test("blocks private IPv6 literals", async () => {
    await expect(validatePublicUrl("http://[::1]/")).rejects.toBeInstanceOf(
      SsrfBlockedError
    );
  });

  test("blocks hex-form private IPv4-mapped IPv6 literals", async () => {
    await expect(
      validatePublicUrl("http://[::ffff:c0a8:0101]/")
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });

  test("rejects credentials before outbound validation", async () => {
    await expect(
      validatePublicUrl("https://user:pass@example.com/")
    ).rejects.toBeInstanceOf(SsrfBlockedError);
  });
});
