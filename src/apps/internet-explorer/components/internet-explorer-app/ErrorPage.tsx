import type { ReactNode } from "react";

export interface ErrorPageProps {
  title: string;
  primaryMessage: string;
  secondaryMessage?: string;
  suggestions: (string | ReactNode)[];
  details?: string;
  footerText: string;
  showGoBackButtonInSuggestions?: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
  onGoBack: () => void;
  onRetry?: () => void;
}

export function ErrorPage({
  title,
  primaryMessage,
  secondaryMessage,
  suggestions,
  details,
  footerText,
  showGoBackButtonInSuggestions = true,
  t,
  onGoBack,
  onRetry,
}: ErrorPageProps) {
  return (
    <div className="p-6 font-geneva-12 text-sm h-full overflow-y-auto">
      <h1 className="text-lg mb-4 font-normal flex items-center">{title}</h1>

      <p className="mb-3">{primaryMessage}</p>
      {secondaryMessage && <p className="mb-3">{secondaryMessage}</p>}

      <div className="h-px bg-neutral-300 my-5"></div>

      <p className="mb-3">
        {t("apps.internet-explorer.pleaseTryTheFollowing")}
      </p>

      <ul className="list-disc pl-6 mb-5 space-y-2">
        {(() => {
          const suggestionKeyCounts = new Map<string, number>();
          return suggestions.map((suggestion) => {
            const baseKey =
              typeof suggestion === "string"
                ? `text-${suggestion}`
                : `node-${String(suggestion)}`;
            const count = (suggestionKeyCounts.get(baseKey) ?? 0) + 1;
            suggestionKeyCounts.set(baseKey, count);
            const suggestionKey = `${baseKey}-${count}`;
            return (
              <li key={suggestionKey}>
                {typeof suggestion === "string" &&
                suggestion.includes("{hostname}")
                  ? suggestion.split("{hostname}").map((part, i) =>
                      i === 0 ? (
                        part
                      ) : (
                        <>
                          <a
                            href={`https://${details}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-red-600 underline"
                          >
                            {details}
                          </a>
                          {part}
                        </>
                      )
                    )
                  : typeof suggestion === "string" &&
                      suggestion.includes("{backButton}") &&
                      showGoBackButtonInSuggestions
                    ? suggestion.split("{backButton}").map((part, i) =>
                        i === 0 ? (
                          part
                        ) : (
                          <>
                            <a
                              href="#"
                              role="button"
                              onClick={(e) => {
                                e.preventDefault();
                                onGoBack();
                              }}
                              className="text-red-600 underline"
                            >
                              {t("apps.internet-explorer.back")}
                            </a>
                            {part}
                          </>
                        )
                      )
                    : typeof suggestion === "string" &&
                        suggestion.includes("{refreshButton}") &&
                        onRetry
                      ? suggestion.split("{refreshButton}").map((part, i) =>
                          i === 0 ? (
                            part
                          ) : (
                            <>
                              <a
                                href="#"
                                role="button"
                                onClick={(e) => {
                                  e.preventDefault();
                                  onRetry();
                                }}
                                className="text-red-600 underline"
                              >
                                {t("apps.internet-explorer.refresh")}
                              </a>
                              {part}
                            </>
                          )
                        )
                      : suggestion}
              </li>
            );
          });
        })()}
      </ul>

      {details && !footerText.includes("HTTP") && (
        <div className="p-3 bg-neutral-100 border border-neutral-300 rounded mb-5">
          {details}
        </div>
      )}

      <div className="mt-10 text-neutral-700 whitespace-pre-wrap">
        {footerText}
      </div>
    </div>
  );
}
