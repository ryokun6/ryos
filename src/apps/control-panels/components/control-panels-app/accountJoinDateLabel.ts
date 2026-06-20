export function formatAccountJoinMonthYear(
  createdAt: number,
  locale: string
): string {
  return new Date(createdAt).toLocaleDateString(locale, {
    month: "short",
    year: "numeric",
  });
}

export function getAccountJoinStatusLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  accountJoinedAt: number | null | undefined,
  locale: string
): string {
  if (
    typeof accountJoinedAt === "number" &&
    Number.isFinite(accountJoinedAt)
  ) {
    return t("apps.control-panels.accountJoined", {
      date: formatAccountJoinMonthYear(accountJoinedAt, locale),
    });
  }

  return t("apps.control-panels.loggedInToRyOS");
}
