/**
 * Load Apple signing + notarization env for electron-builder from .env.local.
 *
 * .env.local (ryOS convention):
 *   APPLE_CERTIFICATE            -> CSC_LINK (base64 .p12)
 *   APPLE_CERTIFICATE_PASSWORD   -> CSC_KEY_PASSWORD
 *   APPLE_SIGNING_IDENTITY       -> CSC_NAME
 *   APPLE_API_KEY                -> Key ID when APPLE_API_KEY_PATH is set
 *   APPLE_API_KEY_PATH           -> path to .p8 (electron-builder APPLE_API_KEY)
 *   APPLE_API_ISSUER             -> issuer UUID
 *   EVS_ACCOUNT_NAME, EVS_PASSWD  -> Castlabs EVS (production Widevine VMP signing)
 *
 * electron-builder also accepts APPLE_API_KEY_ID directly.
 */

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  const env: Record<string, string> = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      continue;
    }

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

function resolvePath(root: string, filePath: string): string {
  return path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
}

function fileExists(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function identityExistsInKeychain(identity: string): boolean {
  try {
    const output = execSync("security find-identity -v -p codesigning", {
      encoding: "utf8",
    });
    return output.includes(identity);
  } catch {
    return false;
  }
}

export function buildElectronAppleEnv(root: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const local = loadEnvFile(path.join(root, ".env.local"));

  for (const [key, value] of Object.entries(local)) {
    env[key] = value;
  }

  if (env.APPLE_CERTIFICATE) {
    env.CSC_LINK = env.CSC_LINK ?? env.APPLE_CERTIFICATE;
  }
  if (env.APPLE_CERTIFICATE_PASSWORD) {
    env.CSC_KEY_PASSWORD = env.CSC_KEY_PASSWORD ?? env.APPLE_CERTIFICATE_PASSWORD;
  }
  if (env.APPLE_SIGNING_IDENTITY) {
    env.CSC_NAME = env.CSC_NAME ?? env.APPLE_SIGNING_IDENTITY;
  }

  const preferKeychain =
    process.platform === "darwin" &&
    env.APPLE_USE_P12 !== "1" &&
    env.APPLE_SIGNING_IDENTITY &&
    identityExistsInKeychain(env.APPLE_SIGNING_IDENTITY);

  if (preferKeychain) {
    delete env.CSC_LINK;
    delete env.CSC_KEY_PASSWORD;
    delete env.CSC_NAME;
    console.log(
      "[electron] Using Developer ID certificate from the login keychain (set APPLE_USE_P12=1 to force .p12 import)."
    );
  } else if (
    typeof env.CSC_NAME === "string" &&
    env.CSC_NAME.startsWith("Developer ID Application:")
  ) {
    env.CSC_NAME = env.CSC_NAME.replace(/^Developer ID Application:\s*/, "");
  }

  const apiKeyIdFromLocal =
    env.APPLE_API_KEY_ID ??
    (env.APPLE_API_KEY_PATH && env.APPLE_API_KEY ? env.APPLE_API_KEY : undefined);

  if (env.APPLE_API_KEY_PATH) {
    const apiKeyPath = resolvePath(root, env.APPLE_API_KEY_PATH);
    if (!fileExists(apiKeyPath)) {
      throw new Error(
        `APPLE_API_KEY_PATH not found: ${apiKeyPath}. Place the App Store Connect .p8 key at build/apple.p8 or update .env.local.`
      );
    }
    env.APPLE_API_KEY = apiKeyPath;
    if (apiKeyIdFromLocal) {
      env.APPLE_API_KEY_ID = apiKeyIdFromLocal;
    }
  } else if (
    env.APPLE_API_KEY &&
    (env.APPLE_API_KEY.endsWith(".p8") || fileExists(env.APPLE_API_KEY))
  ) {
    env.APPLE_API_KEY = resolvePath(root, env.APPLE_API_KEY);
  } else if (env.APPLE_API_KEY && !env.APPLE_API_KEY_ID) {
    env.APPLE_API_KEY_ID = env.APPLE_API_KEY;
  }

  if (!env.APPLE_TEAM_ID && env.APPLE_SIGNING_IDENTITY) {
    const match = env.APPLE_SIGNING_IDENTITY.match(/\(([A-Z0-9]{10})\)\s*$/);
    if (match) {
      env.APPLE_TEAM_ID = match[1];
    }
  }

  const hasSigningCredentials = Boolean(
    preferKeychain || (env.CSC_LINK && env.CSC_KEY_PASSWORD)
  );
  const hasNotarizationCredentials = Boolean(
    env.APPLE_API_KEY &&
      env.APPLE_API_KEY_ID &&
      env.APPLE_API_ISSUER &&
      fileExists(String(env.APPLE_API_KEY))
  );

  if (hasSigningCredentials) {
    env.CSC_IDENTITY_AUTO_DISCOVERY = "true";
  }

  if (!hasSigningCredentials) {
    console.warn(
      "[electron] Missing APPLE_CERTIFICATE / APPLE_CERTIFICATE_PASSWORD — building unsigned mac app."
    );
  } else if (!hasNotarizationCredentials) {
    console.warn(
      "[electron] Missing App Store Connect API key (APPLE_API_KEY_PATH, APPLE_API_KEY ID, APPLE_API_ISSUER) — mac build will be signed but not notarized."
    );
  } else {
    console.log(
      "[electron] Apple signing + notarization credentials loaded from .env.local."
    );
  }

  return env;
}
