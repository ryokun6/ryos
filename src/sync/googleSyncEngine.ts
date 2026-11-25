import {
  disconnectGoogleAccount,
  getGoogleStatus,
  openGoogleOAuthPopup,
  syncGoogleCalendarApi,
  syncGoogleContactsApi,
} from "@/api/google";
import { ApiRequestError } from "@/api/core";
import { getEffectiveTimezone } from "@/lib/timezoneConfig";
import type {
  GoogleCalendarSyncResponse,
  GoogleContactsSyncResponse,
  GoogleInitialSyncChoice,
  GoogleStatusResponse,
  GoogleSyncFeature,
  GoogleSyncedCalendarEvent,
} from "@/shared/contracts/google";
import { useCalendarStore, type CalendarEvent } from "@/stores/useCalendarStore";
import { useChatsStore } from "@/stores/useChatsStore";
import { useContactsStore } from "@/stores/useContactsStore";
import { useGoogleSyncStore } from "@/stores/useGoogleSyncStore";
import type { Contact } from "@/utils/contacts";
import { createClientLogger } from "@/utils/logger";
import { requestSignIn } from "@/utils/requestSignIn";

const log = createClientLogger("GoogleSync");

const MAX_UPDATES_PER_BATCH = 200;

let inFlightCalendarSync: Promise<GoogleCalendarSyncResponse | null> | null = null;
let inFlightContactsSync: Promise<GoogleContactsSyncResponse | null> | null = null;

export function calendarEventNeedsGooglePush(event: CalendarEvent): boolean {
  if (!event.googleEventId) return true;
  if (event.googleSyncedUpdatedAt === undefined) return true;
  return event.updatedAt > event.googleSyncedUpdatedAt;
}

export function contactNeedsGooglePush(contact: Contact): boolean {
  if (!contact.googleResourceName) return true;
  if (contact.googleSyncedUpdatedAt === undefined) return true;
  return contact.updatedAt > contact.googleSyncedUpdatedAt;
}

function toSyncedCalendarEvent(event: CalendarEvent): GoogleSyncedCalendarEvent {
  return {
    id: event.id,
    title: event.title,
    date: event.date,
    endDate: event.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    color: event.color,
    calendarId: event.calendarId,
    location: event.location,
    notes: event.notes,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
    googleEventId: event.googleEventId,
    googleCalendarId: event.googleCalendarId,
    googleEtag: event.googleEtag,
    googleRecurringEventId: event.googleRecurringEventId,
    googleSyncedUpdatedAt: event.googleSyncedUpdatedAt,
  };
}

export async function refreshGoogleStatus(): Promise<GoogleStatusResponse | null> {
  const { isAuthenticated, username } = useChatsStore.getState();
  const googleStore = useGoogleSyncStore.getState();
  googleStore.ensureOwner(username);

  googleStore.setStatusLoading(true);
  try {
    const status = await getGoogleStatus();
    if (!isAuthenticated) {
      googleStore.setServerStatus({
        configured: status.configured,
        linked: false,
        account: null,
      });
    } else {
      googleStore.setServerStatus({
        configured: status.configured,
        linked: status.linked,
        hasPassword: status.hasPassword,
        account: status.account,
      });
    }
    return status;
  } catch (err) {
    log.warn("Failed to fetch Google status", err);
    return null;
  } finally {
    useGoogleSyncStore.getState().setStatusLoading(false);
  }
}

export async function connectGoogleAccount(
  features?: GoogleSyncFeature[]
): Promise<GoogleStatusResponse> {
  const { isAuthenticated } = useChatsStore.getState();
  if (!isAuthenticated) {
    requestSignIn();
    throw new Error("Sign in to ryOS first to link a Google account.");
  }

  const currentStatus = await refreshGoogleStatus();
  const mode = currentStatus?.linked ? "scopes" : "link";

  const result = await openGoogleOAuthPopup({
    mode,
    features,
  });

  if (result.status === "error") {
    throw new Error(result.error || "Google authorization failed.");
  }

  const refreshed = await refreshGoogleStatus();
  if (!refreshed || !refreshed.linked) {
    throw new Error("Google account was not linked.");
  }
  return refreshed;
}

export async function ensureGoogleFeatureAuthorized(
  feature: GoogleSyncFeature
): Promise<GoogleStatusResponse> {
  let status = await refreshGoogleStatus();
  const hasScope =
    feature === "calendar"
      ? Boolean(status?.linked && status.account?.hasCalendarScope)
      : Boolean(status?.linked && status.account?.hasContactsScope);

  if (status && hasScope) {
    return status;
  }

  status = await connectGoogleAccount([feature]);
  const grantedNow =
    feature === "calendar"
      ? Boolean(status.account?.hasCalendarScope)
      : Boolean(status.account?.hasContactsScope);

  if (!grantedNow) {
    throw new Error(
      feature === "calendar"
        ? "Google Calendar permission was not granted."
        : "Google Contacts permission was not granted."
    );
  }

  return status;
}

export async function runGoogleCalendarSync(options?: {
  mode?: "incremental" | "reset_pull";
}): Promise<GoogleCalendarSyncResponse | null> {
  if (inFlightCalendarSync) {
    return inFlightCalendarSync;
  }

  const { isAuthenticated } = useChatsStore.getState();
  const googleState = useGoogleSyncStore.getState();
  if (!isAuthenticated || !googleState.calendarSyncEnabled) {
    return null;
  }

  const task = (async (): Promise<GoogleCalendarSyncResponse | null> => {
    useGoogleSyncStore.getState().setSyncingCalendar(true, null);
    try {
      const calState = useCalendarStore.getState();
      const dirtyEvents = calState.events
        .filter(calendarEventNeedsGooglePush)
        .slice(0, MAX_UPDATES_PER_BATCH)
        .map(toSyncedCalendarEvent);
      const deletions = calState.pendingGoogleDeletions.slice(
        0,
        MAX_UPDATES_PER_BATCH
      );

      const response = await syncGoogleCalendarApi({
        mode: options?.mode ?? "incremental",
        timeZone: getEffectiveTimezone(),
        upserts: dirtyEvents,
        deletions,
      });

      useCalendarStore.getState().applyGoogleCalendarSyncResult(response);
      useGoogleSyncStore.getState().setSyncingCalendar(false, null);
      void refreshGoogleStatus();
      return response;
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Google Calendar sync failed";
      log.warn("Google Calendar sync error", err);
      if (
        err instanceof ApiRequestError &&
        (err.code === "GOOGLE_REAUTH_REQUIRED" ||
          err.code === "GOOGLE_SCOPE_REQUIRED" ||
          err.code === "GOOGLE_NOT_LINKED")
      ) {
        useGoogleSyncStore.getState().setCalendarSyncEnabled(false);
      }
      useGoogleSyncStore.getState().setSyncingCalendar(false, message);
      throw err;
    } finally {
      inFlightCalendarSync = null;
    }
  })();

  inFlightCalendarSync = task;
  return task;
}

export async function runGoogleContactsSync(options?: {
  mode?: "incremental" | "reset_pull";
}): Promise<GoogleContactsSyncResponse | null> {
  if (inFlightContactsSync) {
    return inFlightContactsSync;
  }

  const { isAuthenticated } = useChatsStore.getState();
  const googleState = useGoogleSyncStore.getState();
  if (!isAuthenticated || !googleState.contactsSyncEnabled) {
    return null;
  }

  const task = (async (): Promise<GoogleContactsSyncResponse | null> => {
    useGoogleSyncStore.getState().setSyncingContacts(true, null);
    try {
      const contactsState = useContactsStore.getState();
      const dirtyContacts = contactsState.contacts
        .filter(contactNeedsGooglePush)
        .slice(0, MAX_UPDATES_PER_BATCH);
      const deletions = contactsState.pendingGoogleDeletions.slice(
        0,
        MAX_UPDATES_PER_BATCH
      );

      const response = await syncGoogleContactsApi({
        mode: options?.mode ?? "incremental",
        upserts: dirtyContacts,
        deletions,
      });

      useContactsStore.getState().applyGoogleContactsSyncResult(response);
      useGoogleSyncStore.getState().setSyncingContacts(false, null);
      void refreshGoogleStatus();
      return response;
    } catch (err) {
      const message =
        err instanceof ApiRequestError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Google Contacts sync failed";
      log.warn("Google Contacts sync error", err);
      if (
        err instanceof ApiRequestError &&
        (err.code === "GOOGLE_REAUTH_REQUIRED" ||
          err.code === "GOOGLE_SCOPE_REQUIRED" ||
          err.code === "GOOGLE_NOT_LINKED")
      ) {
        useGoogleSyncStore.getState().setContactsSyncEnabled(false);
      }
      useGoogleSyncStore.getState().setSyncingContacts(false, message);
      throw err;
    } finally {
      inFlightContactsSync = null;
    }
  })();

  inFlightContactsSync = task;
  return task;
}

export async function applyInitialGoogleSyncChoice(
  feature: GoogleSyncFeature,
  choice: GoogleInitialSyncChoice
): Promise<void> {
  if (feature === "calendar") {
    if (choice === "discard") {
      useCalendarStore.getState().discardAllLocalEventsForGoogleSync();
    }
    useGoogleSyncStore.getState().setCalendarSyncEnabled(true, true);
    await runGoogleCalendarSync({ mode: "reset_pull" });
    return;
  }

  if (choice === "discard") {
    useContactsStore.getState().discardAllLocalContactsForGoogleSync();
  }
  useGoogleSyncStore.getState().setContactsSyncEnabled(true, true);
  await runGoogleContactsSync({ mode: "reset_pull" });
}

export async function enableGoogleFeatureSync(
  feature: GoogleSyncFeature
): Promise<boolean> {
  const { isAuthenticated } = useChatsStore.getState();
  if (!isAuthenticated) {
    requestSignIn();
    return false;
  }

  await ensureGoogleFeatureAuthorized(feature);

  const googleState = useGoogleSyncStore.getState();
  const alreadyCompletedInitial =
    feature === "calendar"
      ? googleState.calendarInitialSyncCompleted
      : googleState.contactsInitialSyncCompleted;

  if (!alreadyCompletedInitial) {
    const localCount =
      feature === "calendar"
        ? useCalendarStore.getState().events.length
        : useContactsStore.getState().contacts.length;

    const choice = await useGoogleSyncStore
      .getState()
      .openInitialSyncPrompt(feature, localCount);

    if (!choice) {
      return false;
    }

    await applyInitialGoogleSyncChoice(feature, choice);
    return true;
  }

  if (feature === "calendar") {
    useGoogleSyncStore.getState().setCalendarSyncEnabled(true, true);
    await runGoogleCalendarSync({ mode: "incremental" });
  } else {
    useGoogleSyncStore.getState().setContactsSyncEnabled(true, true);
    await runGoogleContactsSync({ mode: "incremental" });
  }
  return true;
}

export function disableGoogleFeatureSync(feature: GoogleSyncFeature): void {
  if (feature === "calendar") {
    useGoogleSyncStore.getState().setCalendarSyncEnabled(false);
  } else {
    useGoogleSyncStore.getState().setContactsSyncEnabled(false);
  }
}

export async function disconnectGoogleAndCleanup(): Promise<void> {
  await disconnectGoogleAccount();
  useGoogleSyncStore.getState().resetOnDisconnect();
  useCalendarStore.getState().detachGoogleCalendarMetadata();
  useContactsStore.getState().detachGoogleContactsMetadata();
}
