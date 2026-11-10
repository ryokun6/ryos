import { describe, expect, test } from "bun:test";
import {
  getKosyncAuthKey,
  isHashedKosyncAuthKey,
  isLegacyKosyncAuthKey,
  kosyncUserKey,
  syncKosyncAuthKeyFromPlainPassword,
  verifyKosyncAuthKey,
} from "../../../api/kosync/_helpers/_auth";
import { md5Hex } from "../../../src/shared/kosync/md5";
import { FakeRedis } from "../../helpers/fake-redis";
import type { Redis } from "../../../api/_utils/redis";

function asRedis(fake: FakeRedis): Redis {
  return fake as unknown as Redis;
}

describe("kosync auth key formats", () => {
  test("detects legacy unsalted MD5 vs bcrypt verifiers", () => {
    expect(isLegacyKosyncAuthKey("a".repeat(32))).toBe(true);
    expect(isLegacyKosyncAuthKey("A1b2c3d4e5f60718293a4b5c6d7e8f90")).toBe(
      true
    );
    expect(isLegacyKosyncAuthKey("not-an-md5")).toBe(false);
    expect(isLegacyKosyncAuthKey("$2a$10$" + "x".repeat(53))).toBe(false);

    expect(isHashedKosyncAuthKey("$2a$10$" + "x".repeat(53))).toBe(true);
    expect(isHashedKosyncAuthKey("$2b$10$" + "x".repeat(53))).toBe(true);
    expect(isHashedKosyncAuthKey("a".repeat(32))).toBe(false);
  });
});

describe("kosync auth key storage", () => {
  test("stores bcrypt(md5) instead of raw MD5 on password sync", async () => {
    const redis = asRedis(new FakeRedis());
    const username = "kosyncauth1";
    const password = "Password1!kosync";
    const md5 = md5Hex(password);

    await syncKosyncAuthKeyFromPlainPassword(redis, username, password);
    const stored = await getKosyncAuthKey(redis, username);
    expect(stored).toBeTruthy();
    expect(isLegacyKosyncAuthKey(stored!)).toBe(false);
    expect(isHashedKosyncAuthKey(stored!)).toBe(true);
    expect(stored!.toLowerCase()).not.toBe(md5);

    expect(await verifyKosyncAuthKey(redis, username, md5, stored!)).toBe(
      true
    );
    expect(
      await verifyKosyncAuthKey(redis, username, "0".repeat(32), stored!)
    ).toBe(false);
  });

  test("upgrades a legacy raw MD5 key on successful verify", async () => {
    const fake = new FakeRedis();
    const redis = asRedis(fake);
    const username = "kosyncauth2";
    const password = "Password1!legacy";
    const md5 = md5Hex(password);

    // Seed the pre-migration unsalted MD5 shape directly.
    await fake.set(kosyncUserKey(username), md5);
    const before = await getKosyncAuthKey(redis, username);
    expect(before).toBe(md5);
    expect(isLegacyKosyncAuthKey(before!)).toBe(true);

    expect(await verifyKosyncAuthKey(redis, username, md5, before!)).toBe(
      true
    );

    const after = await getKosyncAuthKey(redis, username);
    expect(after).toBeTruthy();
    expect(isHashedKosyncAuthKey(after!)).toBe(true);
    expect(isLegacyKosyncAuthKey(after!)).toBe(false);
    expect(await verifyKosyncAuthKey(redis, username, md5, after!)).toBe(true);
  });

  test("rejects a wrong key against a legacy MD5 without upgrading", async () => {
    const fake = new FakeRedis();
    const redis = asRedis(fake);
    const username = "kosyncauth3";
    const md5 = md5Hex("Password1!keep");
    await fake.set(kosyncUserKey(username), md5);

    const stored = await getKosyncAuthKey(redis, username);
    expect(
      await verifyKosyncAuthKey(redis, username, "0".repeat(32), stored!)
    ).toBe(false);
    expect(await getKosyncAuthKey(redis, username)).toBe(md5);
  });
});
