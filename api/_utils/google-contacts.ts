import type { RedisLike } from "./redis.js";
import {
  GoogleApiError,
  getGoogleApiUrls,
  getValidGoogleAccessToken,
  saveLinkedGoogleAccount,
} from "./google-oauth.js";
import {
  createContactFromDraft,
  type Contact,
  type ContactAddress,
  type ContactValue,
} from "../../src/utils/contacts.js";
import {
  GOOGLE_CONTACTS_SCOPE,
  type GoogleContactsDeletionInput,
  type GoogleContactsPushedItem,
  type GoogleContactsSyncResponse,
} from "../../src/shared/contracts/google.js";

const PERSON_FIELDS =
  "names,nicknames,emailAddresses,phoneNumbers,addresses,organizations,urls,biographies,birthdays,photos,metadata,clientData";
const UPDATE_PERSON_FIELDS =
  "names,nicknames,emailAddresses,phoneNumbers,addresses,organizations,urls,biographies,birthdays,clientData";
const MAX_CONTACTS_PAGES = 25;
const PAGE_SIZE = 200;
const MAX_MUTATIONS_PER_SYNC = 200;
const UPSTREAM_TIMEOUT_MS = 15_000;

interface GoogleFieldMetadata {
  primary?: boolean;
  source?: {
    type?: string;
    id?: string;
  };
}

export interface GooglePerson {
  resourceName?: string;
  etag?: string;
  metadata?: {
    deleted?: boolean;
    sources?: Array<{
      type?: string;
      id?: string;
      etag?: string;
      updateTime?: string;
    }>;
  };
  names?: Array<{
    metadata?: GoogleFieldMetadata;
    displayName?: string;
    givenName?: string;
    familyName?: string;
    unstructuredName?: string;
  }>;
  nicknames?: Array<{
    metadata?: GoogleFieldMetadata;
    value?: string;
  }>;
  organizations?: Array<{
    metadata?: GoogleFieldMetadata;
    name?: string;
    title?: string;
  }>;
  biographies?: Array<{
    metadata?: GoogleFieldMetadata;
    value?: string;
  }>;
  emailAddresses?: Array<{
    metadata?: GoogleFieldMetadata;
    value?: string;
    type?: string;
  }>;
  phoneNumbers?: Array<{
    metadata?: GoogleFieldMetadata;
    value?: string;
    type?: string;
  }>;
  urls?: Array<{
    metadata?: GoogleFieldMetadata;
    value?: string;
    type?: string;
  }>;
  addresses?: Array<{
    metadata?: GoogleFieldMetadata;
    type?: string;
    formattedValue?: string;
    streetAddress?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  }>;
  birthdays?: Array<{
    metadata?: GoogleFieldMetadata;
    date?: {
      year?: number;
      month?: number;
      day?: number;
    };
  }>;
  photos?: Array<{
    metadata?: GoogleFieldMetadata;
    url?: string;
    default?: boolean;
  }>;
  clientData?: Array<{
    key?: string;
    value?: string;
  }>;
}

interface GoogleConnectionsListResponse {
  connections?: GooglePerson[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

export function buildDeterministicGoogleContactId(
  resourceName: string
): string {
  const stripped = resourceName.trim().replace(/^people\//, "");
  if (/^[a-zA-Z0-9_-]{1,160}$/.test(stripped)) {
    return `gppl_${stripped}`;
  }
  const encoded = Buffer.from(stripped, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "")
    .slice(0, 120);
  return `gppl_${encoded}`;
}

function pickPrimaryOrFirst<T extends { metadata?: GoogleFieldMetadata }>(
  items: T[] | undefined
): T | undefined {
  if (!Array.isArray(items) || items.length === 0) return undefined;
  return items.find((item) => item.metadata?.primary) || items[0];
}

function buildStableValueId(
  kind: string,
  index: number,
  label: string,
  value: string
): string {
  const slug = `${label}:${value}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return `${kind}-g-${index}-${slug || "item"}`;
}

function parseGoogleBirthday(
  birthdays: GooglePerson["birthdays"]
): string | null {
  const entry = pickPrimaryOrFirst(birthdays);
  const d = entry?.date;
  if (!d || !d.month || !d.day) return null;
  const year = d.year && d.year >= 1000 ? d.year : 1900;
  const mm = String(d.month).padStart(2, "0");
  const dd = String(d.day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseGoogleUpdateTime(person: GooglePerson): number {
  const sources = person.metadata?.sources || [];
  const contactSource =
    sources.find((s) => s.type === "CONTACT" && s.updateTime) ||
    sources.find((s) => Boolean(s.updateTime));
  if (contactSource?.updateTime) {
    const parsed = Date.parse(contactSource.updateTime);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export function mapGooglePersonToRyosContact(
  person: GooglePerson,
  preferredLocalId?: string
): Contact | null {
  const resourceName = person.resourceName?.trim();
  if (!resourceName || person.metadata?.deleted) {
    return null;
  }

  const clientRyosId = person.clientData
    ?.find((item) => item.key === "ryosContactId")
    ?.value?.trim();
  const id =
    preferredLocalId ||
    clientRyosId ||
    buildDeterministicGoogleContactId(resourceName);

  const primaryName = pickPrimaryOrFirst(person.names);
  const primaryNickname = pickPrimaryOrFirst(person.nicknames);
  const primaryOrg = pickPrimaryOrFirst(person.organizations);
  const primaryBio = pickPrimaryOrFirst(person.biographies);
  const nonDefaultPhoto = person.photos?.find(
    (photo) => !photo.default && typeof photo.url === "string" && photo.url.trim()
  );

  const emails: ContactValue[] = (person.emailAddresses || [])
    .filter((e) => typeof e.value === "string" && e.value.trim())
    .map((e, idx) => {
      const label = (e.type || "other").trim().toLowerCase() || "other";
      const value = e.value!.trim();
      return {
        id: buildStableValueId("email", idx, label, value),
        label,
        value,
      };
    });

  const phones: ContactValue[] = (person.phoneNumbers || [])
    .filter((p) => typeof p.value === "string" && p.value.trim())
    .map((p, idx) => {
      const label = (p.type || "other").trim().toLowerCase() || "other";
      const value = p.value!.trim();
      return {
        id: buildStableValueId("phone", idx, label, value),
        label,
        value,
      };
    });

  const urls: ContactValue[] = (person.urls || [])
    .filter((u) => typeof u.value === "string" && u.value.trim())
    .map((u, idx) => {
      const label = (u.type || "other").trim().toLowerCase() || "other";
      const value = u.value!.trim();
      return {
        id: buildStableValueId("url", idx, label, value),
        label,
        value,
      };
    });

  const addresses: ContactAddress[] = (person.addresses || [])
    .map((a, idx) => {
      const label = (a.type || "other").trim().toLowerCase() || "other";
      const street = (a.streetAddress || "").trim();
      const city = (a.city || "").trim();
      const region = (a.region || "").trim();
      const postalCode = (a.postalCode || "").trim();
      const country = (a.country || "").trim();
      const formatted =
        (a.formattedValue || "").trim() ||
        [street, city, region, postalCode, country].filter(Boolean).join(", ");
      if (!formatted && !street && !city && !region && !postalCode && !country) {
        return null;
      }
      return {
        id: buildStableValueId("address", idx, label, formatted),
        label,
        street,
        city,
        region,
        postalCode,
        country,
        formatted,
      };
    })
    .filter((a): a is ContactAddress => a !== null);

  const updatedAt = parseGoogleUpdateTime(person);
  const contact = createContactFromDraft(
    {
      displayName:
        primaryName?.displayName || primaryName?.unstructuredName || "",
      firstName: primaryName?.givenName || "",
      lastName: primaryName?.familyName || "",
      nickname: primaryNickname?.value || "",
      organization: primaryOrg?.name || "",
      title: primaryOrg?.title || "",
      notes: primaryBio?.value || "",
      emails,
      phones,
      urls,
      addresses,
      birthday: parseGoogleBirthday(person.birthdays),
      picture: nonDefaultPhoto?.url ?? null,
      source: "google",
      googleResourceName: resourceName,
      googleEtag: person.etag || undefined,
      googleSyncedUpdatedAt: updatedAt,
    },
    updatedAt
  );

  return {
    ...contact,
    id,
    createdAt: updatedAt,
    updatedAt,
    googleSyncedUpdatedAt: updatedAt,
  };
}

export function buildGooglePersonPayload(
  contact: Contact,
  etag?: string
): Record<string, unknown> {
  const birthdayMatch = contact.birthday
    ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(contact.birthday)
    : null;

  return {
    ...(etag ? { etag } : {}),
    names: [
      {
        givenName: contact.firstName || "",
        familyName: contact.lastName || "",
        unstructuredName: contact.displayName || "",
      },
    ],
    nicknames: contact.nickname ? [{ value: contact.nickname }] : [],
    organizations:
      contact.organization || contact.title
        ? [
            {
              name: contact.organization || "",
              title: contact.title || "",
            },
          ]
        : [],
    biographies: contact.notes
      ? [{ value: contact.notes, contentType: "TEXT_PLAIN" }]
      : [],
    emailAddresses: contact.emails.map((email) => ({
      value: email.value,
      ...(email.label && email.label !== "other" ? { type: email.label } : {}),
    })),
    phoneNumbers: contact.phones.map((phone) => ({
      value: phone.value,
      ...(phone.label && phone.label !== "other" ? { type: phone.label } : {}),
    })),
    urls: contact.urls.map((url) => ({
      value: url.value,
      ...(url.label && url.label !== "other" ? { type: url.label } : {}),
    })),
    addresses: contact.addresses.map((address) => ({
      streetAddress: address.street || "",
      city: address.city || "",
      region: address.region || "",
      postalCode: address.postalCode || "",
      country: address.country || "",
      formattedValue: address.formatted || "",
      ...(address.label && address.label !== "other"
        ? { type: address.label }
        : {}),
    })),
    birthdays: birthdayMatch
      ? [
          {
            date: {
              year: Number(birthdayMatch[1]),
              month: Number(birthdayMatch[2]),
              day: Number(birthdayMatch[3]),
            },
          },
        ]
      : [],
    clientData: [{ key: "ryosContactId", value: contact.id }],
  };
}

async function googlePeopleFetch(
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const { peopleBaseUrl } = getGoogleApiUrls();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    return await fetch(`${peopleBaseUrl}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers || {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

function encodeResourcePath(resourceName: string): string {
  return resourceName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

async function fetchPersonEtag(
  resourceName: string,
  accessToken: string
): Promise<string | null> {
  const res = await googlePeopleFetch(
    `/${encodeResourcePath(resourceName)}?personFields=metadata`,
    accessToken
  );
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as GooglePerson | null;
  return data?.etag || null;
}

async function listGoogleContactChanges(params: {
  accessToken: string;
  syncToken: string | null;
}): Promise<{
  fullSync: boolean;
  upserts: GooglePerson[];
  deletedResourceNames: string[];
  nextSyncToken: string | null;
}> {
  const runList = async (
    tokenToUse: string | null
  ): Promise<
    | { ok: true; items: GooglePerson[]; nextSyncToken: string | null }
    | { ok: false; expired: true }
  > => {
    const allItems: GooglePerson[] = [];
    let pageToken: string | undefined;
    let nextSyncToken: string | null = null;

    for (let page = 0; page < MAX_CONTACTS_PAGES; page += 1) {
      const qs = new URLSearchParams();
      qs.set("personFields", PERSON_FIELDS);
      qs.set("pageSize", String(PAGE_SIZE));
      qs.set("requestSyncToken", "true");
      if (tokenToUse) {
        qs.set("syncToken", tokenToUse);
      }
      if (pageToken) {
        qs.set("pageToken", pageToken);
      }

      const res = await googlePeopleFetch(
        `/people/me/connections?${qs.toString()}`,
        params.accessToken
      );

      // Google People sync tokens expire after ~7 days and return 410 or 400 EXPIRED_SYNC_TOKEN.
      if ((res.status === 410 || res.status === 400) && tokenToUse) {
        return { ok: false, expired: true };
      }
      if (res.status === 401 || res.status === 403) {
        throw new GoogleApiError(
          res.status,
          res.status === 401 ? "reauth_required" : "missing_scope",
          "Google Contacts authorization failed."
        );
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new GoogleApiError(
          502,
          "contacts_pull_failed",
          `Google Contacts list failed (${res.status}): ${errText.slice(0, 160)}`
        );
      }

      const data = (await res.json()) as GoogleConnectionsListResponse;
      if (Array.isArray(data.connections)) {
        allItems.push(...data.connections);
      }
      if (data.nextSyncToken) {
        nextSyncToken = data.nextSyncToken;
      }
      if (!data.nextPageToken) {
        break;
      }
      pageToken = data.nextPageToken;
    }

    return { ok: true, items: allItems, nextSyncToken };
  };

  let fullSync = !params.syncToken;
  let result = await runList(params.syncToken);
  if (!result.ok && result.expired) {
    fullSync = true;
    result = await runList(null);
  }
  if (!result.ok) {
    throw new GoogleApiError(
      502,
      "contacts_pull_failed",
      "Google Contacts sync token reset failed."
    );
  }

  const upserts: GooglePerson[] = [];
  const deletedResourceNames: string[] = [];
  for (const person of result.items) {
    if (!person.resourceName) continue;
    if (person.metadata?.deleted) {
      deletedResourceNames.push(person.resourceName);
    } else {
      upserts.push(person);
    }
  }

  return {
    fullSync,
    upserts,
    deletedResourceNames,
    nextSyncToken: result.nextSyncToken,
  };
}

export async function syncGoogleContactsForUser(
  redis: RedisLike,
  username: string,
  input: {
    mode?: "incremental" | "reset_pull";
    upserts?: Contact[];
    deletions?: GoogleContactsDeletionInput[];
  }
): Promise<GoogleContactsSyncResponse> {
  const { accessToken, account } = await getValidGoogleAccessToken(
    redis,
    username,
    GOOGLE_CONTACTS_SCOPE
  );

  const deletedLocalIds: string[] = [];
  const deletions = (input.deletions || []).slice(0, MAX_MUTATIONS_PER_SYNC);
  for (const deletion of deletions) {
    if (!deletion.googleResourceName.startsWith("people/")) continue;
    const res = await googlePeopleFetch(
      `/${encodeResourcePath(deletion.googleResourceName)}:deleteContact`,
      accessToken,
      { method: "DELETE" }
    );
    if (res.ok || res.status === 404) {
      deletedLocalIds.push(deletion.localId);
    }
  }

  const pushed: GoogleContactsPushedItem[] = [];
  const upserts = (input.upserts || []).slice(0, MAX_MUTATIONS_PER_SYNC);
  for (const contact of upserts) {
    let savedPerson: GooglePerson | null = null;

    if (
      contact.googleResourceName &&
      contact.googleResourceName.startsWith("people/")
    ) {
      let etag = contact.googleEtag || null;
      if (!etag) {
        etag = await fetchPersonEtag(contact.googleResourceName, accessToken);
      }
      if (etag) {
        let updateRes = await googlePeopleFetch(
          `/${encodeResourcePath(contact.googleResourceName)}:updateContact?updatePersonFields=${encodeURIComponent(UPDATE_PERSON_FIELDS)}&personFields=${encodeURIComponent(PERSON_FIELDS)}`,
          accessToken,
          {
            method: "PATCH",
            body: JSON.stringify(buildGooglePersonPayload(contact, etag)),
          }
        );

        // Refresh stale etag once on precondition mismatch.
        if (updateRes.status === 400 || updateRes.status === 409) {
          const freshEtag = await fetchPersonEtag(
            contact.googleResourceName,
            accessToken
          );
          if (freshEtag && freshEtag !== etag) {
            updateRes = await googlePeopleFetch(
              `/${encodeResourcePath(contact.googleResourceName)}:updateContact?updatePersonFields=${encodeURIComponent(UPDATE_PERSON_FIELDS)}&personFields=${encodeURIComponent(PERSON_FIELDS)}`,
              accessToken,
              {
                method: "PATCH",
                body: JSON.stringify(
                  buildGooglePersonPayload(contact, freshEtag)
                ),
              }
            );
          }
        }

        if (updateRes.ok) {
          savedPerson = (await updateRes.json()) as GooglePerson;
        } else if (updateRes.status !== 404) {
          continue;
        }
      }
    }

    if (!savedPerson) {
      const createRes = await googlePeopleFetch(
        `/people:createContact?personFields=${encodeURIComponent(PERSON_FIELDS)}`,
        accessToken,
        {
          method: "POST",
          body: JSON.stringify(buildGooglePersonPayload(contact)),
        }
      );
      if (createRes.ok) {
        savedPerson = (await createRes.json()) as GooglePerson;
      }
    }

    if (savedPerson) {
      const mapped = mapGooglePersonToRyosContact(savedPerson, contact.id);
      if (mapped) {
        const effectiveUpdatedAt = Math.max(
          contact.updatedAt,
          mapped.updatedAt
        );
        pushed.push({
          localId: contact.id,
          contact: {
            ...mapped,
            picture: contact.picture || mapped.picture,
            telegramUsername:
              contact.telegramUsername || mapped.telegramUsername,
            telegramUserId: contact.telegramUserId || mapped.telegramUserId,
            source:
              contact.source === "manual" ? contact.source : mapped.source,
            createdAt: contact.createdAt || mapped.createdAt,
            updatedAt: effectiveUpdatedAt,
            googleSyncedUpdatedAt: effectiveUpdatedAt,
          },
        });
      }
    }
  }

  const storedSyncToken =
    input.mode === "reset_pull" ? null : account.contactsSyncToken ?? null;
  const pulled = await listGoogleContactChanges({
    accessToken,
    syncToken: storedSyncToken,
  });

  const pushedByResource = new Map(
    pushed
      .filter((p) => p.contact.googleResourceName)
      .map((p) => [p.contact.googleResourceName!, p.contact])
  );

  const remoteUpserts: Contact[] = [];
  for (const raw of pulled.upserts) {
    if (raw.resourceName && pushedByResource.has(raw.resourceName)) {
      remoteUpserts.push(pushedByResource.get(raw.resourceName)!);
      continue;
    }
    const mapped = mapGooglePersonToRyosContact(raw);
    if (mapped) {
      remoteUpserts.push(mapped);
    }
  }

  const syncedAt = Date.now();
  await saveLinkedGoogleAccount(redis, {
    ...account,
    contactsSyncToken: pulled.nextSyncToken ?? account.contactsSyncToken ?? null,
    contactsLastSyncedAt: syncedAt,
    updatedAt: syncedAt,
  });

  return {
    fullSync: pulled.fullSync,
    pushed,
    deletedLocalIds,
    remoteUpserts,
    remoteDeletedResourceNames: pulled.deletedResourceNames,
    syncedAt,
  };
}
