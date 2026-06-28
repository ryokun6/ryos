export type IeDomainCompatibilityMode =
  | "auto-proxy"
  | "direct-passthrough"
  | "blocked";

export interface IeDomainCompatibilityRule {
  domain: string;
  mode: IeDomainCompatibilityMode;
  notes: string;
  inertScripts?: boolean;
}

export const IE_DOMAIN_COMPATIBILITY_RULES: IeDomainCompatibilityRule[] = [
  { domain: "wikipedia.org", mode: "auto-proxy", notes: "Embeds and subresources are more reliable through the proxy." },
  { domain: "wikimedia.org", mode: "auto-proxy", notes: "Static assets need proxy-aware URL handling." },
  { domain: "wikipedia.com", mode: "auto-proxy", notes: "Redirects to Wikipedia projects." },
  { domain: "cursor.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "github.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "stackoverflow.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "stackexchange.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "reddit.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "twitter.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "x.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "medium.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "nytimes.com", mode: "auto-proxy", inertScripts: true, notes: "Modern live scripts can freeze the sandboxed IE iframe." },
  { domain: "bbc.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "bbc.co.uk", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "theguardian.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "cnn.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "washingtonpost.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "linkedin.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "instagram.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "facebook.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "amazon.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "youtube.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "twitch.tv", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "netflix.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "docs.google.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "drive.google.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "mail.google.com", mode: "auto-proxy", notes: "Uses restrictive embedding headers." },
  { domain: "os.ryo.lu", mode: "direct-passthrough", notes: "First-party app shell is safest as a direct iframe." },
  { domain: "hcsimulator.com", mode: "direct-passthrough", notes: "Works better without HTML rewriting." },
  { domain: "os.rocorgi.wang", mode: "direct-passthrough", notes: "Works better without HTML rewriting." },
  { domain: "iso-city.com", mode: "direct-passthrough", notes: "Works better without HTML rewriting." },
  { domain: "shaoruu.io", mode: "direct-passthrough", notes: "Works better without HTML rewriting." },
];

export const AUTO_PROXY_DOMAINS = IE_DOMAIN_COMPATIBILITY_RULES
  .filter((rule) => rule.mode === "auto-proxy")
  .map((rule) => rule.domain);

export const DIRECT_PASSTHROUGH_DOMAINS = IE_DOMAIN_COMPATIBILITY_RULES
  .filter((rule) => rule.mode === "direct-passthrough")
  .map((rule) => rule.domain);

export function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const normalizedHostname = hostname.toLowerCase();
  const normalizedDomain = domain.toLowerCase();
  return (
    normalizedHostname === normalizedDomain ||
    normalizedHostname.endsWith(`.${normalizedDomain}`)
  );
}

export function getIeDomainCompatibility(
  url: string
): IeDomainCompatibilityRule | null {
  try {
    const hostname = new URL(url.startsWith("http") ? url : `https://${url}`)
      .hostname
      .toLowerCase();
    return (
      IE_DOMAIN_COMPATIBILITY_RULES.find((rule) =>
        hostnameMatchesDomain(hostname, rule.domain)
      ) ?? null
    );
  } catch {
    return null;
  }
}

export function shouldAutoProxyUrl(url: string): boolean {
  return getIeDomainCompatibility(url)?.mode === "auto-proxy";
}

export function shouldDirectPassthroughUrl(url: string): boolean {
  return getIeDomainCompatibility(url)?.mode === "direct-passthrough";
}

export function shouldUseInertProxyScripts(url: string): boolean {
  return getIeDomainCompatibility(url)?.inertScripts === true;
}
