import i18n from "@/lib/i18n";
import { appNames } from "@/config/appRegistryData";
import { getTranslatedAppName, type AppId } from "@/utils/i18n";
import { formatToolName } from "@/lib/toolInvocationDisplay";
import { userColors } from "./constants";

export const extractImageParts = (message: {
  parts?: Array<{ type: string; url?: string; mediaType?: string }>;
}): string[] => {
  if (!message.parts) return [];

  return message.parts.reduce<string[]>((acc, part) => {
    if (part.type === "file" && part.mediaType?.startsWith("image/") && part.url) {
      acc.push(part.url);
    }
    return acc;
  }, []);
};

export const getUserColorClass = (username?: string): string => {
  if (!username) {
    return "bg-neutral-100 text-black";
  }
  const hash = username
    .split("")
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return userColors[hash % userColors.length];
};

export const isEmojiOnly = (text: string): boolean => {
  const emojiRegex = /^[\p{Emoji_Presentation}\p{Extended_Pictographic}\s]+$/u;
  return emojiRegex.test(text);
};

export const isUrlOnly = (text: string): boolean => {
  const trimmedText = text.trim();
  const urlRegex = /^https?:\/\/[^\s]+$/;
  return urlRegex.test(trimmedText);
};

export const isUrgentMessage = (content: string) => content.startsWith("!!!!");

export const getErrorMessage = (error: Error): string => {
  if (!error.message) return "An error occurred";

  const jsonMatch = error.message.match(/\{.*\}/);

  if (jsonMatch) {
    try {
      const errorData = JSON.parse(jsonMatch[0]);

      if (errorData.error === "rate_limit_exceeded") {
        if (errorData.isAuthenticated) {
          return i18n.t("apps.chats.status.dailyLimitReached");
        } else {
          return i18n.t("apps.chats.status.loginToContinue");
        }
      }

      if (errorData.error === "authentication_failed") {
        return i18n.t("apps.chats.status.sessionExpired");
      }

      if (typeof errorData.error === "string") {
        return errorData.error;
      }

      if (typeof errorData.message === "string") {
        return errorData.message;
      }
    } catch {
      // If JSON parsing fails, continue to fallback
    }
  }

  if (error.message.startsWith("Error: ")) {
    return error.message.slice(7);
  }

  return error.message;
};

export const getAppName = (id?: string): string => {
  if (!id) return "app";
  try {
    return getTranslatedAppName(id as AppId);
  } catch {
    return appNames[id as AppId] || formatToolName(id);
  }
};

export const getMessageText = (message: {
  parts?: Array<{ type: string; text?: string }>;
}): string => {
  if (!message.parts) return "";

  return message.parts.reduce<string[]>((acc, part) => {
    if (part.type === "text") {
      acc.push((part as { type: string; text?: string }).text || "");
    }
    return acc;
  }, []).join("");
};

export const getMessageKey = (message: {
  id?: string;
  role: string;
  parts?: Array<{ type: string; text?: string }>;
}): string => {
  const messageText = getMessageText(message);
  return message.id === "1" || message.id === "proactive-1"
    ? "greeting"
    : message.id || `${message.role}-${messageText.substring(0, 10)}`;
};
