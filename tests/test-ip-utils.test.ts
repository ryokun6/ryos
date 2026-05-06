import { describe, expect, test } from "bun:test";

import { isPrivateOrReservedIp } from "../api/_utils/_ip.js";

describe("IP utility", () => {
  describe("isPrivateOrReservedIp", () => {
    test("flags malformed or sentinel values", () => {
      expect(isPrivateOrReservedIp("")).toBe(true);
      expect(isPrivateOrReservedIp("unknown-ip")).toBe(true);
      expect(isPrivateOrReservedIp("localhost-dev")).toBe(true);
    });

    test("flags private and reserved IPv4 ranges", () => {
      expect(isPrivateOrReservedIp("10.0.0.5")).toBe(true);
      expect(isPrivateOrReservedIp("172.16.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("192.168.1.1")).toBe(true);
      expect(isPrivateOrReservedIp("203.0.113.10")).toBe(true);
      expect(isPrivateOrReservedIp("224.0.0.1")).toBe(true);
      expect(isPrivateOrReservedIp("255.255.255.255")).toBe(true);
    });

    test("flags private and reserved IPv6 ranges structurally", () => {
      expect(isPrivateOrReservedIp("::")).toBe(true);
      expect(isPrivateOrReservedIp("::1")).toBe(true);
      expect(isPrivateOrReservedIp("[::1]")).toBe(true);
      expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
      expect(isPrivateOrReservedIp("fd00::1")).toBe(true);
      expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
      expect(isPrivateOrReservedIp("ff02::1")).toBe(true);
      expect(isPrivateOrReservedIp("2001:0db8::1")).toBe(true);
    });

    test("classifies IPv4-mapped IPv6 by the mapped IPv4 address", () => {
      expect(isPrivateOrReservedIp("::ffff:192.168.1.1")).toBe(true);
      expect(isPrivateOrReservedIp("::ffff:c0a8:0101")).toBe(true);
      expect(isPrivateOrReservedIp("[::ffff:c0a8:0101]")).toBe(true);
      expect(isPrivateOrReservedIp("::ffff:8.8.8.8")).toBe(false);
      expect(isPrivateOrReservedIp("::ffff:0808:0808")).toBe(false);
    });

    test("allows public IPs", () => {
      expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
      expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
      expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
      expect(isPrivateOrReservedIp("[2606:4700:4700::1111]")).toBe(false);
    });
  });
});
