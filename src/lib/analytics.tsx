import type { ComponentType } from "react";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import { track as vercelTrack } from "@vercel/analytics";

type TrackPayload = Record<string, string | number | boolean | null | undefined>;

const analyticsProvider = (
  import.meta.env.VITE_ANALYTICS_PROVIDER ||
  "vercel"
)
  .toString()
  .toLowerCase();

export const isAnalyticsEnabled = analyticsProvider !== "none";

export function track(
  eventName: string,
  payload?: TrackPayload
): void {
  if (!isAnalyticsEnabled) {
    return;
  }
  vercelTrack(eventName, payload);
}

const NoopAnalytics: ComponentType = () => null;

export const AnalyticsProvider: ComponentType =
  isAnalyticsEnabled ? VercelAnalytics : NoopAnalytics;
