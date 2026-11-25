import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useStoreShallow } from "@/stores/helpers";
import { createDebouncedPersistStorage } from "@/utils/debouncedPersistStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { isGoogleAuthAvailable } from "@/utils/runtimeConfig";
import type {
  GoogleInitialSyncChoice,
  GoogleLinkedAccountPublic,
  GoogleSyncFeature,
} from "@/shared/contracts/google";

export interface PendingGoogleInitialSyncPrompt {
  feature: GoogleSyncFeature;
  localCount: number;
  resolve: (choice: GoogleInitialSyncChoice | null) => void;
}

export interface GoogleSyncStoreState {
  ownerUsername: string | null;
  calendarSyncEnabled: boolean;
  contactsSyncEnabled: boolean;
  calendarInitialSyncCompleted: boolean;
  contactsInitialSyncCompleted: boolean;

  // Transient runtime status (fetched from /api/google/status & /api/auth/session)
  configured: boolean;
  linked: boolean;
  hasPassword: boolean;
  account: GoogleLinkedAccountPublic | null;
  isStatusLoading: boolean;
  isSyncingCalendar: boolean;
  isSyncingContacts: boolean;
  lastCalendarSyncError: string | null;
  lastContactsSyncError: string | null;
  pendingInitialSyncPrompt: PendingGoogleInitialSyncPrompt | null;

  ensureOwner: (username: string | null) => void;
  setServerStatus: (payload: {
    configured: boolean;
    linked: boolean;
    hasPassword?: boolean;
    account: GoogleLinkedAccountPublic | null;
  }) => void;
  setHasPassword: (hasPassword: boolean) => void;
  setStatusLoading: (loading: boolean) => void;
  setCalendarSyncEnabled: (enabled: boolean, completedInitial?: boolean) => void;
  setContactsSyncEnabled: (enabled: boolean, completedInitial?: boolean) => void;
  setSyncingCalendar: (syncing: boolean, error?: string | null) => void;
  setSyncingContacts: (syncing: boolean, error?: string | null) => void;
  openInitialSyncPrompt: (
    feature: GoogleSyncFeature,
    localCount: number
  ) => Promise<GoogleInitialSyncChoice | null>;
  resolveInitialSyncPrompt: (choice: GoogleInitialSyncChoice | null) => void;
  resetOnDisconnect: () => void;
  resetOnLogout: () => void;
}

export const useGoogleSyncStore = create<GoogleSyncStoreState>()(
  persist(
    (set, get) => ({
      ownerUsername: null,
      calendarSyncEnabled: false,
      contactsSyncEnabled: false,
      calendarInitialSyncCompleted: false,
      contactsInitialSyncCompleted: false,

      configured: isGoogleAuthAvailable(),
      linked: false,
      hasPassword: true,
      account: null,
      isStatusLoading: false,
      isSyncingCalendar: false,
      isSyncingContacts: false,
      lastCalendarSyncError: null,
      lastContactsSyncError: null,
      pendingInitialSyncPrompt: null,

      ensureOwner: (username) => {
        const normalized = username ? username.toLowerCase() : null;
        const currentOwner = get().ownerUsername;
        if (!normalized) {
          return;
        }
        if (currentOwner && currentOwner !== normalized) {
          set({
            ownerUsername: normalized,
            calendarSyncEnabled: false,
            contactsSyncEnabled: false,
            calendarInitialSyncCompleted: false,
            contactsInitialSyncCompleted: false,
            linked: false,
            account: null,
            lastCalendarSyncError: null,
            lastContactsSyncError: null,
          });
          return;
        }
        if (!currentOwner) {
          set({ ownerUsername: normalized });
        }
      },

      setServerStatus: ({ configured, linked, hasPassword, account }) => {
        set((state) => ({
          configured,
          linked,
          hasPassword:
            typeof hasPassword === "boolean" ? hasPassword : state.hasPassword,
          account,
          ...(!linked
            ? {
                calendarSyncEnabled: false,
                contactsSyncEnabled: false,
                calendarInitialSyncCompleted: false,
                contactsInitialSyncCompleted: false,
              }
            : {
                ...(account && !account.hasCalendarScope
                  ? { calendarSyncEnabled: false }
                  : {}),
                ...(account && !account.hasContactsScope
                  ? { contactsSyncEnabled: false }
                  : {}),
              }),
        }));
      },

      setHasPassword: (hasPassword) => set({ hasPassword }),

      setStatusLoading: (isStatusLoading) => set({ isStatusLoading }),

      setCalendarSyncEnabled: (enabled, completedInitial) =>
        set((state) => ({
          calendarSyncEnabled: enabled,
          calendarInitialSyncCompleted:
            typeof completedInitial === "boolean"
              ? completedInitial
              : state.calendarInitialSyncCompleted,
          lastCalendarSyncError: null,
        })),

      setContactsSyncEnabled: (enabled, completedInitial) =>
        set((state) => ({
          contactsSyncEnabled: enabled,
          contactsInitialSyncCompleted:
            typeof completedInitial === "boolean"
              ? completedInitial
              : state.contactsInitialSyncCompleted,
          lastContactsSyncError: null,
        })),

      setSyncingCalendar: (isSyncingCalendar, error) =>
        set((state) => ({
          isSyncingCalendar,
          lastCalendarSyncError:
            error !== undefined ? error : state.lastCalendarSyncError,
        })),

      setSyncingContacts: (isSyncingContacts, error) =>
        set((state) => ({
          isSyncingContacts,
          lastContactsSyncError:
            error !== undefined ? error : state.lastContactsSyncError,
        })),

      openInitialSyncPrompt: (feature, localCount) =>
        new Promise<GoogleInitialSyncChoice | null>((resolve) => {
          const prev = get().pendingInitialSyncPrompt;
          if (prev) {
            prev.resolve(null);
          }
          set({
            pendingInitialSyncPrompt: {
              feature,
              localCount,
              resolve,
            },
          });
        }),

      resolveInitialSyncPrompt: (choice) => {
        const current = get().pendingInitialSyncPrompt;
        set({ pendingInitialSyncPrompt: null });
        if (current) {
          current.resolve(choice);
        }
      },

      resetOnDisconnect: () => {
        const current = get().pendingInitialSyncPrompt;
        if (current) current.resolve(null);
        set({
          linked: false,
          account: null,
          calendarSyncEnabled: false,
          contactsSyncEnabled: false,
          calendarInitialSyncCompleted: false,
          contactsInitialSyncCompleted: false,
          isSyncingCalendar: false,
          isSyncingContacts: false,
          lastCalendarSyncError: null,
          lastContactsSyncError: null,
          pendingInitialSyncPrompt: null,
        });
      },

      resetOnLogout: () => {
        const current = get().pendingInitialSyncPrompt;
        if (current) current.resolve(null);
        set({
          linked: false,
          hasPassword: true,
          account: null,
          isStatusLoading: false,
          isSyncingCalendar: false,
          isSyncingContacts: false,
          lastCalendarSyncError: null,
          lastContactsSyncError: null,
          pendingInitialSyncPrompt: null,
        });
      },
    }),
    {
      name: STORAGE_KEYS.googleSync,
      version: 1,
      storage: createDebouncedPersistStorage(),
      partialize: (state) => ({
        ownerUsername: state.ownerUsername,
        calendarSyncEnabled: state.calendarSyncEnabled,
        contactsSyncEnabled: state.contactsSyncEnabled,
        calendarInitialSyncCompleted: state.calendarInitialSyncCompleted,
        contactsInitialSyncCompleted: state.contactsInitialSyncCompleted,
      }),
    }
  )
);

export function useGoogleSyncStoreShallow<T>(
  selector: (state: GoogleSyncStoreState) => T
): T {
  return useStoreShallow(useGoogleSyncStore, selector);
}
