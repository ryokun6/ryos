import type { Contact } from "@/utils/contacts";

export function splitMultivalueInput(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatMultivalue(values: string[]): string {
  return values.join("\n");
}

export function getMultivalueDraft(contact: Contact | null | undefined) {
  return {
    phones: formatMultivalue(contact?.phones.map((p) => p.value) || []),
    emails: formatMultivalue(contact?.emails.map((e) => e.value) || []),
    addresses: formatMultivalue(contact?.addresses.map((a) => a.formatted) || []),
    urls: formatMultivalue(contact?.urls.map((u) => u.value) || []),
  };
}

export function formatBirthday(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
