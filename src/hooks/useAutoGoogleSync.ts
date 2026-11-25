import { useEffect, useRef } from "react";
import {
  calendarEventNeedsGooglePush,
  contactNeedsGooglePush,
  refreshGoogleStatus,
  runGoogleCalendarSync,
  runGoogleContactsSync,
} from "@/sync/googleSyncEngine";
import { useCalendarStore } from "@/stores/useCalendarStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useContactsStore } from "@/stores/useContactsStore";
import { useGoogleSyncStore } from "@/stores/useGoogleSyncStore";

const PUSH_DEBOUNCE_MS = 2_000;
const POLL_INTERVAL_MS = 3 * 60_000;
const MIN_FOCUS_SYNC_GAP_MS = 45_000;

export function useAutoGoogleSync() {
  const isAuthenticated = useChatsStore((s) => s.isAuthenticated);
  const username = useChatsStore((s) => s.username);
  const calendarSyncEnabled = useGoogleSyncStore((s) => s.calendarSyncEnabled);
  const contactsSyncEnabled = useGoogleSyncStore((s) => s.contactsSyncEnabled);

  const lastCalFocusSyncRef = useRef(0);
  const lastContactsFocusSyncRef = useRef(0);

  useEffect(() => {
    if (!isAuthenticated || !username) return;
    void refreshGoogleStatus();
  }, [isAuthenticated, username]);

  useEffect(() => {
    if (!isAuthenticated || !calendarSyncEnabled) return;

    let pushTimer: ReturnType<typeof setTimeout> | null = null;

    const schedulePushIfDirty = () => {
      if (!useCalendarStore.persist.hasHydrated()) return;
      const state = useCalendarStore.getState();
      const hasDirty =
        state.pendingGoogleDeletions.length > 0 ||
        state.events.some(calendarEventNeedsGooglePush);
      if (!hasDirty) return;

      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        pushTimer = null;
        void runGoogleCalendarSync({ mode: "incremental" }).catch(() => {});
      }, PUSH_DEBOUNCE_MS);
    };

    // Initial catch-up pull/push once hydrated.
    const initialTimer = setTimeout(() => {
      void runGoogleCalendarSync({ mode: "incremental" }).catch(() => {});
    }, 800);

    const unsubscribe = useCalendarStore.subscribe((state, prev) => {
      if (
        state.events !== prev.events ||
        state.pendingGoogleDeletions !== prev.pendingGoogleDeletions
      ) {
        schedulePushIfDirty();
      }
    });

    const onFocusOrVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastCalFocusSyncRef.current < MIN_FOCUS_SYNC_GAP_MS) return;
      lastCalFocusSyncRef.current = now;
      void runGoogleCalendarSync({ mode: "incremental" }).catch(() => {});
    };

    const pollInterval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void runGoogleCalendarSync({ mode: "incremental" }).catch(() => {});
    }, POLL_INTERVAL_MS);

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      clearTimeout(initialTimer);
      if (pushTimer) clearTimeout(pushTimer);
      clearInterval(pollInterval);
      unsubscribe();
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [isAuthenticated, calendarSyncEnabled]);

  useEffect(() => {
    if (!isAuthenticated || !contactsSyncEnabled) return;

    let pushTimer: ReturnType<typeof setTimeout> | null = null;

    const schedulePushIfDirty = () => {
      if (!useContactsStore.persist.hasHydrated()) return;
      const state = useContactsStore.getState();
      const hasDirty =
        state.pendingGoogleDeletions.length > 0 ||
        state.contacts.some(contactNeedsGooglePush);
      if (!hasDirty) return;

      if (pushTimer) clearTimeout(pushTimer);
      pushTimer = setTimeout(() => {
        pushTimer = null;
        void runGoogleContactsSync({ mode: "incremental" }).catch(() => {});
      }, PUSH_DEBOUNCE_MS);
    };

    const initialTimer = setTimeout(() => {
      void runGoogleContactsSync({ mode: "incremental" }).catch(() => {});
    }, 1000);

    const unsubscribe = useContactsStore.subscribe((state, prev) => {
      if (
        state.contacts !== prev.contacts ||
        state.pendingGoogleDeletions !== prev.pendingGoogleDeletions
      ) {
        schedulePushIfDirty();
      }
    });

    const onFocusOrVisible = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastContactsFocusSyncRef.current < MIN_FOCUS_SYNC_GAP_MS) return;
      lastContactsFocusSyncRef.current = now;
      void runGoogleContactsSync({ mode: "incremental" }).catch(() => {});
    };

    const pollInterval = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void runGoogleContactsSync({ mode: "incremental" }).catch(() => {});
    }, POLL_INTERVAL_MS);

    window.addEventListener("focus", onFocusOrVisible);
    document.addEventListener("visibilitychange", onFocusOrVisible);

    return () => {
      clearTimeout(initialTimer);
      if (pushTimer) clearTimeout(pushTimer);
      clearInterval(pollInterval);
      unsubscribe();
      window.removeEventListener("focus", onFocusOrVisible);
      document.removeEventListener("visibilitychange", onFocusOrVisible);
    };
  }, [isAuthenticated, contactsSyncEnabled]);
}
