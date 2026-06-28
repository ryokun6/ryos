#!/usr/bin/env bun
/**
 * Apply browser CORS rules to the configured S3-compatible bucket.
 *
 * Cloud Sync uploads and downloads use presigned URLs fetched directly from
 * the browser, so the bucket must allow PUT/GET/HEAD from app origins.
 *
 * Usage:
 *   bun run scripts/configure-s3-cors.ts
 *   bun run scripts/configure-s3-cors.ts --dry-run
 *
 * Bun loads `.env.local` automatically. Extra origins (comma-separated):
 *   S3_CORS_EXTRA_ORIGINS=https://staging.example.com,http://127.0.0.1:5173
 */

import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:3000",
];

function parseOrigins(value: string | undefined): string[] {
  if (!value?.trim()) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function collectOrigins(existingOrigins: Iterable<string> = []): string[] {
  const origins = new Set<string>(DEFAULT_DEV_ORIGINS);

  for (const origin of existingOrigins) {
    origins.add(origin);
  }

  for (const origin of parseOrigins(process.env.S3_CORS_EXTRA_ORIGINS)) {
    origins.add(origin);
  }

  const publicOrigin = process.env.APP_PUBLIC_ORIGIN?.trim();
  if (publicOrigin) {
    origins.add(publicOrigin);
  }

  for (const origin of parseOrigins(process.env.API_ALLOWED_ORIGINS)) {
    // S3 CORS does not support wildcard subdomain patterns.
    if (origin.includes("*")) continue;
    origins.add(origin);
  }

  return Array.from(origins).sort();
}

function getS3ClientFromEnv(): {
  client: S3Client;
  bucket: string;
} {
  const bucket = process.env.S3_BUCKET?.trim();
  const region = process.env.S3_REGION?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId =
    process.env.S3_ACCESS_KEY_ID?.trim() ||
    process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey =
    process.env.S3_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const forcePathStyle =
    process.env.S3_FORCE_PATH_STYLE === "1" ||
    process.env.S3_FORCE_PATH_STYLE?.toLowerCase() === "true";

  if (!bucket || !region || !endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing S3 config. Set S3_BUCKET, S3_REGION, S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY."
    );
  }

  return {
    bucket,
    client: new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const { client, bucket } = getS3ClientFromEnv();

  const existingOrigins: string[] = [];
  try {
    const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
    console.log("Current CORS rules:");
    console.log(JSON.stringify(current.CORSRules ?? [], null, 2));
    for (const rule of current.CORSRules ?? []) {
      for (const origin of rule.AllowedOrigins ?? []) {
        existingOrigins.push(origin);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`Current CORS rules: unavailable (${message})`);
  }

  const allowedOrigins = collectOrigins(existingOrigins);
  const corsConfiguration = {
    CORSRules: [
      {
        AllowedHeaders: ["*"],
        AllowedMethods: ["GET", "PUT", "HEAD"],
        AllowedOrigins: allowedOrigins,
        ExposeHeaders: ["ETag", "Content-Length", "Content-Type"],
        MaxAgeSeconds: 3600,
      },
    ],
  };

  console.log(`\nBucket: ${bucket}`);
  console.log("Allowed origins:");
  for (const origin of allowedOrigins) {
    console.log(`  - ${origin}`);
  }

  if (dryRun) {
    console.log("\nDry run — not applying changes.");
    console.log(JSON.stringify(corsConfiguration, null, 2));
    return;
  }

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucket,
      CORSConfiguration: corsConfiguration,
    })
  );

  console.log("\nApplied bucket CORS configuration.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
