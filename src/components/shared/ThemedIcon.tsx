import React, { useEffect, useState } from "react";
import { pickIconPath, resolveIconLegacyAware, useIconPath } from "@/utils/icons";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { cn } from "@/lib/utils";

export interface ThemedIconProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  name: string; // file name or relative path within theme folder
  alt?: string;
  themeOverride?: string | null; // manual override theme id
}

const SAFARI_TRANSLATE_FIX = "translateZ(0.00001px)";
const SAFARI_USER_AGENT =
  typeof navigator !== "undefined" ? navigator.userAgent : "";
const SAFARI_DETECTION_REGEX = /safari/i;
const SAFARI_EXCLUDES_REGEX = /chrome|crios|chromium|android|edge|opr|fxios/i;

const isSafariBrowser =
  typeof navigator !== "undefined" &&
  SAFARI_DETECTION_REGEX.test(SAFARI_USER_AGENT) &&
  !SAFARI_EXCLUDES_REGEX.test(SAFARI_USER_AGENT);

const appendTranslateLayer = (value?: string) => {
  if (!value || value.trim().length === 0) {
    return SAFARI_TRANSLATE_FIX;
  }
  if (/\btranslate(?:3d|Z)\(/i.test(value)) {
    return value;
  }
  return `${value} ${SAFARI_TRANSLATE_FIX}`;
};

const ensureWillChangeTransform = (
  value: React.CSSProperties["willChange"]
): React.CSSProperties["willChange"] => {
  if (!value) return "transform";
  const tokens = value
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.includes("transform")) {
    return value;
  }
  tokens.push("transform");
  return tokens.join(", ");
};

const applySafariImageStabilizer = (
  style?: React.CSSProperties
): React.CSSProperties => {
  const nextStyle: React.CSSProperties = { ...(style ?? {}) };
  nextStyle.transform = appendTranslateLayer(
    typeof nextStyle.transform === "string"
      ? nextStyle.transform
      : undefined
  );
  if (!nextStyle.WebkitTransform) {
    nextStyle.WebkitTransform = nextStyle.transform;
  }
  if (!nextStyle.backfaceVisibility) {
    nextStyle.backfaceVisibility = "hidden";
  }
  if (!nextStyle.WebkitBackfaceVisibility) {
    nextStyle.WebkitBackfaceVisibility = "hidden";
  }
  nextStyle.willChange = ensureWillChangeTransform(
    typeof nextStyle.willChange === "string"
      ? nextStyle.willChange
      : undefined
  );
  return nextStyle;
};

export const ThemedIcon: React.FC<ThemedIconProps> = ({
  name,
  alt,
  themeOverride,
  ...imgProps
}) => {
  const { currentTheme } = useThemeFlags();
  const { className, style, onError, ...restImgProps } = imgProps;
  const composedClassName = cn("themed-icon", className);

  const isRemoteName = /^https?:\/\//i.test(name);

  const resolved = isRemoteName
    ? name
    : resolveIconLegacyAware(name, themeOverride ?? currentTheme);

  const isRemoteResolved = /^https?:\/\//i.test(resolved);

  const withoutQuery = resolved.split("?")[0];
  const logical = withoutQuery.startsWith("/icons/")
    ? withoutQuery
        .replace("/icons/default/", "")
        .replace(/^(?:\/icons\/[^/]+\/)/, "")
    : withoutQuery;

  const themedPath = useIconPath(logical, themeOverride ?? currentTheme);
  const activeTheme = themeOverride ?? currentTheme;
  const primarySrc = themedPath || resolved;
  const defaultFallbackSrc = pickIconPath(logical, {
    theme: "default",
    fallbackTheme: "default",
  });
  const [useDefaultFallback, setUseDefaultFallback] = useState(false);

  useEffect(() => {
    setUseDefaultFallback(false);
  }, [primarySrc, defaultFallbackSrc, activeTheme, logical]);

  const src =
    useDefaultFallback && primarySrc !== defaultFallbackSrc
      ? defaultFallbackSrc
      : primarySrc;

  if (isRemoteName) {
    return (
      <img
        src={name}
        alt={alt || name}
        className={composedClassName}
        style={style}
        onError={onError}
        {...restImgProps}
      />
    );
  }

  if (isRemoteResolved) {
    return (
      <img
        src={resolved}
        alt={alt || name}
        className={composedClassName}
        style={style}
        onError={onError}
        {...restImgProps}
      />
    );
  }

  const normalizedSrc = src.split("?")[0];
  const isThemedVariant =
    normalizedSrc.startsWith("/icons/") &&
    !normalizedSrc.startsWith("/icons/default/");
  const finalStyle =
    isSafariBrowser && isThemedVariant
      ? applySafariImageStabilizer(style)
      : style;

  return (
    <img
      src={src}
      data-initial-src={resolved}
      alt={alt || name}
      className={composedClassName}
      style={finalStyle}
      onError={(event) => {
        onError?.(event);
        if (event.defaultPrevented) return;
        if (primarySrc !== defaultFallbackSrc) {
          setUseDefaultFallback(true);
        }
      }}
      {...restImgProps}
    />
  );
};
