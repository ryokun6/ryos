/**
 * Runtime parity checks between:
 * - Vercel dev server APIs
 * - VPS adapter APIs
 *
 * This is intentionally lightweight and focuses on status/shape parity
 * for representative endpoints.
 */

const vercelBaseUrl = process.env.VERCEL_API_BASE_URL || "http://127.0.0.1:3000";
const vpsBaseUrl = process.env.VPS_API_BASE_URL || "http://127.0.0.1:3100";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function fetchJson(
  baseUrl: string,
  path: string,
  init?: RequestInit
): Promise<{ status: number; headers: Headers; data: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, init);
  const text = await res.text();
  let data: unknown = text;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    // keep text
  }
  return { status: res.status, headers: res.headers, data };
}

async function testParseTitleParity(): Promise<void> {
  const init: RequestInit = {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: "Artist - Song" }),
  };

  const vercel = await fetchJson(vercelBaseUrl, "/api/parse-title", init);
  const vps = await fetchJson(vpsBaseUrl, "/api/parse-title", init);

  assert(vercel.status === 200, `vercel parse-title expected 200, got ${vercel.status}`);
  assert(vps.status === 200, `vps parse-title expected 200, got ${vps.status}`);

  const vercelData = vercel.data as { title?: string; artist?: string };
  const vpsData = vps.data as { title?: string; artist?: string };
  assert(
    vercelData.title === vpsData.title,
    `parse-title mismatch title: vercel=${vercelData.title} vps=${vpsData.title}`
  );
  assert(
    vercelData.artist === vpsData.artist,
    `parse-title mismatch artist: vercel=${vercelData.artist} vps=${vpsData.artist}`
  );
}

async function testSongsNotFoundParity(): Promise<void> {
  const init: RequestInit = {
    headers: { Origin: "http://localhost:5173" },
  };
  const path = "/api/songs/nonexistent123?include=metadata";
  const vercel = await fetchJson(vercelBaseUrl, path, init);
  const vps = await fetchJson(vpsBaseUrl, path, init);

  assert(vercel.status === 404, `vercel songs expected 404, got ${vercel.status}`);
  assert(vps.status === 404, `vps songs expected 404, got ${vps.status}`);

  const vercelError = (vercel.data as { error?: string })?.error;
  const vpsError = (vps.data as { error?: string })?.error;
  assert(
    vercelError === vpsError,
    `songs not-found error mismatch: vercel=${vercelError} vps=${vpsError}`
  );
}

async function testIframeCheckParity(): Promise<void> {
  const path = `/api/iframe-check?url=${encodeURIComponent("https://example.com")}`;
  const init: RequestInit = {
    headers: { Origin: "http://localhost:5173" },
  };

  const vercelRes = await fetch(`${vercelBaseUrl}${path}`, init);
  const vpsRes = await fetch(`${vpsBaseUrl}${path}`, init);

  assert(vercelRes.status === 200, `vercel iframe-check expected 200, got ${vercelRes.status}`);
  assert(vpsRes.status === 200, `vps iframe-check expected 200, got ${vpsRes.status}`);

  const vercelCsp = vercelRes.headers.get("content-security-policy");
  const vpsCsp = vpsRes.headers.get("content-security-policy");
  assert(!!vercelCsp, "vercel iframe-check missing content-security-policy");
  assert(!!vpsCsp, "vps iframe-check missing content-security-policy");
}

async function testUsersAndBulkParity(): Promise<void> {
  const usersInit: RequestInit = {
    headers: { Origin: "http://localhost:5173" },
  };
  const vercelUsers = await fetch(`${vercelBaseUrl}/api/users?search=parity`, usersInit);
  const vpsUsers = await fetch(`${vpsBaseUrl}/api/users?search=parity`, usersInit);
  assert(vercelUsers.status === 200, `vercel users search expected 200, got ${vercelUsers.status}`);
  assert(vpsUsers.status === 200, `vps users search expected 200, got ${vpsUsers.status}`);

  const vercelBulkInvalid = await fetch(
    `${vercelBaseUrl}/api/messages/bulk?roomIds=bad room id`,
    usersInit
  );
  const vpsBulkInvalid = await fetch(
    `${vpsBaseUrl}/api/messages/bulk?roomIds=bad room id`,
    usersInit
  );
  assert(
    vercelBulkInvalid.status === 400,
    `vercel bulk invalid roomId expected 400, got ${vercelBulkInvalid.status}`
  );
  assert(
    vpsBulkInvalid.status === 400,
    `vps bulk invalid roomId expected 400, got ${vpsBulkInvalid.status}`
  );
}

interface AuthFlowResult {
  registerStatus: number;
  loginStatus: number;
  verifyStatus: number;
  logoutStatus: number;
  verifyAfterLogoutStatus: number;
}

interface AuthExtendedFlowResult {
  registerStatus: number;
  refreshStatus: number;
  verifyRefreshedTokenStatus: number;
  syncStatusStatus: number;
  syncStatusHasBackup: boolean | null;
  backupTokenUnauthorizedStatus: number;
  syncBackupGetStatus: number;
  syncBackupUnauthorizedStatus: number;
  passwordCheckStatus: number;
  tokensStatus: number;
  passwordSetStatus: number;
  loginWithUpdatedPasswordStatus: number;
  logoutAllStatus: number;
  verifyAfterLogoutAllStatus: number;
}

async function runAuthFlow(baseUrl: string, marker: string): Promise<AuthFlowResult> {
  const username = `p${marker[0] || "x"}${Date.now().toString(36)}${Math.floor(
    Math.random() * 100000
  ).toString(36)}`;
  const password = "parity-password-123";
  let token: string | undefined;
  let registerStatus = 0;
  let registerPayload: unknown = null;
  let registerIp = "10.0.0.1";

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const syntheticIp = `10.${attempt}.${Math.floor(Math.random() * 200)}.${Math.floor(
      Math.random() * 200
    )}`;
    registerIp = syntheticIp;
    const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:5173",
        "Content-Type": "application/json",
        "X-Forwarded-For": syntheticIp,
      },
      body: JSON.stringify({ username, password }),
    });
    registerStatus = registerRes.status;
    registerPayload = (await registerRes.json()) as unknown;
    token = (registerPayload as { token?: string })?.token;
    if (token) {
      break;
    }
    if (registerRes.status !== 429) {
      break;
    }
  }

  assert(
    !!token,
    `${marker} register response missing token (status=${registerStatus}, body=${JSON.stringify(
      registerPayload
    )})`
  );

  const verifyRes = await fetch(`${baseUrl}/api/auth/token/verify`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${token}`,
      "X-Username": username,
    },
  });

  const logoutRes = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${token}`,
      "X-Username": username,
    },
  });

  const verifyAfterLogoutRes = await fetch(`${baseUrl}/api/auth/token/verify`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${token}`,
      "X-Username": username,
    },
  });

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "X-Forwarded-For": registerIp,
    },
    body: JSON.stringify({ username, password }),
  });

  return {
    registerStatus,
    loginStatus: loginRes.status,
    verifyStatus: verifyRes.status,
    logoutStatus: logoutRes.status,
    verifyAfterLogoutStatus: verifyAfterLogoutRes.status,
  };
}

async function testAuthFlowParity(): Promise<void> {
  const vercel = await runAuthFlow(vercelBaseUrl, "vercel");
  const vps = await runAuthFlow(vpsBaseUrl, "vps");

  assert(vercel.registerStatus === 201, `vercel register expected 201, got ${vercel.registerStatus}`);
  assert(vps.registerStatus === 201, `vps register expected 201, got ${vps.registerStatus}`);
  assert(vercel.loginStatus === 200, `vercel login expected 200, got ${vercel.loginStatus}`);
  assert(vps.loginStatus === 200, `vps login expected 200, got ${vps.loginStatus}`);
  assert(vercel.verifyStatus === 200, `vercel verify expected 200, got ${vercel.verifyStatus}`);
  assert(vps.verifyStatus === 200, `vps verify expected 200, got ${vps.verifyStatus}`);
  assert(vercel.logoutStatus === 200, `vercel logout expected 200, got ${vercel.logoutStatus}`);
  assert(vps.logoutStatus === 200, `vps logout expected 200, got ${vps.logoutStatus}`);
  assert(
    vercel.verifyAfterLogoutStatus === 401,
    `vercel verify-after-logout expected 401, got ${vercel.verifyAfterLogoutStatus}`
  );
  assert(
    vps.verifyAfterLogoutStatus === 401,
    `vps verify-after-logout expected 401, got ${vps.verifyAfterLogoutStatus}`
  );
}

async function runAuthExtendedFlow(
  baseUrl: string,
  marker: string
): Promise<AuthExtendedFlowResult> {
  const username = `e${marker[0] || "x"}${Date.now().toString(36)}${Math.floor(
    Math.random() * 100000
  ).toString(36)}`;
  const initialPassword = "parity-password-123";
  const updatedPassword = "parity-password-456";
  const forwardedIp = `10.42.${Math.floor(Math.random() * 200)}.${Math.floor(
    Math.random() * 200
  )}`;

  const registerRes = await fetch(`${baseUrl}/api/auth/register`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "X-Forwarded-For": forwardedIp,
    },
    body: JSON.stringify({ username, password: initialPassword }),
  });
  const registerJson = (await registerRes.json()) as { token?: string };
  const token = registerJson.token;
  assert(!!token, `${marker} extended register missing token`);

  const refreshRes = await fetch(`${baseUrl}/api/auth/token/refresh`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "X-Forwarded-For": forwardedIp,
    },
    body: JSON.stringify({ username, oldToken: token }),
  });
  const refreshJson = (await refreshRes.json()) as { token?: string };
  const refreshedToken = refreshJson.token;
  assert(!!refreshedToken, `${marker} refresh missing token`);

  const verifyRefreshedTokenRes = await fetch(`${baseUrl}/api/auth/token/verify`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });

  const syncStatusRes = await fetch(`${baseUrl}/api/sync/status`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });
  const syncStatusJson = (await syncStatusRes.json()) as { hasBackup?: boolean };

  const backupTokenUnauthorizedRes = await fetch(`${baseUrl}/api/sync/backup-token`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
    },
  });

  const syncBackupGetRes = await fetch(`${baseUrl}/api/sync/backup`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });

  const syncBackupUnauthorizedRes = await fetch(`${baseUrl}/api/sync/backup`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
    },
  });

  const passwordCheckRes = await fetch(`${baseUrl}/api/auth/password/check`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });

  const tokensRes = await fetch(`${baseUrl}/api/auth/tokens`, {
    method: "GET",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
    },
  });

  const passwordSetRes = await fetch(`${baseUrl}/api/auth/password/set`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${refreshedToken}`,
      "X-Username": username,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password: updatedPassword }),
  });

  const loginWithUpdatedPasswordRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      "Content-Type": "application/json",
      "X-Forwarded-For": forwardedIp,
    },
    body: JSON.stringify({ username, password: updatedPassword }),
  });
  const loginJson = (await loginWithUpdatedPasswordRes.json()) as { token?: string };
  const latestToken = loginJson.token;
  assert(!!latestToken, `${marker} extended login with updated password missing token`);

  const logoutAllRes = await fetch(`${baseUrl}/api/auth/logout-all`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${latestToken}`,
      "X-Username": username,
    },
  });

  const verifyAfterLogoutAllRes = await fetch(`${baseUrl}/api/auth/token/verify`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${latestToken}`,
      "X-Username": username,
    },
  });

  return {
    registerStatus: registerRes.status,
    refreshStatus: refreshRes.status,
    verifyRefreshedTokenStatus: verifyRefreshedTokenRes.status,
    syncStatusStatus: syncStatusRes.status,
    syncStatusHasBackup:
      typeof syncStatusJson.hasBackup === "boolean" ? syncStatusJson.hasBackup : null,
    backupTokenUnauthorizedStatus: backupTokenUnauthorizedRes.status,
    syncBackupGetStatus: syncBackupGetRes.status,
    syncBackupUnauthorizedStatus: syncBackupUnauthorizedRes.status,
    passwordCheckStatus: passwordCheckRes.status,
    tokensStatus: tokensRes.status,
    passwordSetStatus: passwordSetRes.status,
    loginWithUpdatedPasswordStatus: loginWithUpdatedPasswordRes.status,
    logoutAllStatus: logoutAllRes.status,
    verifyAfterLogoutAllStatus: verifyAfterLogoutAllRes.status,
  };
}

async function testAuthExtendedParity(): Promise<void> {
  const vercel = await runAuthExtendedFlow(vercelBaseUrl, "vercel");
  const vps = await runAuthExtendedFlow(vpsBaseUrl, "vps");

  assert(vercel.registerStatus === 201, `vercel extended register expected 201, got ${vercel.registerStatus}`);
  assert(vps.registerStatus === 201, `vps extended register expected 201, got ${vps.registerStatus}`);
  assert(vercel.refreshStatus === 201, `vercel token refresh expected 201, got ${vercel.refreshStatus}`);
  assert(vps.refreshStatus === 201, `vps token refresh expected 201, got ${vps.refreshStatus}`);
  assert(
    vercel.verifyRefreshedTokenStatus === 200,
    `vercel verify(refreshed token) expected 200, got ${vercel.verifyRefreshedTokenStatus}`
  );
  assert(
    vps.verifyRefreshedTokenStatus === 200,
    `vps verify(refreshed token) expected 200, got ${vps.verifyRefreshedTokenStatus}`
  );
  assert(vercel.syncStatusStatus === 200, `vercel sync/status expected 200, got ${vercel.syncStatusStatus}`);
  assert(vps.syncStatusStatus === 200, `vps sync/status expected 200, got ${vps.syncStatusStatus}`);
  assert(
    vercel.syncStatusHasBackup === false,
    `vercel sync/status hasBackup expected false, got ${String(vercel.syncStatusHasBackup)}`
  );
  assert(
    vps.syncStatusHasBackup === false,
    `vps sync/status hasBackup expected false, got ${String(vps.syncStatusHasBackup)}`
  );
  assert(
    vercel.backupTokenUnauthorizedStatus === 401,
    `vercel sync/backup-token unauthorized expected 401, got ${vercel.backupTokenUnauthorizedStatus}`
  );
  assert(
    vps.backupTokenUnauthorizedStatus === 401,
    `vps sync/backup-token unauthorized expected 401, got ${vps.backupTokenUnauthorizedStatus}`
  );
  assert(
    vercel.syncBackupGetStatus === 404,
    `vercel sync/backup GET expected 404, got ${vercel.syncBackupGetStatus}`
  );
  assert(
    vps.syncBackupGetStatus === 404,
    `vps sync/backup GET expected 404, got ${vps.syncBackupGetStatus}`
  );
  assert(
    vercel.syncBackupUnauthorizedStatus === 401,
    `vercel sync/backup unauthorized expected 401, got ${vercel.syncBackupUnauthorizedStatus}`
  );
  assert(
    vps.syncBackupUnauthorizedStatus === 401,
    `vps sync/backup unauthorized expected 401, got ${vps.syncBackupUnauthorizedStatus}`
  );
  assert(vercel.passwordCheckStatus === 200, `vercel password/check expected 200, got ${vercel.passwordCheckStatus}`);
  assert(vps.passwordCheckStatus === 200, `vps password/check expected 200, got ${vps.passwordCheckStatus}`);
  assert(vercel.tokensStatus === 200, `vercel tokens expected 200, got ${vercel.tokensStatus}`);
  assert(vps.tokensStatus === 200, `vps tokens expected 200, got ${vps.tokensStatus}`);
  assert(vercel.passwordSetStatus === 200, `vercel password/set expected 200, got ${vercel.passwordSetStatus}`);
  assert(vps.passwordSetStatus === 200, `vps password/set expected 200, got ${vps.passwordSetStatus}`);
  assert(
    vercel.loginWithUpdatedPasswordStatus === 200,
    `vercel login(updated password) expected 200, got ${vercel.loginWithUpdatedPasswordStatus}`
  );
  assert(
    vps.loginWithUpdatedPasswordStatus === 200,
    `vps login(updated password) expected 200, got ${vps.loginWithUpdatedPasswordStatus}`
  );
  assert(vercel.logoutAllStatus === 200, `vercel logout-all expected 200, got ${vercel.logoutAllStatus}`);
  assert(vps.logoutAllStatus === 200, `vps logout-all expected 200, got ${vps.logoutAllStatus}`);
  assert(
    vercel.verifyAfterLogoutAllStatus === 401,
    `vercel verify-after-logout-all expected 401, got ${vercel.verifyAfterLogoutAllStatus}`
  );
  assert(
    vps.verifyAfterLogoutAllStatus === 401,
    `vps verify-after-logout-all expected 401, got ${vps.verifyAfterLogoutAllStatus}`
  );
}

async function main(): Promise<void> {
  await testParseTitleParity();
  await testSongsNotFoundParity();
  await testIframeCheckParity();
  await testUsersAndBulkParity();
  await testAuthFlowParity();
  await testAuthExtendedParity();
  console.log(`[runtime-parity] parity checks passed (${vercelBaseUrl} vs ${vpsBaseUrl})`);
}

main().catch((error) => {
  console.error("[runtime-parity] failed:", error);
  process.exit(1);
});
