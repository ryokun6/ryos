import { useChat, type UIMessage } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  useInternetExplorerStore,
  DEFAULT_TIMELINE,
  LanguageOption,
  LocationOption,
} from "@/stores/useInternetExplorerStore";
import { useAppStore } from "@/stores/useAppStore";
import { checkOfflineAndShowError } from "@/utils/offline";
import i18n from "@/lib/i18n";
import { getApiUrl } from "@/utils/platform";
import { abortableFetch } from "@/utils/abortableFetch";

interface UseAiGenerationProps {
  onLoadingChange?: (isLoading: boolean) => void;
  customTimeline?: { [year: string]: string };
}

interface UseAiGenerationReturn {
  generateFuturisticWebsite: (
    url: string,
    year: string,
    signal?: AbortSignal,
    prefetchedTitle?: string | null,
    currentHtmlContent?: string | null
  ) => Promise<void>;
  aiGeneratedHtml: string | null;
  isAiLoading: boolean;
  isFetchingWebsiteContent: boolean;
  stopGeneration: () => void;
}

// ----------------------
// rAF-based throttle hook
// ----------------------
/**
 * Returns a stable callback that forwards the latest value to the provided
 * handler at most once per animation frame. Useful to throttle state updates
 * triggered by chat streaming so that React re-renders at the display's frame
 * rate instead of for every chunk.
 */
function useRafThrottle<T>(handler: (v: T) => void) {
  const frame = useRef<number | null>(null);
  const lastValue = useRef<T | null>(null);

  // We need the *same* throttled function instance for the component lifetime
  // so wrap it in useCallback with empty deps.
  return useCallback(
    (value: T) => {
      lastValue.current = value;
      if (frame.current !== null) return;

      frame.current = requestAnimationFrame(() => {
        frame.current = null;
        // handler might change between renders – capture the latest via ref
        handler(lastValue.current as T);
      });
    },
    [handler]
  );
}

export function useAiGeneration({
  onLoadingChange,
  customTimeline = {},
}: UseAiGenerationProps = {}): UseAiGenerationReturn {
  const [aiGeneratedHtml, setAiGeneratedHtml] = useState<string | null>(null);
  const [isFetchingWebsiteContent, setIsFetchingWebsiteContent] =
    useState(false);
  const currentGenerationId = useRef<string | null>(null);
  const isGenerationComplete = useRef<boolean>(false);
  const generatingUrlRef = useRef<string | null>(null); // Ref for current URL
  const generatingYearRef = useRef<string | null>(null); // Ref for current Year

  // Get the selected AI model from app store
  const aiModel = useAppStore((state) => state.aiModel);

  // Use the Zustand store for caching and updating the store
  const loadSuccess = useInternetExplorerStore((state) => state.loadSuccess);
  const loadError = useInternetExplorerStore((state) => state.loadError);
  const timelineSettings = useInternetExplorerStore(
    (state) => state.timelineSettings
  );
  // Get language and location from store
  const language = useInternetExplorerStore((state) => state.language);
  const location = useInternetExplorerStore((state) => state.location);

  // Helper function to get language display name
  const getLanguageDisplayName = (lang: LanguageOption): string => {
    const languageMap: Record<LanguageOption, string> = {
      auto: i18n.t("apps.internet-explorer.autodetected"),
      english: i18n.t("apps.internet-explorer.english"),
      chinese: i18n.t("apps.internet-explorer.chineseTraditional"),
      japanese: i18n.t("apps.internet-explorer.japanese"),
      korean: i18n.t("apps.internet-explorer.korean"),
      french: i18n.t("apps.internet-explorer.french"),
      spanish: i18n.t("apps.internet-explorer.spanish"),
      portuguese: i18n.t("apps.internet-explorer.portuguese"),
      german: i18n.t("apps.internet-explorer.german"),
      welsh: i18n.t("apps.internet-explorer.welsh"),
      sanskrit: i18n.t("apps.internet-explorer.sanskrit"),
      latin: i18n.t("apps.internet-explorer.latin"),
      alien: i18n.t("apps.internet-explorer.alienLanguage"),
      ai_language: i18n.t("apps.internet-explorer.aiLanguage"),
      digital_being: i18n.t("apps.internet-explorer.digitalBeingLanguage"),
    };
    return languageMap[lang] || i18n.t("apps.internet-explorer.autodetected");
  };

  // Helper function to get location display name
  const getLocationDisplayName = (loc: LocationOption): string => {
    const locationMap: Record<LocationOption, string> = {
      auto: i18n.t("apps.internet-explorer.autodetected"),
      united_states: i18n.t("apps.internet-explorer.unitedStates"),
      china: i18n.t("apps.internet-explorer.china"),
      japan: i18n.t("apps.internet-explorer.japan"),
      korea: i18n.t("apps.internet-explorer.southKorea"),
      france: i18n.t("apps.internet-explorer.france"),
      spain: i18n.t("apps.internet-explorer.spain"),
      portugal: i18n.t("apps.internet-explorer.portugal"),
      germany: i18n.t("apps.internet-explorer.germany"),
      canada: i18n.t("apps.internet-explorer.canada"),
      uk: i18n.t("apps.internet-explorer.unitedKingdom"),
      india: i18n.t("apps.internet-explorer.india"),
      brazil: i18n.t("apps.internet-explorer.brazil"),
      australia: i18n.t("apps.internet-explorer.australia"),
      russia: i18n.t("apps.internet-explorer.russia"),
    };
    return locationMap[loc] || i18n.t("apps.internet-explorer.autodetected");
  };

  // Handler for when AI stream finishes
  const handleAiFinish = ({ message }: { message: UIMessage }) => {
    // Ensure this finish corresponds to the current generation request
    if (!currentGenerationId.current || isGenerationComplete.current) return;

    // Extract HTML content from the final message (use parts in v5)
    const textContent =
      message.parts
        ?.filter((p) => p.type === "text")
        .map((p) => (p as { type: string; text: string }).text)
        .join("") || "";

    const htmlContent = textContent
      .replace(/^\s*```(?:html)?\s*\n?|\n?\s*```\s*$/g, "")
      .trim();

    // Extract title using regex
    const titleMatch = htmlContent.match(/^<!--\s*TITLE:\s*(.*?)\s*-->/);
    const parsedTitle = titleMatch ? titleMatch[1].trim() : null;

    // Remove the title comment from the HTML content itself
    const cleanHtmlContent = htmlContent.replace(
      /^<!--\s*TITLE:.*?-->\s*\n?/,
      ""
    );

    // Mark generation as complete
    isGenerationComplete.current = true;

    // Get URL and Year from refs instead of parsing user message
    const url = generatingUrlRef.current;
    const year = generatingYearRef.current;

    if (url && year) {
      let fallbackTitle = url;
      try {
        // Use hostname as a better fallback title
        fallbackTitle = new URL(url.startsWith("http") ? url : `https://${url}`)
          .hostname;
      } catch (e) {
        console.warn("Error parsing URL for fallback title:", e);
      }

      const favicon = `https://www.google.com/s2/favicons?domain=${
        new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      }&sz=32`;

      // Update the store with the final HTML, title, and history info
      loadSuccess({
        aiGeneratedHtml: cleanHtmlContent,
        title: parsedTitle || fallbackTitle,
        targetUrl: url, // Use ref value
        targetYear: year, // Use ref value
        favicon: favicon,
        addToHistory: true,
      });

      console.log(`[IE] AI generation complete (onFinish)`);
    } else {
      console.error(
        "[IE] Could not retrieve URL/Year from refs in onFinish handler."
      );
      // Fallback: Update store with HTML but potentially missing title context
      loadSuccess({ aiGeneratedHtml: cleanHtmlContent });
    }

    // Clear the generation ID now that it's processed
    // currentGenerationId.current = null; // Revisit if needed.
  };

  const {
    messages: aiMessages,
    sendMessage: appendAiMessage,
    status,
    setMessages: resetAiMessages,
    stop,
  } = useChat({
    messages: [],
    onFinish: handleAiFinish,
    transport: new DefaultChatTransport({
      api: getApiUrl("/api/ie-generate"),
      body: {
        model: aiModel, // Pass the selected model to the API
      },
    }),
  });

  const isAiLoading = status === "streaming" || status === "submitted";

  // Helper to fetch existing website content (readability text via jina.ai)
  const fetchExistingWebsiteContent = async (
    targetUrl: string,
    signal?: AbortSignal
  ): Promise<string | null> => {
    try {
      setIsFetchingWebsiteContent(true);

      // Ensure we always have a protocol for encoding
      const normalized = targetUrl.startsWith("http")
        ? targetUrl
        : `https://${targetUrl}`;
      // jina.ai provides readable text extraction with permissive CORS
      // Format: https://r.jina.ai/http://example.com/path
      const jinaEndpoint = `https://r.jina.ai/http://${normalized.replace(
        /^https?:\/\//,
        ""
      )}`;

      const res = await abortableFetch(jinaEndpoint, {
        signal,
        timeout: 10000,
        retry: { maxAttempts: 1, initialDelayMs: 250 },
      });
      const text = await res.text();
      // Return a trimmed version to avoid blowing up the prompt size (max 4k chars)
      return text.slice(0, 4000);
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        console.log("Fetch operation was aborted");
        return null;
      }
      console.warn("Failed to fetch existing website content:", err);
      return null;
    } finally {
      setIsFetchingWebsiteContent(false);
    }
  };

  // Function to generate futuristic website content using AI
  const generateFuturisticWebsite = async (
    url: string,
    year: string,
    signal?: AbortSignal,
    prefetchedTitle?: string | null,
    currentHtmlContent?: string | null
  ) => {
    // Check if offline and show error
    if (checkOfflineAndShowError("AI website generation requires an internet connection")) {
      return;
    }

    // Generate a unique ID for this generation request
    const generationId = `${url}-${year}-${Date.now()}`;
    currentGenerationId.current = generationId;
    isGenerationComplete.current = false;

    // Format URL properly *before* using it for cache check or storing in ref
    const normalizedTargetUrl = url.startsWith("http") ? url : `https://${url}`;

    // Store the intended URL and Year in refs *before* potentially returning early from cache or making AI call
    generatingUrlRef.current = normalizedTargetUrl;
    generatingYearRef.current = year;

    // Removed remote cache fetch to avoid duplicate API calls; cache handled server-side during streaming

    // Clear any existing AI-generated content
    setAiGeneratedHtml(null);

    // Reset previous AI messages to start a fresh conversation
    resetAiMessages([]);

    // Check if the operation was aborted before proceeding
    if (signal?.aborted) {
      return;
    }

    // Extract domain name for better prompt (use normalized URL)
    let domainName;
    try {
      domainName = new URL(normalizedTargetUrl).hostname;
    } catch (error) {
      console.error(
        `[IE] Error parsing URL for prompt: ${normalizedTargetUrl}`,
        error
      );
      const errorMessage =
        "Invalid URL format. Please enter a valid website address.";
      loadError(errorMessage);
      return;
    }

    // Attempt to fetch existing website content ONLY if currentHtmlContent is not provided
    let existingContent = currentHtmlContent; // Use provided content if available
    if (!existingContent) {
      try {
        existingContent = await fetchExistingWebsiteContent(
          normalizedTargetUrl,
          signal
        );
      } catch (error) {
        console.warn(
          `[IE] Error fetching website content, continuing without it:`,
          error
        );
        // Non-fatal, continue without content
      }
    }

    // Check if the operation was aborted after fetching content
    if (signal?.aborted || currentGenerationId.current !== generationId) {
      return;
    }

    // Get timeline context from store
    const getTimelineContext = (year: string): string => {
      // Check for custom timeline first
      if (customTimeline[year]) {
        return customTimeline[year];
      }

      // Fall back to store timeline settings
      if (timelineSettings[year]) {
        return timelineSettings[year];
      }

      // Fall back to default timeline
      return (
        DEFAULT_TIMELINE[year] ||
        "2020s: Current era. AI assistants. Smart devices. Electric vehicles. Renewable energy. Space tourism. Digital transformation. Remote work. Virtual reality. Genetic medicine."
      );
    };

    const timelineContext = getTimelineContext(year);

    // Add language and location context
    const getLanguageInstructions = (lang: LanguageOption): string => {
      switch (lang) {
        case "latin":
          return "The content should be primarily in Latin. Use classical Latin vocabulary and grammar structures typical of ancient Rome. Include appropriate Roman cultural references.";
        case "sanskrit":
          return "The content should be primarily in Sanskrit. Use Devanagari script when possible, or romanized Sanskrit. Include appropriate ancient Indian cultural references.";
        case "alien":
          return "The content should appear to be in an alien language. Create a believable alien writing system with internal consistency. Include some untranslated alien text alongside a partial 'translation'. The UI should have an alien aesthetic.";
        case "ai_language":
          return "The content should be in a language created by artificial intelligence. Mix natural language with code-like syntax, mathematical symbols, and structured data patterns. Include machine learning terminology and computational concepts.";
        case "digital_being":
          return "The content should be in a language used by digital entities. Use a combination of binary patterns, hexadecimal codes, and network protocol references. The language should feel like it was designed for machine-to-machine communication but adapted for human interface.";
        default:
          return `The content should be primarily in ${getLanguageDisplayName(
            lang
          )}.`;
      }
    };

    const languageContext =
      language !== "auto"
        ? `\n- Primary Language: ${getLanguageDisplayName(
            language
          )}. ${getLanguageInstructions(language)}`
        : "";

    const locationContext =
      location !== "auto"
        ? `\n- Location Context: ${getLocationDisplayName(
            location
          )}. The content should be culturally relevant to ${getLocationDisplayName(
            location
          )}.`
        : "";

    // Create a more inspirational prompt for AI‑generated future designs
    const prompt = `CONTEXT
Below are details about the current website and the task:

- Domain: ${domainName}
- URL: ${normalizedTargetUrl}${languageContext}${locationContext}
${
  currentHtmlContent
    ? `- The HTML content of the *previous* AI-generated page view for year ${year} is provided below. This is a navigation source - the user clicked a link in this page to navigate to the current URL:\n'''\n${currentHtmlContent.slice(
        0,
        4000
      )}\n'''\n`
    : existingContent
    ? `- A snapshot of the *live* website's readable content (fetched via Jina, truncated to 4,000 characters) is provided below:\n'''\n${existingContent}\n'''\n`
    : "- No current website content available for context."
}
${prefetchedTitle ? `- Known Title: ${prefetchedTitle}\n` : ""}

It is the year ${year}. Here is the timeline of human civilization leading up to this point:

${Object.entries({
  ...DEFAULT_TIMELINE,
  ...timelineSettings,
  ...customTimeline,
})
  .filter(([y]) => parseInt(y) <= parseInt(year))
  .sort(([a], [b]) => parseInt(a) - parseInt(b))
  .map(([y, desc]) => `${y}: ${desc}`)
  .join("\n")}

${timelineContext}
${
  currentHtmlContent
    ? `

IMPORTANT NAVIGATION CONTEXT:
- The user was viewing a previously generated page and clicked a link to navigate to "${normalizedTargetUrl}"
- Your task is to generate the destination page that would be shown after clicking this link
- Maintain visual consistency with the source page (similar design language, colors, UI elements)
- The new page should feel like part of the same website/experience as the source page
- Preserve any context or theme from the source page that would be relevant`
    : ""
}`;

    try {
      // Final check if operation was aborted before sending to AI
      if (signal?.aborted || currentGenerationId.current !== generationId) {
        return;
      }

      // Send message to AI - the response will be handled by the useEffect
      await appendAiMessage(
        { text: prompt },
        {
          body: {
            url: normalizedTargetUrl,
            year,
            language, // Include language in the API call
            location, // Include location in the API call
          },
        }
      );
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        console.log("AI generation was aborted");
        return;
      }
      console.error("Failed to generate futuristic website:", error);
      loadError(
        `Failed to generate website preview for ${normalizedTargetUrl} in ${year}. ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  // Throttled setter to avoid excessive re-renders while we stream chunks
  const throttledSetHtml = useRafThrottle(setAiGeneratedHtml);

  // Effect to watch for AI responses and update the *streaming* UI preview
  useEffect(() => {
    // Only update the preview; final state is handled by onFinish
    if (aiMessages.length > 1) {
      const lastMessage = aiMessages[aiMessages.length - 1];
      if (lastMessage.role === "assistant") {
        const textContent =
          lastMessage.parts
            ?.filter((p) => p.type === "text")
            .map((p) => (p as { type: string; text: string }).text)
            .join("") || "";

        const htmlContent = textContent
          .replace(/^\s*```(?:html)?\s*\n?|\n?\s*```\s*$/g, "")
          .trim();
        // Remove title comment for preview
        const cleanHtmlContent = htmlContent.replace(
          /^<!--\s*TITLE:.*?-->\s*\n?/,
          ""
        );
        // Throttled state update for streaming display only
        throttledSetHtml(cleanHtmlContent);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiMessages]); // Only depends on messages for streaming updates

  // Effect to notify parent of loading state changes
  useEffect(() => {
    onLoadingChange?.(isAiLoading);
  }, [isAiLoading, onLoadingChange]);

  return {
    generateFuturisticWebsite,
    aiGeneratedHtml,
    isAiLoading,
    isFetchingWebsiteContent,
    stopGeneration: () => {
      stop();
      // Reset current generation ID to prevent further processing
      currentGenerationId.current = null;
    },
  };
}
