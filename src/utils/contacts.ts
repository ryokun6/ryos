export type ContactSource = "manual" | "vcard" | "telegram" | "ai";

export interface ContactValue {
  id: string;
  label: string;
  value: string;
}

export interface ContactAddress {
  id: string;
  label: string;
  street: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  formatted: string;
}

export interface Contact {
  id: string;
  displayName: string;
  firstName: string;
  lastName: string;
  nickname: string;
  organization: string;
  title: string;
  notes: string;
  emails: ContactValue[];
  phones: ContactValue[];
  addresses: ContactAddress[];
  urls: ContactValue[];
  birthday: string | null;
  telegramUsername: string;
  telegramUserId: string;
  source: ContactSource;
  createdAt: number;
  updatedAt: number;
}

export interface ContactDraft {
  displayName?: string;
  firstName?: string;
  lastName?: string;
  nickname?: string;
  organization?: string;
  title?: string;
  notes?: string;
  emails?: Array<ContactValue | string>;
  phones?: Array<ContactValue | string>;
  addresses?: Array<ContactAddress | string>;
  urls?: Array<ContactValue | string>;
  birthday?: string | null;
  telegramUsername?: string | null;
  telegramUserId?: string | null;
  source?: ContactSource;
}

export interface ContactImportResult {
  contacts: Contact[];
  warnings: string[];
}

const EMPTY_CONTACT_VALUE_LABEL = "other";
export const DEFAULT_RYO_CONTACT_DRAFT: ContactDraft = {
  displayName: "Ryo Lu",
  firstName: "Ryo",
  lastName: "Lu",
  nickname: "ryo",
  organization: "Cursor",
  emails: ["me@ryo.lu"],
  urls: ["https://ryo.lu", "https://x.com/ryolu_", "https://os.ryo.lu"],
  source: "manual",
};
const CONTACT_SOURCES: readonly ContactSource[] = [
  "manual",
  "vcard",
  "telegram",
  "ai",
];

function normalizedWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function optionalString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalNullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isContactSource(value: unknown): value is ContactSource {
  return typeof value === "string" && CONTACT_SOURCES.includes(value as ContactSource);
}

export function sanitizeTelegramUsername(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  const trimmed = normalizedWhitespace(value)
    .replace(/^@+/, "")
    .replace(/^https?:\/\/t\.me\//i, "")
    .replace(/^https?:\/\/telegram\.me\//i, "")
    .replace(/\/+$/, "");

  return trimmed.toLowerCase();
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(value);
  }

  return result;
}

function buildDisplayName({
  displayName,
  firstName,
  lastName,
  nickname,
  organization,
  emails,
  phones,
  telegramUsername,
}: {
  displayName: string;
  firstName: string;
  lastName: string;
  nickname: string;
  organization: string;
  emails: ContactValue[];
  phones: ContactValue[];
  telegramUsername: string;
}): string {
  if (displayName) return displayName;

  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName) return fullName;
  if (nickname) return nickname;
  if (organization) return organization;
  if (emails[0]?.value) return emails[0].value;
  if (phones[0]?.value) return phones[0].value;
  if (telegramUsername) return `@${telegramUsername}`;
  return "Unnamed Contact";
}

function createValueId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function normalizeContactValue(
  prefix: "email" | "phone" | "url",
  input: ContactValue | string
): ContactValue | null {
  if (typeof input === "string") {
    const value = normalizedWhitespace(input);
    if (!value) {
      return null;
    }
    return {
      id: createValueId(prefix),
      label: EMPTY_CONTACT_VALUE_LABEL,
      value,
    };
  }

  const value = normalizedWhitespace(input.value);
  if (!value) {
    return null;
  }

  return {
    id: input.id || createValueId(prefix),
    label: normalizedWhitespace(input.label || EMPTY_CONTACT_VALUE_LABEL) || EMPTY_CONTACT_VALUE_LABEL,
    value,
  };
}

function normalizeContactAddress(input: ContactAddress | string): ContactAddress | null {
  if (typeof input === "string") {
    const formatted = normalizedWhitespace(input);
    if (!formatted) {
      return null;
    }
    return {
      id: createValueId("address"),
      label: EMPTY_CONTACT_VALUE_LABEL,
      street: "",
      city: "",
      region: "",
      postalCode: "",
      country: "",
      formatted,
    };
  }

  const street = normalizedWhitespace(input.street);
  const city = normalizedWhitespace(input.city);
  const region = normalizedWhitespace(input.region);
  const postalCode = normalizedWhitespace(input.postalCode);
  const country = normalizedWhitespace(input.country);
  const formatted =
    normalizedWhitespace(input.formatted) ||
    [street, city, region, postalCode, country].filter(Boolean).join(", ");

  if (!formatted && !street && !city && !region && !postalCode && !country) {
    return null;
  }

  return {
    id: input.id || createValueId("address"),
    label: normalizedWhitespace(input.label || EMPTY_CONTACT_VALUE_LABEL) || EMPTY_CONTACT_VALUE_LABEL,
    street,
    city,
    region,
    postalCode,
    country,
    formatted,
  };
}

function normalizeContactValueList(
  values: unknown
): Array<ContactValue | string> {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: Array<ContactValue | string> = [];

  for (const value of values) {
    if (typeof value === "string") {
      normalized.push(value);
      continue;
    }

    if (!isRecord(value)) {
      continue;
    }

    normalized.push({
      id: optionalString(value.id),
      label: optionalString(value.label),
      value: optionalString(value.value),
    });
  }

  return normalized;
}

function normalizeContactAddressList(
  values: unknown
): Array<ContactAddress | string> {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized: Array<ContactAddress | string> = [];

  for (const value of values) {
    if (typeof value === "string") {
      normalized.push(value);
      continue;
    }

    if (!isRecord(value)) {
      continue;
    }

    normalized.push({
      id: optionalString(value.id),
      label: optionalString(value.label),
      street: optionalString(value.street),
      city: optionalString(value.city),
      region: optionalString(value.region),
      postalCode: optionalString(value.postalCode),
      country: optionalString(value.country),
      formatted: optionalString(value.formatted),
    });
  }

  return normalized;
}

function dedupeContactValues(values: ContactValue[]): ContactValue[] {
  const seen = new Set<string>();
  const result: ContactValue[] = [];

  for (const value of values) {
    const key = `${value.label.toLowerCase()}::${value.value.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function dedupeContactAddresses(values: ContactAddress[]): ContactAddress[] {
  const seen = new Set<string>();
  const result: ContactAddress[] = [];

  for (const value of values) {
    const key = `${value.label.toLowerCase()}::${value.formatted.toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }

  return result;
}

function normalizeBirthday(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = normalizedWhitespace(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  }

  return null;
}

export function createContactFromDraft(
  draft: ContactDraft = {},
  now: number = Date.now()
): Contact {
  const emails = dedupeContactValues(
    (draft.emails || [])
      .map((value) => normalizeContactValue("email", value))
      .filter((value): value is ContactValue => Boolean(value))
  );
  const phones = dedupeContactValues(
    (draft.phones || [])
      .map((value) => normalizeContactValue("phone", value))
      .filter((value): value is ContactValue => Boolean(value))
  );
  const urls = dedupeContactValues(
    (draft.urls || [])
      .map((value) => normalizeContactValue("url", value))
      .filter((value): value is ContactValue => Boolean(value))
  );
  const addresses = dedupeContactAddresses(
    (draft.addresses || [])
      .map((value) => normalizeContactAddress(value))
      .filter((value): value is ContactAddress => Boolean(value))
  );

  const contact: Contact = {
    id: crypto.randomUUID(),
    displayName: normalizedWhitespace(draft.displayName || ""),
    firstName: normalizedWhitespace(draft.firstName || ""),
    lastName: normalizedWhitespace(draft.lastName || ""),
    nickname: normalizedWhitespace(draft.nickname || ""),
    organization: normalizedWhitespace(draft.organization || ""),
    title: normalizedWhitespace(draft.title || ""),
    notes: normalizedWhitespace(draft.notes || ""),
    emails,
    phones,
    addresses,
    urls,
    birthday: normalizeBirthday(draft.birthday),
    telegramUsername: sanitizeTelegramUsername(draft.telegramUsername),
    telegramUserId: normalizedWhitespace(draft.telegramUserId || ""),
    source: draft.source || "manual",
    createdAt: now,
    updatedAt: now,
  };

  contact.displayName = buildDisplayName(contact);
  return contact;
}

export function createDefaultRyoContact(now: number = Date.now()): Contact {
  return createContactFromDraft(DEFAULT_RYO_CONTACT_DRAFT, now);
}

export function isSerializedContactValue(value: unknown): value is ContactValue {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.value === "string"
  );
}

export function isSerializedContactAddress(value: unknown): value is ContactAddress {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.street === "string" &&
    typeof value.city === "string" &&
    typeof value.region === "string" &&
    typeof value.postalCode === "string" &&
    typeof value.country === "string" &&
    typeof value.formatted === "string"
  );
}

export function isSerializedContact(value: unknown): value is Contact {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.displayName === "string" &&
    typeof value.firstName === "string" &&
    typeof value.lastName === "string" &&
    typeof value.nickname === "string" &&
    typeof value.organization === "string" &&
    typeof value.title === "string" &&
    typeof value.notes === "string" &&
    Array.isArray(value.emails) &&
    value.emails.every(isSerializedContactValue) &&
    Array.isArray(value.phones) &&
    value.phones.every(isSerializedContactValue) &&
    Array.isArray(value.addresses) &&
    value.addresses.every(isSerializedContactAddress) &&
    Array.isArray(value.urls) &&
    value.urls.every(isSerializedContactValue) &&
    (value.birthday === null || typeof value.birthday === "string") &&
    typeof value.telegramUsername === "string" &&
    typeof value.telegramUserId === "string" &&
    isContactSource(value.source) &&
    isFiniteNumber(value.createdAt) &&
    isFiniteNumber(value.updatedAt)
  );
}

export function normalizeContact(value: unknown, fallbackNow: number = Date.now()): Contact | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = normalizedWhitespace(optionalString(value.id));
  if (!id) {
    return null;
  }

  const createdAt = isFiniteNumber(value.createdAt) ? value.createdAt : fallbackNow;
  const updatedAt = isFiniteNumber(value.updatedAt) ? value.updatedAt : createdAt;
  const normalized = createContactFromDraft(
    {
      displayName: optionalString(value.displayName),
      firstName: optionalString(value.firstName),
      lastName: optionalString(value.lastName),
      nickname: optionalString(value.nickname),
      organization: optionalString(value.organization),
      title: optionalString(value.title),
      notes: optionalString(value.notes),
      emails: normalizeContactValueList(value.emails),
      phones: normalizeContactValueList(value.phones),
      addresses: normalizeContactAddressList(value.addresses),
      urls: normalizeContactValueList(value.urls),
      birthday: optionalNullableString(value.birthday),
      telegramUsername: optionalNullableString(value.telegramUsername),
      telegramUserId: optionalNullableString(value.telegramUserId),
      source: isContactSource(value.source) ? value.source : "manual",
    },
    createdAt
  );

  return {
    ...normalized,
    id,
    createdAt,
    updatedAt,
  };
}

export function normalizeContacts(value: unknown): Contact[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeContact(entry))
    .filter((entry): entry is Contact => Boolean(entry));
}

export function updateContactFromDraft(
  existing: Contact,
  draft: ContactDraft,
  now: number = Date.now()
): Contact {
  const updated = createContactFromDraft(
    {
      ...existing,
      ...draft,
      emails: draft.emails ?? existing.emails,
      phones: draft.phones ?? existing.phones,
      addresses: draft.addresses ?? existing.addresses,
      urls: draft.urls ?? existing.urls,
      source: draft.source ?? existing.source,
    },
    existing.createdAt
  );

  return {
    ...updated,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
}

function tokenize(input: string): string[] {
  return normalizedWhitespace(input)
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

export function contactSearchText(contact: Contact): string {
  return [
    contact.displayName,
    contact.firstName,
    contact.lastName,
    contact.nickname,
    contact.organization,
    contact.title,
    contact.notes,
    contact.telegramUsername,
    contact.telegramUserId,
    ...contact.emails.map((item) => item.value),
    ...contact.phones.map((item) => item.value),
    ...contact.urls.map((item) => item.value),
    ...contact.addresses.map((item) => item.formatted),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function contactMatchesQuery(contact: Contact, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = contactSearchText(contact);
  return tokens.every((token) => haystack.includes(token));
}

export function sortContacts(contacts: Contact[]): Contact[] {
  return [...contacts].sort((a, b) =>
    a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" })
  );
}

export function getContactInitials(contact: Contact): string {
  const words = contact.displayName.split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return "?";
  }

  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || "")
    .join("");
}

export function getContactSummary(contact: Contact): string {
  const details = dedupeStrings([
    ...contact.emails.map((item) => item.value),
    ...contact.phones.map((item) => item.value),
    contact.telegramUsername ? `@${contact.telegramUsername}` : "",
    contact.organization,
  ].filter(Boolean));

  return details.slice(0, 3).join(" • ");
}

function contactMergeKey(contact: Contact): string[] {
  return [
    ...contact.emails.map((item) => `email:${item.value.toLowerCase()}`),
    ...contact.phones.map((item) => `phone:${item.value.replace(/\D+/g, "")}`),
    contact.telegramUsername ? `telegram:${contact.telegramUsername}` : "",
    contact.displayName ? `name:${contact.displayName.toLowerCase()}` : "",
  ].filter(Boolean);
}

export function findMatchingContact(existing: Contact[], candidate: Contact): Contact | null {
  const candidateKeys = new Set(contactMergeKey(candidate));
  if (candidateKeys.size === 0) {
    return null;
  }

  return (
    existing.find((contact) =>
      contactMergeKey(contact).some((key) => candidateKeys.has(key))
    ) || null
  );
}

export function seedDefaultContacts(existing: Contact[]): Contact[] {
  const seeded = createDefaultRyoContact();
  if (findMatchingContact(existing, seeded)) {
    return sortContacts(existing);
  }

  return sortContacts([...existing, seeded]);
}

export function mergeContacts(existing: Contact, incoming: Contact): Contact {
  return {
    ...existing,
    displayName: incoming.displayName || existing.displayName,
    firstName: incoming.firstName || existing.firstName,
    lastName: incoming.lastName || existing.lastName,
    nickname: incoming.nickname || existing.nickname,
    organization: incoming.organization || existing.organization,
    title: incoming.title || existing.title,
    notes: [existing.notes, incoming.notes].filter(Boolean).join("\n\n").trim(),
    emails: dedupeContactValues([...existing.emails, ...incoming.emails]),
    phones: dedupeContactValues([...existing.phones, ...incoming.phones]),
    addresses: dedupeContactAddresses([...existing.addresses, ...incoming.addresses]),
    urls: dedupeContactValues([...existing.urls, ...incoming.urls]),
    birthday: incoming.birthday || existing.birthday,
    telegramUsername: incoming.telegramUsername || existing.telegramUsername,
    telegramUserId: incoming.telegramUserId || existing.telegramUserId,
    source: existing.source === "manual" ? existing.source : incoming.source,
    updatedAt: Date.now(),
  };
}

function unescapeVCardValue(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function extractLabel(params: string[]): string {
  for (const param of params) {
    const [key, rawValue] = param.split("=");
    if (rawValue && key.toUpperCase() === "TYPE") {
      const label = rawValue.split(",")[0];
      if (label) return label.toLowerCase();
    }
  }

  return EMPTY_CONTACT_VALUE_LABEL;
}

function parseVCardLine(line: string): {
  name: string;
  params: string[];
  value: string;
} | null {
  const colonIndex = line.indexOf(":");
  if (colonIndex === -1) {
    return null;
  }

  const left = line.slice(0, colonIndex);
  const value = unescapeVCardValue(line.slice(colonIndex + 1));
  const [rawName, ...params] = left.split(";");
  const name = rawName.split(".").pop() || rawName;

  return {
    name: name.toUpperCase(),
    params,
    value,
  };
}

function extractTelegramUsernameFromValue(value: string): string {
  if (/t\.me\//i.test(value) || /telegram\.me\//i.test(value) || value.startsWith("@")) {
    return sanitizeTelegramUsername(value);
  }

  return "";
}

export function parseVCardText(input: string): ContactImportResult {
  const warnings: string[] = [];
  const unfolded = input
    .replace(/\r\n[ \t]/g, "")
    .replace(/\n[ \t]/g, "")
    .replace(/\r/g, "\n");
  const cards = unfolded.match(/BEGIN:VCARD[\s\S]*?END:VCARD/gi) || [];
  const contacts: Contact[] = [];

  for (const rawCard of cards) {
    const draft: ContactDraft = {
      emails: [],
      phones: [],
      addresses: [],
      urls: [],
      source: "vcard",
    };

    const lines = rawCard
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (
        line.toUpperCase() === "BEGIN:VCARD" ||
        line.toUpperCase() === "END:VCARD" ||
        line.toUpperCase().startsWith("VERSION:")
      ) {
        continue;
      }

      const parsed = parseVCardLine(line);
      if (!parsed) {
        continue;
      }

      const { name, params, value } = parsed;
      const label = extractLabel(params);

      switch (name) {
        case "FN":
          draft.displayName = value;
          break;
        case "N": {
          const [lastName = "", firstName = ""] = value.split(";");
          if (!draft.firstName) draft.firstName = firstName;
          if (!draft.lastName) draft.lastName = lastName;
          break;
        }
        case "NICKNAME":
          draft.nickname = value;
          break;
        case "ORG":
          draft.organization = value.split(";").filter(Boolean).join(" ");
          break;
        case "TITLE":
          draft.title = value;
          break;
        case "NOTE":
          draft.notes = [draft.notes, value].filter(Boolean).join("\n");
          break;
        case "EMAIL":
          draft.emails?.push({ id: createValueId("email"), label, value });
          break;
        case "TEL":
          draft.phones?.push({ id: createValueId("phone"), label, value });
          break;
        case "URL":
          draft.urls?.push({ id: createValueId("url"), label, value });
          if (!draft.telegramUsername) {
            draft.telegramUsername = extractTelegramUsernameFromValue(value);
          }
          break;
        case "IMPP":
        case "X-SOCIALPROFILE": {
          const telegramUsername = extractTelegramUsernameFromValue(value);
          if (telegramUsername) {
            draft.telegramUsername = telegramUsername;
          } else {
            draft.urls?.push({ id: createValueId("url"), label, value });
          }
          break;
        }
        case "BDAY":
          draft.birthday = normalizeBirthday(value);
          break;
        case "ADR": {
          const [
            postOfficeBox = "",
            extendedAddress = "",
            street = "",
            city = "",
            region = "",
            postalCode = "",
            country = "",
          ] = value.split(";");
          const fullStreet = [street, extendedAddress, postOfficeBox].filter(Boolean).join(" ");
          draft.addresses?.push({
            id: createValueId("address"),
            label,
            street: fullStreet,
            city,
            region,
            postalCode,
            country,
            formatted: [fullStreet, city, region, postalCode, country]
              .filter(Boolean)
              .join(", "),
          });
          break;
        }
        default:
          break;
      }
    }

    const contact = createContactFromDraft(draft);
    const hasData =
      contact.displayName !== "Unnamed Contact" ||
      contact.emails.length > 0 ||
      contact.phones.length > 0 ||
      contact.addresses.length > 0 ||
      contact.urls.length > 0 ||
      Boolean(contact.organization) ||
      Boolean(contact.telegramUsername);

    if (!hasData) {
      warnings.push("Skipped empty vCard entry.");
      continue;
    }

    contacts.push(contact);
  }

  if (cards.length === 0) {
    warnings.push("No valid vCard entries were found.");
  }

  return { contacts: sortContacts(contacts), warnings };
}
