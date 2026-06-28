import { useEffect, useRef, useState } from "react";
import { isDesktop } from "@/utils/platform";
import type { ConsoleLogEntry } from "@/utils/consoleCapture";
import {
  appendHistoryPoint,
  calculateLogMetrics,
  type LiveHistoryPoint,
} from "./liveMetrics";

export type MetricAvailability<T> =
  | { kind: "available"; value: T }
  | { kind: "pending" }
  | { kind: "unavailable" };

export interface HeapMetrics {
  usedBytes: number;
  totalBytes: number | null;
  limitBytes: number | null;
}

export interface StorageMetrics {
  usedBytes: number;
  quotaBytes: number;
}

export type RuntimeKind = "browser" | "electron" | "pwa";

export interface LiveEnvironmentSnapshot {
  sampledAt: number;
  fps: number | null;
  frameTimeMs: number | null;
  heap: MetricAvailability<HeapMetrics>;
  storage: MetricAvailability<StorageMetrics>;
  domNodeCount: number;
  viewportWidth: number;
  viewportHeight: number;
  devicePixelRatio: number;
  online: boolean;
  pageVisible: boolean;
  runtime: RuntimeKind;
  logRate: number;
  errorCount: number;
  warnCount: number;
  bufferedLogCount: number;
  history: LiveHistoryPoint[];
}

interface UseLiveEnvironmentSnapshotOptions {
  active: boolean;
  entries: readonly ConsoleLogEntry[];
}

const SAMPLE_INTERVAL_MS = 1_000;
const STORAGE_SAMPLE_FREQUENCY = 5;

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === "object" && value !== null;
}

function readHeapMetrics(): MetricAvailability<HeapMetrics> {
  const candidate: unknown = performance;
  if (!isRecord(candidate)) return { kind: "unavailable" };

  const memory = candidate.memory;
  if (!isRecord(memory) || typeof memory.usedJSHeapSize !== "number") {
    return { kind: "unavailable" };
  }

  return {
    kind: "available",
    value: {
      usedBytes: memory.usedJSHeapSize,
      totalBytes:
        typeof memory.totalJSHeapSize === "number"
          ? memory.totalJSHeapSize
          : null,
      limitBytes:
        typeof memory.jsHeapSizeLimit === "number"
          ? memory.jsHeapSizeLimit
          : null,
    },
  };
}

function isStandaloneDisplay(): boolean {
  const mediaStandalone =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const navigatorStandalone =
    "standalone" in navigator && navigator.standalone === true;
  return mediaStandalone || navigatorStandalone;
}

function detectRuntime(): RuntimeKind {
  if (isDesktop()) return "electron";
  return isStandaloneDisplay() ? "pwa" : "browser";
}

function storageIsSupported(): boolean {
  return typeof navigator.storage?.estimate === "function";
}

function createInitialSnapshot(): LiveEnvironmentSnapshot {
  return {
    sampledAt: Date.now(),
    fps: null,
    frameTimeMs: null,
    heap: { kind: "unavailable" },
    storage: storageIsSupported()
      ? { kind: "pending" }
      : { kind: "unavailable" },
    domNodeCount: 0,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    online: navigator.onLine,
    pageVisible: document.visibilityState === "visible",
    runtime: detectRuntime(),
    logRate: 0,
    errorCount: 0,
    warnCount: 0,
    bufferedLogCount: 0,
    history: [],
  };
}

export function useLiveEnvironmentSnapshot({
  active,
  entries,
}: UseLiveEnvironmentSnapshotOptions): LiveEnvironmentSnapshot {
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [snapshot, setSnapshot] = useState(createInitialSnapshot);

  useEffect(() => {
    if (!active) return;

    let alive = true;
    let animationFrameId = 0;
    let frameCount = 0;
    let cadenceStartedAt = performance.now();
    let sampleCount = 0;

    const requestStorageEstimate = () => {
      if (!storageIsSupported()) return;

      void navigator.storage
        .estimate()
        .then((estimate) => {
          if (!alive) return;
          const usedBytes = estimate.usage;
          const quotaBytes = estimate.quota;
          if (typeof usedBytes !== "number" || typeof quotaBytes !== "number") {
            setSnapshot((previous) => ({
              ...previous,
              storage: { kind: "unavailable" },
            }));
            return;
          }
          setSnapshot((previous) => ({
            ...previous,
            storage: {
              kind: "available",
              value: {
                usedBytes,
                quotaBytes,
              },
            },
          }));
        })
        .catch(() => {
          if (!alive) return;
          setSnapshot((previous) => ({
            ...previous,
            storage: { kind: "unavailable" },
          }));
        });
    };

    const publishSample = (includeCadence: boolean) => {
      const recordedAt = Date.now();
      const cadenceEndedAt = performance.now();
      const cadenceDuration = cadenceEndedAt - cadenceStartedAt;
      const pageVisible = document.visibilityState === "visible";
      const fps =
        includeCadence && pageVisible && cadenceDuration > 0
          ? Math.round((frameCount * 1_000 * 10) / cadenceDuration) / 10
          : null;
      const frameTimeMs =
        fps !== null && fps > 0 ? Math.round((1_000 / fps) * 10) / 10 : null;
      const logMetrics = calculateLogMetrics(entriesRef.current, recordedAt);
      const historyPoint: LiveHistoryPoint = {
        recordedAt,
        fps,
        logRate: logMetrics.logRate,
      };

      setSnapshot((previous) => ({
        sampledAt: recordedAt,
        fps,
        frameTimeMs,
        heap: readHeapMetrics(),
        storage:
          sampleCount === 0 && storageIsSupported()
            ? { kind: "pending" }
            : previous.storage,
        domNodeCount: document.getElementsByTagName("*").length,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio || 1,
        online: navigator.onLine,
        pageVisible,
        runtime: detectRuntime(),
        logRate: logMetrics.logRate,
        errorCount: logMetrics.errorCount,
        warnCount: logMetrics.warnCount,
        bufferedLogCount: entriesRef.current.length,
        history: appendHistoryPoint(
          includeCadence ? previous.history : [],
          historyPoint
        ),
      }));

      if (includeCadence) {
        frameCount = 0;
        cadenceStartedAt = cadenceEndedAt;
      }
      if (sampleCount % STORAGE_SAMPLE_FREQUENCY === 0) {
        requestStorageEstimate();
      }
      sampleCount += 1;
    };

    const countFrame = () => {
      frameCount += 1;
      animationFrameId = window.requestAnimationFrame(countFrame);
    };

    publishSample(false);
    animationFrameId = window.requestAnimationFrame(countFrame);
    const intervalId = window.setInterval(
      () => publishSample(true),
      SAMPLE_INTERVAL_MS
    );

    return () => {
      alive = false;
      window.clearInterval(intervalId);
      window.cancelAnimationFrame(animationFrameId);
    };
  }, [active]);

  return snapshot;
}
