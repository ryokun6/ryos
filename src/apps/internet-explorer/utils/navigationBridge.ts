export type IeNavigationMessage =
  | { type: "iframeNavigation"; url: string }
  | { type: "aiHtmlNavigation"; url: string }
  | { type: "goBack" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseIeNavigationMessage(
  value: unknown
): IeNavigationMessage | null {
  if (!isRecord(value)) return null;
  const keys = Object.keys(value);
  if (value.type === "goBack") {
    return keys.length === 1 ? { type: "goBack" } : null;
  }
  if (
    (value.type === "iframeNavigation" ||
      value.type === "aiHtmlNavigation") &&
    keys.every((key) => key === "type" || key === "url" || key === "source") &&
    (value.source === undefined || typeof value.source === "string") &&
    typeof value.url === "string" &&
    value.url.length > 0 &&
    value.url.length <= 8192
  ) {
    return { type: value.type, url: value.url };
  }
  return null;
}

interface IsTrustedIeNavigationEventOptions {
  event: MessageEvent;
  activeProxyWindow: Window | null;
  proxyPreviewWindows?: ReadonlySet<Window>;
  aiPreviewWindows: ReadonlySet<Window>;
}

export function getTrustedIeNavigationMessage({
  event,
  activeProxyWindow,
  proxyPreviewWindows,
  aiPreviewWindows,
}: IsTrustedIeNavigationEventOptions): IeNavigationMessage | null {
  const message = parseIeNavigationMessage(event.data);
  if (!message || !event.source) return null;

  if (message.type === "aiHtmlNavigation") {
    return aiPreviewWindows.has(event.source as Window) ? message : null;
  }

  return event.source === activeProxyWindow ||
    proxyPreviewWindows?.has(event.source as Window)
    ? message
    : null;
}
