import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildRedisCliRdbCommand,
  runRedisRdbBackup,
} from "../scripts/backup-redis-rdb";

describe("redis RDB backup script", () => {
  test("builds a redis-cli --rdb command without putting the password in args", () => {
    const command = buildRedisCliRdbCommand(
      "rediss://backup:pw%21@redis.example.com:6380/2",
      "/tmp/dump.rdb"
    );

    expect(command.args).toEqual([
      "redis-cli",
      "-h",
      "redis.example.com",
      "-p",
      "6380",
      "--tls",
      "--user",
      "backup",
      "-n",
      "2",
      "--rdb",
      "/tmp/dump.rdb",
    ]);
    expect(command.env.REDISCLI_AUTH).toBe("pw!");
    expect(command.args.join(" ")).not.toContain("pw!");
  });

  test("dumps an RDB file and uploads the exact bytes to storage", async () => {
    const rdbBytes = Buffer.from("REDIS0011\nfixture-rdb");
    let dumpedRedisUrl: string | null = null;
    let uploadedBody: Buffer | null = null;

    const result = await runRedisRdbBackup({
      now: new Date("2026-06-17T03:42:00.000Z"),
      redisUrl: "redis://127.0.0.1:6379/0",
      prefix: "ops/rdb",
      dumpRedisRdb: async (redisUrl, outputPath) => {
        dumpedRedisUrl = redisUrl;
        writeFileSync(outputPath, rdbBytes);
      },
      uploadObject: async (options) => {
        expect(options.pathname).toBe(
          "ops/rdb/2026-06-17/2026-06-17T03-42-00-000Z.rdb"
        );
        expect(options.contentType).toBe("application/octet-stream");
        uploadedBody =
          typeof options.body === "string"
            ? Buffer.from(options.body)
            : Buffer.from(options.body);
        return {
          provider: "s3",
          pathname: options.pathname,
          storageUrl: `s3://bucket/${options.pathname}`,
          size: uploadedBody.byteLength,
        };
      },
    });

    expect(dumpedRedisUrl).toBe("redis://127.0.0.1:6379/0");
    expect(uploadedBody).toEqual(rdbBytes);
    expect(result).toEqual({
      generatedAt: "2026-06-17T03:42:00.000Z",
      pathname: "ops/rdb/2026-06-17/2026-06-17T03-42-00-000Z.rdb",
      storageUrl: "s3://bucket/ops/rdb/2026-06-17/2026-06-17T03-42-00-000Z.rdb",
      provider: "s3",
      bytes: rdbBytes.byteLength,
    });
  });

  test("registers a package script for cron runners", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    expect(pkg.scripts?.["backup:redis-rdb"]).toBe(
      "bun run scripts/backup-redis-rdb.ts"
    );
  });
});
