import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { getAdminServerInfo } from "@/api/admin";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { ActivityIndicator } from "@/components/ui/activity-indicator";
import { cn } from "@/lib/utils";
import { abortableFetch } from "@/utils/abortableFetch";

interface VersionInfo {
  version?: string;
  buildNumber?: string;
  commitSha?: string;
  buildTime?: string;
}

interface ServerInfo {
  deployment: "dev" | "vercel" | "coolify";
  redis: { backend: string; healthy: boolean };
  websocket: { provider: "local" | "pusher"; configured: boolean };
}

interface ServerPanelProps {
  onRefresh?: () => void;
}

export function ServerPanel({ onRefresh }: ServerPanelProps) {
  const { t } = useTranslation();
  const { username, authToken } = useAuth();
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!username || !authToken) return;

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
        getAdminServerInfo<ServerInfo>({ username, token: authToken }),
      ]);

      if (versionRes.ok) {
        const v = await versionRes.json();
        setVersionInfo({
          version: v.version,
          buildNumber: v.buildNumber,
          commitSha: v.commitSha,
          buildTime: v.buildTime,
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
  }, [username, authToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const Row = ({
    label,
    value,
    badge,
  }: {
    label: string;
    value: React.ReactNode;
    badge?: "success" | "error" | "neutral";
  }) => (
    <div className="flex items-center justify-between py-2 px-3 border-b border-gray-100 last:border-b-0">
      <span className="text-[11px] text-neutral-500 uppercase tracking-wide">
        {label}
      </span>
      <div className="flex items-center gap-2">
        {typeof value === "string" ? (
          <span className="text-[12px] font-medium truncate max-w-[200px]">
            {value}
          </span>
        ) : (
          value
        )}
        {badge && (
          <span
            className={cn(
              "px-1.5 py-0.5 text-[9px] rounded",
              badge === "success" && "bg-green-100 text-green-700",
              badge === "error" && "bg-red-100 text-red-700",
              badge === "neutral" && "bg-neutral-100 text-neutral-600"
            )}
          >
            {badge === "success" && t("apps.admin.server.ok", "OK")}
            {badge === "error" && t("apps.admin.server.unhealthy", "Unhealthy")}
            {badge === "neutral" && t("apps.admin.server.notConfigured", "Not configured")}
          </span>
        )}
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <ActivityIndicator size={24} />
        <span className="text-[11px] text-neutral-500">
          {t("apps.admin.server.loading", "Loading server info...")}
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <span className="text-[12px] text-red-600">{error}</span>
        <Button variant="outline" size="sm" onClick={fetchData}>
          {t("common.retry", "Retry")}
        </Button>
      </div>
    );
  }

  const deploymentLabel =
    serverInfo?.deployment === "vercel"
      ? t("apps.admin.server.deployment.vercel", "Vercel")
      : serverInfo?.deployment === "coolify"
        ? t("apps.admin.server.deployment.coolify", "Coolify")
        : t("apps.admin.server.deployment.dev", "Development");

  return (
    <div className="flex flex-col h-full font-geneva-12">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-[12px] font-medium">
          {t("apps.admin.server.title", "Server")}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            fetchData();
            onRefresh?.();
          }}
          className="h-7 w-7 p-0"
          title={t("apps.admin.menu.refreshData")}
        >
          <ArrowsClockwise className="h-3.5 w-3.5" weight="bold" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="py-2">
          <div className="!text-[11px] uppercase tracking-wide text-black/50 px-3 pb-1">
            {t("apps.admin.server.buildInfo", "Build")}
          </div>
          <div className="bg-white">
            <Row
              label={t("apps.admin.server.version", "Version")}
              value={versionInfo?.version ?? "—"}
            />
            <Row
              label={t("apps.admin.server.commit", "Commit")}
              value={versionInfo?.buildNumber ?? versionInfo?.commitSha ?? "—"}
            />
            <Row
              label={t("apps.admin.server.deploymentLabel", "Deployment")}
              value={deploymentLabel}
            />
          </div>
        </div>

        <div className="py-2">
          <div className="!text-[11px] uppercase tracking-wide text-black/50 px-3 pb-1">
            {t("apps.admin.server.services", "Services")}
          </div>
          <div className="bg-white">
            <Row
              label={t("apps.admin.server.redis", "Redis")}
              value={serverInfo?.redis?.backend ?? "—"}
              badge={
                serverInfo?.redis
                  ? serverInfo.redis.healthy
                    ? "success"
                    : "error"
                  : undefined
              }
            />
            <Row
              label={t("apps.admin.server.realtime", "Realtime / WebSocket")}
              value={
                serverInfo?.websocket?.provider === "local"
                  ? t("apps.admin.server.provider.local", "Local")
                  : t("apps.admin.server.provider.pusher", "Pusher")
              }
              badge={
                serverInfo?.websocket?.configured
                  ? "success"
                  : "neutral"
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}
