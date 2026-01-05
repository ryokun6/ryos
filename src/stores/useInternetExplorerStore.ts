import { create } from "zustand";
import { persist } from "zustand/middleware";

// Define types
export interface Favorite {
  title: string;
  url?: string; // Optional for folders
  favicon?: string;
  year?: string;
  children?: Favorite[]; // Add children for nested folders
  isDirectory?: boolean; // New: Flag to indicate if it's a folder
}

// Define a constant for domains that bypass the proxy when in "now" mode
export const DIRECT_PASSTHROUGH_DOMAINS = [
  "baby-cursor.ryo.lu",
  "os.ryo.lu",
  "hcsimulator.com",
  "os.rocorgi.wang",
  "iso-city.com",
  "shaoruu.io",
];

export interface HistoryEntry {
  url: string;
  title: string;
  favicon?: string;
  timestamp: number;
  year?: string;
}

export type NavigationMode = "past" | "now" | "future";
export type NavigationStatus = "idle" | "loading" | "success" | "error";

// Language and location options
export type LanguageOption =
  | "auto"
  | "english"
  | "chinese"
  | "japanese"
  | "korean"
  | "french"
  | "spanish"
  | "portuguese"
  | "german"
  | "welsh"
  | "sanskrit"
  | "latin"
  | "alien"
  | "ai_language"
  | "digital_being";
export type LocationOption =
  | "auto"
  | "united_states"
  | "china"
  | "japan"
  | "korea"
  | "france"
  | "spain"
  | "portugal"
  | "germany"
  | "canada"
  | "uk"
  | "india"
  | "brazil"
  | "australia"
  | "russia";

// Default constants
export const DEFAULT_URL = "https://apple.com";
export const DEFAULT_YEAR = "2001";

export const DEFAULT_TIMELINE: { [year: string]: string } = {
  "2030":
    "FDA neural implants. Emotion wearables mainstream. CRISPR prime+base. Organ-print trials. Alzheimer halt drug. Neuralink-v5 patients. Net-positive fusion demo.",
  "2040":
    "AI city governance. Quantum-profit compute. Desktop molecular printers. Smart-dust logistics. Neuromorphic cores. Tactile-holo rooms. Life+20 gene edits. Cancer cured. Orbital-solar farms.",
  "2050":
    "Cloud mind-backups. Digital-heir laws. Sentient-AI rights fight. Medical neural-dust. Photoreal AR lenses. Designer embryos. Age-decel commonplace. Fusion grids dominant.",
  "2060":
    "Human-AI merge wave. Symbiont organs stock. Quantum neural mesh. Home matter assembler. Age reversal < 40. 150-yr median lives. Zero-carbon fusion grid.",
  "2070":
    "Post-scarcity UBI. Auto fab-cities. Climate healed. Ocean revival. Terraform Moon & Mars. Asteroid-mining boom.",
  "2080":
    "Daily uploads. Hive-mind trials. Synth-reality on demand. Femtotech labs. Quantum-teleport cargo. Genome rewrite opt-in. Rental avatars. Bio-immortality near.",
  "2090":
    "QC standard. Home molecular-fab. Nanomed auto-repair. Seamless brain-cloud. Space elevator. Orbital ring. Dyson-swarm phase-1. Mars tera-phase-2. Venus cloud cities.",
  "2100":
    "Planet mind-net. Supra-AI council. Subatomic chips. Probability-hack toys. Space-adapted clades. Dyson complete. Generation ships depart.",
  "2150":
    "Solar mind-mesh. Substrate-free selves. Vacuum computing. Reality-script APIs. Zero-point norm. FTL entangle chat. Stable micro-wormholes.",
  "2200":
    "Fluid minds. Shape-shift avatars. Hyperspace thought. Exotic compute lattices. Dimensional forging. Star-lifting works. Teleport loops.",
  "2250":
    "Stars reached. Exoplanet colonies. Alien microbe meet. Universal translator. Galaxy entangle-net. Anti-dilate meds.",
  "2300":
    "Opt-in hives. Reality-architect guilds. Pocket universes. Dark-matter biotech. Tame micro-black holes. 50+ colonized systems.",
  "2400":
    "Galactic grid mature. Multi-species federation. Stellar gardening. Planet sculpting. Culture hyper-exchange.",
  "2500":
    "Meta-singularity era. Transcendent minds. Constant tuning. Multiverse portals. Conscious nebulae. Galaxy infosphere.",
  "2750":
    "Inter-galactic leap. Dyson-cluster swarms. Higher-D labs. Time-canal experiments. Cosmic AI overseer.",
  "3000":
    "Omniverse civilization. Plastic physics. Infinite realms. Boundless cognition.",
};

export const DEFAULT_FAVORITES: Favorite[] = [
  {
    title: "Apple",
    url: "https://apple.com",
    favicon: "https://www.google.com/s2/favicons?domain=apple.com&sz=32",
    year: "2001",
    isDirectory: false,
  },
  {
    title: "Ryo",
    url: "https://ryo.lu",
    favicon: "https://www.google.com/s2/favicons?domain=ryo.lu&sz=32",
    year: "current",
    isDirectory: false,
  },
  {
    title: "ryOS Docs",
    url: "https://os.ryo.lu/docs",
    favicon: "https://www.google.com/s2/favicons?domain=os.ryo.lu&sz=32",
    year: "current",
    isDirectory: false,
  },
  {
    title: "NewJeans",
    url: "https://newjeans.jp",
    favicon: "https://www.google.com/s2/favicons?domain=newjeans.jp&sz=32",
    year: "current",
    isDirectory: false,
  },
  {
    title: "Friends",
    isDirectory: true, // Mark as directory
    children: [
      {
        title: "ISOCITY",
        url: "https://iso-city.com",
        favicon: "https://www.google.com/s2/favicons?domain=iso-city.com&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Ian",
        url: "https://shaoruu.io",
        favicon: "https://www.google.com/s2/favicons?domain=shaoruu.io&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Long",
        url: "https://os.rocorgi.wang",
        favicon:
          "https://www.google.com/s2/favicons?domain=os.rocorgi.wang&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Maya",
        url: "https://mayabakir.com",
        favicon:
          "https://www.google.com/s2/favicons?domain=mayabakir.com&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Modi",
        url: "https://www.akm.io",
        favicon: "https://www.google.com/s2/favicons?domain=www.akm.io&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Sam",
        url: "https://www.samuelcatania.com",
        favicon:
          "https://www.google.com/s2/favicons?domain=www.samuelcatania.com&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Stephen",
        url: "https://wustep.me",
        favicon: "https://www.google.com/s2/favicons?domain=wustep.me&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Theo",
        url: "https://tmb.sh",
        favicon: "https://www.google.com/s2/favicons?domain=tmb.sh&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Tyler",
        url: "https://tyler.cafe",
        favicon: "https://www.google.com/s2/favicons?domain=tyler.cafe&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Andrew",
        url: "https://www.andrewl.ee",
        favicon:
          "https://www.google.com/s2/favicons?domain=www.andrewl.ee&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Ekin",
        url: "https://www.ekinoflazer.com",
        favicon:
          "https://www.google.com/s2/favicons?domain=www.ekinoflazer.com&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Lucas",
        url: "https://www.lucasn.com",
        favicon:
          "https://www.google.com/s2/favicons?domain=www.lucasn.com&sz=32",
        year: "current",
        isDirectory: false,
      },
    ],
  },
  // Work Folder
  {
    title: "Work",
    isDirectory: true, // Mark as directory
    children: [
      {
        title: "Cursor",
        url: "https://cursor.sh",
        favicon: "https://www.google.com/s2/favicons?domain=cursor.com&sz=32",
        year: "1992",
        isDirectory: false,
      },
      {
        title: "Notion",
        url: "https://notion.com",
        favicon: "https://www.google.com/s2/favicons?domain=notion.com&sz=32",
        year: "1800",
        isDirectory: false,
      },
      {
        title: "Stripe",
        url: "https://stripe.com",
        favicon: "https://www.google.com/s2/favicons?domain=stripe.com&sz=32",
        year: "2018",
        isDirectory: false,
      },
    ],
  },
  // Tools Folder
  {
    title: "Tools",
    isDirectory: true, // Mark as directory
    children: [
      {
        title: "Baby Cursor",
        url: "https://baby-cursor.ryo.lu",
        favicon: "https://www.google.com/s2/favicons?domain=ryo.lu&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "HyperCards",
        url: "https://hcsimulator.com",
        favicon:
          "https://www.google.com/s2/favicons?domain=hcsimulator.com&sz=32",
        year: "current",
        isDirectory: false,
      },
    ],
  },
  // Sites Folder
  {
    title: "Sites",
    isDirectory: true, // Mark as directory
    children: [
      {
        title: "Disney",
        url: "https://disney.com",
        favicon: "https://www.google.com/s2/favicons?domain=disney.com&sz=32",
        year: "1997",
        isDirectory: false,
      },
      {
        title: "GeoCities",
        url: "https://geocities.restorativland.org", // Example archive/representation
        favicon:
          "https://www.google.com/s2/favicons?domain=geocities.com&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Microsoft",
        url: "https://microsoft.com",
        favicon:
          "https://www.google.com/s2/favicons?domain=microsoft.com&sz=32",
        year: "1996",
        isDirectory: false,
      },
      {
        title: "Netscape",
        url: "https://netscape.com", // Might redirect or be an archive
        favicon: "https://www.google.com/s2/favicons?domain=netscape.com&sz=32",
        year: "1996",
        isDirectory: false,
      },
      {
        title: "NYTimes",
        url: "https://nytimes.com",
        favicon: "https://www.google.com/s2/favicons?domain=nytimes.com&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Wikipedia",
        url: "https://en.wikipedia.org/wiki",
        favicon:
          "https://www.google.com/s2/favicons?domain=en.wikipedia.org&sz=32",
        year: "current",
        isDirectory: false,
      },
      {
        title: "Google",
        url: "https://google.com",
        favicon: "https://www.google.com/s2/favicons?domain=google.com&sz=32",
        year: "1999",
        isDirectory: false,
      },
      {
        title: "Space Jam",
        url: "https://www.spacejam.com/index.cgi",
        favicon: "https://www.google.com/s2/favicons?domain=spacejam.com&sz=32",
        year: "1996",
        isDirectory: false,
      },
    ],
  },
];

// Define the current version for the store
const CURRENT_IE_STORE_VERSION = 5;

// Helper function to classify year into navigation mode
function classifyYear(year: string): NavigationMode {
  if (year === "current") return "now";
  const yearNum = parseInt(year);
  const currentYear = new Date().getFullYear();
  return yearNum > currentYear ? "future" : "past";
}

// Cache related types and functions (removed for localStorage space)

// Define type for iframe check response (copied from component)
/*
interface IframeCheckResponse {
  allowed: boolean;
  reason?: string;
  title?: string;
}
*/

// Define type for error response (copied from component)
export interface ErrorResponse {
  // Make exportable if needed elsewhere
  error: boolean;
  type: string;
  status?: number;
  statusText?: string;
  message: string;
  details?: string;
  hostname?: string;
  targetUrl?: string;
}

interface InternetExplorerStore {
  // Navigation state
  url: string;
  year: string;
  mode: NavigationMode;
  status: NavigationStatus;
  finalUrl: string | null;
  aiGeneratedHtml: string | null;
  error: string | null; // Keep simple error string for general errors? Or remove if errorDetails covers all? Let's keep for now.
  token: number;
  prefetchedTitle: string | null; // New: Store prefetched title
  errorDetails: ErrorResponse | null; // New: Store detailed error info

  // Favorites and history
  favorites: Favorite[];
  history: HistoryEntry[];
  historyIndex: number;

  // Language and location settings
  language: LanguageOption;
  location: LocationOption;

  // Dialog states
  isTitleDialogOpen: boolean;
  newFavoriteTitle: string;
  isHelpDialogOpen: boolean;
  isAboutDialogOpen: boolean;
  isNavigatingHistory: boolean;
  isClearFavoritesDialogOpen: boolean;
  isClearHistoryDialogOpen: boolean;
  isResetFavoritesDialogOpen: boolean; // New
  isFutureSettingsDialogOpen: boolean; // New

  // AI caching (removed)

  // Timeline settings
  timelineSettings: { [year: string]: string };

  // Title management
  currentPageTitle: string | null;

  // Time Machine Feature
  isTimeMachineViewOpen: boolean;
  cachedYears: string[];
  isFetchingCachedYears: boolean;

  // New state for pending navigation from Finder
  pendingUrl: string | null;
  pendingYear: string | null;

  // Actions
  setUrl: (url: string) => void;
  setYear: (year: string) => void;
  navigateStart: (
    url: string,
    year: string,
    mode: NavigationMode,
    token: number
  ) => void;
  setFinalUrl: (finalUrl: string) => void;
  loadSuccess: (payload: {
    title?: string | null;
    finalUrl?: string;
    aiGeneratedHtml?: string | null;
    targetUrl?: string; // Renamed from url in payload for clarity
    targetYear?: string; // Renamed from year for clarity
    favicon?: string;
    addToHistory?: boolean;
  }) => void;
  loadError: (error: string, errorDetails?: ErrorResponse) => void; // Modified to accept optional errorDetails
  cancel: () => void;
  handleNavigationError: (
    errorData: ErrorResponse,
    targetUrlOnError: string
  ) => void; // New action for specific error handling

  // Favorites actions
  addFavorite: (favorite: Favorite) => void;
  removeFavorite: (index: number) => void;
  clearFavorites: () => void;

  // History actions
  setHistoryIndex: (index: number) => void;
  clearHistory: () => void;

  // Dialog actions
  setTitleDialogOpen: (isOpen: boolean) => void;
  setNewFavoriteTitle: (title: string) => void;
  setHelpDialogOpen: (isOpen: boolean) => void;
  setAboutDialogOpen: (isOpen: boolean) => void;
  setNavigatingHistory: (isNavigating: boolean) => void;
  setClearFavoritesDialogOpen: (isOpen: boolean) => void;
  setClearHistoryDialogOpen: (isOpen: boolean) => void;
  setResetFavoritesDialogOpen: (isOpen: boolean) => void; // New
  setFutureSettingsDialogOpen: (isOpen: boolean) => void; // New

  // Cache actions (removed)

  // Timeline actions
  setTimelineSettings: (settings: { [year: string]: string }) => void;

  // Title management action
  setCurrentPageTitle: (title: string | null) => void;

  // Prefetched title action
  setPrefetchedTitle: (title: string | null) => void; // New

  // Error details actions
  setErrorDetails: (details: ErrorResponse | null) => void; // New
  clearErrorDetails: () => void; // New specific action

  // Language and location actions
  setLanguage: (language: LanguageOption) => void;
  setLocation: (location: LocationOption) => void;

  // Time Machine Actions
  setTimeMachineViewOpen: (isOpen: boolean) => void;
  fetchCachedYears: (url: string) => Promise<void>;

  // New actions for pending navigation
  setPendingNavigation: (url: string, year?: string) => void;
  clearPendingNavigation: () => void;

  // Utility functions
  updateBrowserState: () => void;
}

// Helper function to get hostname (copied from component)
const getHostname = (targetUrl: string): string => {
  try {
    // Special handling: our proxy path starts with /api/iframe-check?url=<encoded>
    if (targetUrl.startsWith("/")) {
      const query = targetUrl.split("?")[1] || "";
      const params = new URLSearchParams(query);
      const inner = params.get("url");
      if (inner) {
        return new URL(inner.startsWith("http") ? inner : `https://${inner}`)
          .hostname;
      }
      // Fallback to unknown for other internal paths
      return "unknown";
    }
    return new URL(
      targetUrl.startsWith("http") ? targetUrl : `https://${targetUrl}`
    ).hostname;
  } catch {
    return "unknown";
  }
};

// Helper function to normalize URLs for history/caching
const normalizeUrlForHistory = (url: string): string => {
  let normalized = url.replace(/^https?:\/\//, "");
  normalized = normalized.replace(/\/$/, ""); // Remove trailing slash
  return normalized;
};

// Define the initial state structure more explicitly for migration
const getInitialState = () => ({
  url: DEFAULT_URL,
  year: DEFAULT_YEAR,
  mode: classifyYear(DEFAULT_YEAR),
  status: "idle" as NavigationStatus,
  finalUrl: null as string | null,
  aiGeneratedHtml: null as string | null,
  error: null as string | null,
  token: 0,
  prefetchedTitle: null as string | null,
  errorDetails: null as ErrorResponse | null,
  favorites: DEFAULT_FAVORITES,
  history: [] as HistoryEntry[],
  historyIndex: -1,
  language: "auto" as LanguageOption,
  location: "auto" as LocationOption,
  isTitleDialogOpen: false,
  newFavoriteTitle: "",
  isHelpDialogOpen: false,
  isAboutDialogOpen: false,
  isNavigatingHistory: false,
  isClearFavoritesDialogOpen: false,
  isClearHistoryDialogOpen: false,
  isResetFavoritesDialogOpen: false,
  isFutureSettingsDialogOpen: false,
  timelineSettings: {} as { [year: string]: string },
  currentPageTitle: null as string | null,
  isTimeMachineViewOpen: false,
  cachedYears: [] as string[],
  isFetchingCachedYears: false,
  // Add initial state for pending navigation
  pendingUrl: null as string | null,
  pendingYear: null as string | null,
});

export const useInternetExplorerStore = create<InternetExplorerStore>()(
  persist(
    (set, get) => ({
      ...getInitialState(),

      setUrl: (url) => set({ url }),

      setYear: (year) => set({ year }),

      navigateStart: (url, year, mode, token) =>
        set({
          url,
          year,
          mode,
          status: "loading",
          finalUrl: null,
          aiGeneratedHtml: null,
          error: null,
          token,
          currentPageTitle: null,
          errorDetails: null,
          prefetchedTitle: null,
          // Clear cached years on new navigation
          cachedYears: [],
          isFetchingCachedYears: false,
        }),

      setFinalUrl: (finalUrl) => set({ finalUrl }),

      loadSuccess: ({
        title,
        finalUrl,
        aiGeneratedHtml,
        targetUrl,
        targetYear,
        favicon,
        addToHistory = true,
      }) =>
        set((state) => {
          const newState: Partial<InternetExplorerStore> = {
            status: "success",
            error: null,
            errorDetails: null,
            currentPageTitle:
              title !== undefined ? title : state.prefetchedTitle,
            finalUrl: finalUrl ?? state.finalUrl,
            aiGeneratedHtml: aiGeneratedHtml ?? state.aiGeneratedHtml,
            prefetchedTitle: null,
          };

          let addedToHistory = false; // Flag to track if a new entry was actually added/updated

          if (addToHistory && targetUrl) {
            const normalizedTargetUrl = normalizeUrlForHistory(targetUrl);
            const historyTitle =
              newState.currentPageTitle || getHostname(targetUrl);
            const newEntry: HistoryEntry = {
              url: normalizedTargetUrl, // Use normalized URL
              title: historyTitle,
              favicon:
                favicon ||
                `https://www.google.com/s2/favicons?domain=${getHostname(
                  targetUrl
                )}&sz=32`,
              year: targetYear,
              timestamp: Date.now(),
            };

            if (state.isNavigatingHistory) {
              const lastEntry = state.history[state.historyIndex];
              // Update title if navigating back/forward and title changed
              if (
                lastEntry &&
                lastEntry.title !== newEntry.title &&
                normalizeUrlForHistory(lastEntry.url) === newEntry.url &&
                lastEntry.year === newEntry.year
              ) {
                const updatedHistory = [...state.history];
                updatedHistory[state.historyIndex] = {
                  ...lastEntry,
                  title: newEntry.title,
                };
                newState.history = updatedHistory;
                addedToHistory = true; // Considered an update
              }
              // No need to update historyIndex here, it's set by handleGoBack/Forward
              newState.historyIndex = state.historyIndex;
            } else {
              const mostRecentEntry = state.history[0];
              // Check for duplicates using normalized URL and year
              const isDuplicate =
                mostRecentEntry &&
                normalizeUrlForHistory(mostRecentEntry.url) === newEntry.url &&
                mostRecentEntry.year === newEntry.year;

              if (isDuplicate) {
                // If it's a duplicate, potentially update the title if it changed
                if (mostRecentEntry.title !== newEntry.title) {
                  const updatedHistory = [...state.history];
                  updatedHistory[0] = {
                    ...mostRecentEntry,
                    title: newEntry.title,
                    url: newEntry.url,
                  }; // Update URL too, just in case
                  newState.history = updatedHistory;
                  addedToHistory = true; // Considered an update
                }
                newState.historyIndex = 0;
              } else {
                // Add new entry if not a duplicate
                newState.history = [newEntry, ...state.history].slice(0, 100);
                newState.historyIndex = 0;
                addedToHistory = true; // New entry added
              }
            }

            // Update the main URL state to the normalized version only if history was modified
            if (targetUrl) {
              newState.url = normalizeUrlForHistory(targetUrl);
            }
          } else if (!addToHistory) {
            newState.historyIndex = state.historyIndex;
          }

          // Fetch cached years after successful navigation if history was added/updated
          if (addedToHistory && targetUrl) {
            // Trigger fetch, but don't block state update
            get().fetchCachedYears(targetUrl);
          }
          // If no history update occurred (duplicate) and cachedYears is empty, still fetch
          else if (!addedToHistory && targetUrl) {
            const existingCachedYears = get().cachedYears;
            if (!existingCachedYears || existingCachedYears.length === 0) {
              get().fetchCachedYears(targetUrl);
            }
          }

          get().updateBrowserState();

          return newState;
        }),

      loadError: (error, errorDetails) =>
        set({
          status: "error",
          error,
          errorDetails: errorDetails ?? null,
        }),

      handleNavigationError: (errorData, targetUrlOnError) =>
        set((state) => {
          const newErrorDetails: ErrorResponse = {
            ...errorData,
            targetUrl: targetUrlOnError,
            hostname: getHostname(targetUrlOnError),
          };

          const newState: Partial<InternetExplorerStore> = {
            status: "error",
            error: newErrorDetails.message.split(".")[0] || "Navigation Error",
            errorDetails: newErrorDetails,
            aiGeneratedHtml: null,
          };

          // Add errored page to history so back button works
          if (targetUrlOnError && !state.isNavigatingHistory) {
            const normalizedUrl = normalizeUrlForHistory(targetUrlOnError);
            const errorTitle = `Error: ${getHostname(targetUrlOnError)}`;
            const newEntry: HistoryEntry = {
              url: normalizedUrl,
              title: errorTitle,
              favicon: `https://www.google.com/s2/favicons?domain=${getHostname(targetUrlOnError)}&sz=32`,
              year: state.year,
              timestamp: Date.now(),
            };

            const mostRecentEntry = state.history[0];
            // Check for duplicates
            const isDuplicate =
              mostRecentEntry &&
              normalizeUrlForHistory(mostRecentEntry.url) === newEntry.url &&
              mostRecentEntry.year === newEntry.year;

            if (!isDuplicate) {
              newState.history = [newEntry, ...state.history].slice(0, 100);
              newState.historyIndex = 0;
            }
          }

          return newState;
        }),

      cancel: () => set({ status: "idle", errorDetails: null }),

      addFavorite: (favorite) =>
        set((state) => ({
          favorites: [...state.favorites, favorite],
        })),

      removeFavorite: (index) =>
        set((state) => ({
          favorites: state.favorites.filter((_, i) => i !== index),
        })),

      clearFavorites: () => set({ favorites: [] }),

      setHistoryIndex: (index) => set({ historyIndex: index }),

      clearHistory: () => set({ history: [], historyIndex: -1 }),

      setTitleDialogOpen: (isOpen) => set({ isTitleDialogOpen: isOpen }),
      setNewFavoriteTitle: (title) => set({ newFavoriteTitle: title }),
      setHelpDialogOpen: (isOpen) => set({ isHelpDialogOpen: isOpen }),
      setAboutDialogOpen: (isOpen) => set({ isAboutDialogOpen: isOpen }),
      setNavigatingHistory: (isNavigating) =>
        set({ isNavigatingHistory: isNavigating }),
      setClearFavoritesDialogOpen: (isOpen) =>
        set({ isClearFavoritesDialogOpen: isOpen }),
      setClearHistoryDialogOpen: (isOpen) =>
        set({ isClearHistoryDialogOpen: isOpen }),
      setResetFavoritesDialogOpen: (isOpen) =>
        set({ isResetFavoritesDialogOpen: isOpen }),
      setFutureSettingsDialogOpen: (isOpen) =>
        set({ isFutureSettingsDialogOpen: isOpen }),

      setTimelineSettings: (settings) => set({ timelineSettings: settings }),

      setCurrentPageTitle: (title) => set({ currentPageTitle: title }),

      setPrefetchedTitle: (title) => set({ prefetchedTitle: title }),

      setErrorDetails: (details) => set({ errorDetails: details }),
      clearErrorDetails: () => set({ errorDetails: null, error: null }),

      setLanguage: (language) => set({ language }),
      setLocation: (location) => set({ location }),

      setTimeMachineViewOpen: (isOpen) =>
        set({ isTimeMachineViewOpen: isOpen }),
      fetchCachedYears: async (url) => {
        if (!url) return;
        set({ isFetchingCachedYears: true, cachedYears: [] });
        try {
          const normalizedUrl = url.startsWith("http") ? url : `https://${url}`;
          const response = await fetch(
            `/api/iframe-check?mode=list-cache&url=${encodeURIComponent(
              normalizedUrl
            )}`
          );
          if (!response.ok) {
            throw new Error(
              `Failed to fetch cached years: ${response.statusText}`
            );
          }
          const data = await response.json();
          const fetchedYears: string[] = data.years || [];
          const currentActualYear = new Date().getFullYear();

          const futureYearsApi = fetchedYears
            .filter(
              (year) =>
                !isNaN(parseInt(year)) && parseInt(year) > currentActualYear
            )
            .sort((a, b) => parseInt(b) - parseInt(a));

          const pastYearsApi = fetchedYears
            .filter(
              (year) =>
                !isNaN(parseInt(year)) && parseInt(year) <= currentActualYear
            )
            .sort((a, b) => parseInt(b) - parseInt(a));

          const nonNumericPastYears = fetchedYears.filter(
            (year) => isNaN(parseInt(year)) && year !== "current"
          );

          const sortedYears = [
            ...futureYearsApi,
            "current",
            ...pastYearsApi,
            ...nonNumericPastYears,
          ];
          set({ cachedYears: sortedYears, isFetchingCachedYears: false });
        } catch (error) {
          console.error("Error fetching cached years:", error);
          set({ isFetchingCachedYears: false, cachedYears: ["current"] });
        }
      },

      // Add implementations for new actions
      setPendingNavigation: (url, year) =>
        set({ pendingUrl: url, pendingYear: year || null }),
      clearPendingNavigation: () =>
        set({ pendingUrl: null, pendingYear: null }),

      updateBrowserState: () => {},
    }),
    {
      name: "ryos:internet-explorer",
      version: CURRENT_IE_STORE_VERSION,
      partialize: (state) => ({
        url: state.url,
        year: state.year,
        favorites: state.favorites,
        history: state.history.slice(0, 50),
        timelineSettings: state.timelineSettings,
        language: state.language,
        location: state.location,
      }),
      migrate: (persistedState: unknown, version: number) => {
        // Use Record<string, unknown> to allow safe property access with type checking
        let state = persistedState as Record<string, unknown>;

        if (version < CURRENT_IE_STORE_VERSION) {
          console.log(
            `Migrating Internet Explorer store from version ${version} to ${CURRENT_IE_STORE_VERSION}`
          );
          state = {
            ...getInitialState(),
          };
          console.log("IE Store migration applied, resetting to defaults.");
        }

        const initialStateDefaults = getInitialState();
        const partializedKeys = [
          "url",
          "year",
          "favorites",
          "history",
          "timelineSettings",
          "language",
          "location",
        ];
        const finalState: Partial<InternetExplorerStore> = {};

        for (const key of partializedKeys) {
          const defaultValue =
            initialStateDefaults[
              key as keyof ReturnType<typeof getInitialState>
            ];

          // Explicitly add the property with proper type assertion
          // Use Record<string, unknown> to avoid 'any' but allow dynamic property access
          (finalState as Record<string, unknown>)[key] =
            state?.[key] !== undefined && state?.[key] !== null
              ? state[key]
              : defaultValue;
        }

        finalState.history = Array.isArray(finalState.history)
          ? finalState.history.slice(0, 50)
          : [];
        finalState.favorites = Array.isArray(finalState.favorites)
          ? finalState.favorites
          : DEFAULT_FAVORITES;

        return finalState as InternetExplorerStore;
      },
    }
  )
);

// Utility function to check if a URL should bypass the proxy
export const isDirectPassthrough = (url: string): boolean => {
  try {
    const hostname = new URL(url.startsWith("http") ? url : `https://${url}`)
      .hostname;
    return DIRECT_PASSTHROUGH_DOMAINS.some(
      (domain) => hostname === domain || hostname.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
};
