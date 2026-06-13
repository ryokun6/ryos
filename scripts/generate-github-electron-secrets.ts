#!/usr/bin/env bun
/**
 * Generate GitHub Actions secret values for the Electron macOS build workflow.
 *
 * Writes build/github-secrets-paste.txt (gitignored) with copy-paste blocks.
 * Pass --apply to set secrets via `gh secret set` (requires gh auth).
 *
 * Usage:
 *   bun run scripts/generate-github-electron-secrets.ts
 *   bun run scripts/generate-github-electron-secrets.ts --apply
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const envPath = path.join(root, ".env.local");
const outputPath = path.join(root, "build/github-secrets-paste.txt");

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${filePath}`);
  }

  const env: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function resolvePath(filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
}

function mask(value: string, visible = 4): string {
  if (value.length <= visible * 2) return "*".repeat(value.length);
  return `${value.slice(0, visible)}…${value.slice(-visible)} (${value.length} chars)`;
}

function setGhSecret(name: string, value: string): void {
  const result = spawnSync("gh", ["secret", "set", name], {
    cwd: root,
    input: value,
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (result.status !== 0) {
    throw new Error(`gh secret set ${name} failed (exit ${result.status})`);
  }
}

const apply = process.argv.includes("--apply");
const env = parseEnvFile(envPath);

const p8Path = resolvePath(env.APPLE_API_KEY_PATH ?? "build/apple.p8");
if (!fs.existsSync(p8Path)) {
  throw new Error(`Missing API key file: ${p8Path}`);
}
const p8Contents = fs.readFileSync(p8Path, "utf8").trim();

const secrets: Record<string, string> = {
  APPLE_CERTIFICATE: env.APPLE_CERTIFICATE ?? "",
  APPLE_CERTIFICATE_PASSWORD: env.APPLE_CERTIFICATE_PASSWORD ?? "",
  APPLE_SIGNING_IDENTITY: env.APPLE_SIGNING_IDENTITY ?? "",
  APPLE_API_ISSUER: env.APPLE_API_ISSUER ?? "",
  APPLE_API_KEY: env.APPLE_API_KEY ?? "",
  APPLE_API_KEY_P8: p8Contents,
};

const missing = Object.entries(secrets)
  .filter(([, value]) => !value)
  .map(([key]) => key);
if (missing.length > 0) {
  throw new Error(`Missing values in .env.local for: ${missing.join(", ")}`);
}

const lines: string[] = [
  "# GitHub Actions secrets for Build Electron (macOS signed + notarized)",
  "#",
  "# Repo: Settings → Secrets and variables → Actions → New repository secret",
  "# Or run: bun run scripts/generate-github-electron-secrets.ts --apply",
  "#",
  "# DELETE THIS FILE after pasting — contains private keys and passwords.",
  "# Generated:",
  new Date().toISOString(),
  "",
];

for (const [name, value] of Object.entries(secrets)) {
  lines.push("=".repeat(72));
  lines.push(`SECRET NAME: ${name}`);
  lines.push("=".repeat(72));
  lines.push(value);
  lines.push("");
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, lines.join("\n"), "utf8");

console.log(`Wrote ${outputPath}`);
console.log("");
console.log("Secret summary (values redacted here):");
for (const [name, value] of Object.entries(secrets)) {
  const preview =
    name === "APPLE_API_KEY_P8"
      ? `${value.split("\n").length} line(s), ${value.length} chars`
      : mask(value);
  console.log(`  ${name}: ${preview}`);
}

if (apply) {
  console.log("");
  console.log("Setting GitHub repository secrets via gh...");
  for (const [name, value] of Object.entries(secrets)) {
    setGhSecret(name, value);
    console.log(`  ✓ ${name}`);
  }
  console.log("Done. Verify: gh secret list");
} else {
  console.log("");
  console.log("To push secrets with GitHub CLI instead of pasting:");
  console.log("  bun run scripts/generate-github-electron-secrets.ts --apply");
}
