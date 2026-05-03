import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { getAdminServerInfo } from "@/api/admin";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { abortableFetch } from "@/utils/abortableFetch";

interface VersionInfo {
  version?: string;
  buildNumber?: string;
  commitSha?: string;
}

interface ServerInfo {
  deployment: "dev" | "vercel" | "coolify";
  redis: { backend: string; healthy: boolean };
  websocket: { provider: "local" | "pusher"; configured: boolean };
}

const RYOS_GITHUB_REPO = "https://github.com/ryokun6/ryos";

function ryosGitHubCommitUrl(version: VersionInfo | null): string | null {
  if (!version) return null;
  const sha = version.commitSha?.trim();
  const short = version.buildNumber?.trim();
  const ref = sha || short;
  if (!ref || ref === "—" || ref.toLowerCase() === "dev") return null;
  return `${RYOS_GITHUB_REPO}/commit/${ref}`;
}

function InfoRow({
  label,
  value,
  badgeLabel,
  badgeVariant,
}: {
  label: string;
  value: ReactNode;
  badgeLabel?: string;
  badgeVariant?: "success" | "error" | "neutral";
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5">
      <span className="text-[11px] text-neutral-500">{label}</span>
      <div className="flex min-w-0 items-center gap-2">
        {typeof value === "string" ? (
          <span className="truncate text-[11px] font-medium text-neutral-800 tabular-nums">
            {value}
          </span>
        ) : (
          value
        )}
        {badgeLabel && badgeVariant ? (
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 text-[9px]",
              badgeVariant === "success" && "bg-green-100 text-green-700",
              badgeVariant === "error" && "bg-red-100 text-red-700",
              badgeVariant === "neutral" && "bg-neutral-100 text-neutral-600"
            )}
          >
            {badgeLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function DashboardServerCard({ reloadKey = 0 }: { reloadKey?: number }) {
  const { t } = useTranslation();
  const { username, isAuthenticated } = useAuth();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!username || !isAuthenticated) return;

    setIsLoading(true);
    setError(null);

    try {
      const [versionRes, serverRes] = await Promise.all([
        abortableFetch("/version.json", {
          cache: "no-store",
          timeout: 5000,
          throwOnHttpError: false,
          retry: { maxAttempts: 1, initialDelayMs: 100 },
        }),
        getAdminServerInfo<ServerInfo>(),
      ]);

      if (versionRes.ok) {
        const v = await versionRes.json();
        setVersionInfo({
          version: v.version,
          buildNumber: v.buildNumber,
          commitSha: v.commitSha,
        });
      } else {
        setVersionInfo(null);
      }

      setServerInfo(serverRes);
    } catch (err) {
      console.error("Failed to fetch server info:", err);
      setError(err instanceof Error ? err.message : "Failed to load");
      setServerInfo(null);
    } finally {
      setIsLoading(false);
    }
  }, [username, isAuthenticated]);

  useEffect(() => {
    void fetchData();
  }, [fetchData, reloadKey]);

  const deploymentLabel =
    serverInfo?.deployment === "vercel"
      ? t("apps.admin.server.deployment.vercel", "Vercel")
      : serverInfo?.deployment === "coolify"
        ? t("apps.admin.server.deployment.coolify", "Coolify")
        : t("apps.admin.server.deployment.dev", "Development");

  const commitLabel =
    versionInfo?.buildNumber ?? versionInfo?.commitSha ?? "—";
  const commitUrl = ryosGitHubCommitUrl(versionInfo);

  return (
    <div className="overflow-hidden rounded border border-gray-200 bg-white">
      <div className="border-b border-gray-100 bg-gray-50 px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-neutral-400">
          {t("apps.admin.server.title", "Server")}
        </span>
      </div>

      {isLoading && !serverInfo && !error ? (
        <div className="flex items-center justify-center gap-2 py-8">
          <ActivityIndicator size={18} />
          <span className="text-[11px] text-neutral-500">
            {t("apps.admin.server.loading", "Loading server info...")}
          </span>
        </div>
      ) : error && !serverInfo ? (
        <div className="flex flex-col items-center gap-2 py-6">
          <span className="text-[11px] text-red-600">{error}</span>
          <Button variant="outline" size="sm" onClick={() => void fetchData()}>
            {t("common.retry", "Retry")}
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          <InfoRow
            label={t("apps.admin.server.version", "Version")}
            value={versionInfo?.version ?? "—"}
          />
          <InfoRow
            label={t("apps.admin.server.commit", "Commit")}
            value={
              commitUrl ? (
                <a
                  href={commitUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate font-mono text-[11px] font-medium text-blue-600 underline-offset-2 hover:underline"
                  title={versionInfo?.commitSha ?? commitLabel}
                >
                  {commitLabel}
                </a>
              ) : (
                commitLabel
              )
            }
          />
          <InfoRow
            label={t("apps.admin.server.deploymentLabel", "Deployment")}
            value={deploymentLabel}
          />
          <InfoRow
            label={t("apps.admin.server.redis", "Redis")}
            value={serverInfo?.redis?.backend ?? "—"}
            badgeVariant={
              serverInfo?.redis
                ? serverInfo.redis.healthy
                  ? "success"
                  : "error"
                : undefined
            }
            badgeLabel={
              serverInfo?.redis
                ? serverInfo.redis.healthy
                  ? t("apps.admin.server.ok", "OK")
                  : t("apps.admin.server.unhealthy", "Unhealthy")
                : undefined
            }
          />
          <InfoRow
            label={t("apps.admin.server.realtime", "Realtime / WebSocket")}
            value={
              serverInfo?.websocket?.provider === "local"
                ? t("apps.admin.server.provider.local", "Local")
                : t("apps.admin.server.provider.pusher", "Pusher")
            }
            badgeVariant={
              serverInfo?.websocket?.configured ? "success" : "neutral"
            }
            badgeLabel={
              serverInfo?.websocket?.configured
                ? t("apps.admin.server.ok", "OK")
                : t("apps.admin.server.notConfigured", "Not configured")
            }
          />
        </div>
      )}
    </div>
  );
}
