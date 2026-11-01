/**
 * Desktop widgets keep 2D coordinates. Mobile keeps an ordered list of the
 * same widget ids. The two layouts are updated independently.
 */

export type DashboardPoint = { x: number; y: number };

export type DashboardLayoutWidget = {
  id: string;
  position?: DashboardPoint;
};

export function sameIdOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Reading order for a phone: top to bottom, then left to right. */
export function deriveMobileOrder(
  widgets: readonly DashboardLayoutWidget[],
): string[] {
  return widgets
    .map((widget, index) => ({
      id: widget.id,
      index,
      x:
        typeof widget.position?.x === "number"
          ? widget.position.x
          : Number.POSITIVE_INFINITY,
      y:
        typeof widget.position?.y === "number"
          ? widget.position.y
          : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.index - b.index)
    .map((widget) => widget.id);
}

/**
 * Keep the saved mobile order, drop ids that no longer exist, and append
 * widgets that are new. Returns the same array when nothing changed.
 */
export function reconcileMobileOrder(
  order: readonly string[],
  widgetIds: readonly string[],
): string[] {
  const idSet = new Set(widgetIds);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const id of order) {
    if (!idSet.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  for (const id of widgetIds) {
    if (!seen.has(id)) next.push(id);
  }
  return sameIdOrder(next, order) ? (order as string[]) : next;
}

export function orderWidgetsForMobile<T extends { id: string }>(
  widgets: readonly T[],
  mobileOrder: readonly string[],
): T[] {
  const ids = widgets.map((widget) => widget.id);
  const order = reconcileMobileOrder(mobileOrder, ids);
  if (sameIdOrder(order, ids)) return widgets as T[];
  const byId = new Map(widgets.map((widget) => [widget.id, widget]));
  const ordered: T[] = [];
  for (const id of order) {
    const widget = byId.get(id);
    if (widget) ordered.push(widget);
  }
  return ordered;
}

function widgetIdsFromUnknown(widgets: unknown): string[] {
  if (!Array.isArray(widgets)) return [];
  const ids: string[] = [];
  for (const widget of widgets) {
    if (
      widget &&
      typeof widget === "object" &&
      typeof (widget as { id?: unknown }).id === "string"
    ) {
      ids.push((widget as { id: string }).id);
    }
  }
  return ids;
}

function layoutWidgetsFromUnknown(widgets: unknown): DashboardLayoutWidget[] {
  if (!Array.isArray(widgets)) return [];
  const laid: DashboardLayoutWidget[] = [];
  for (const widget of widgets) {
    if (
      !widget ||
      typeof widget !== "object" ||
      typeof (widget as { id?: unknown }).id !== "string"
    ) {
      continue;
    }
    const position = (widget as { position?: unknown }).position;
    const point =
      position &&
      typeof position === "object" &&
      typeof (position as { x?: unknown }).x === "number" &&
      typeof (position as { y?: unknown }).y === "number"
        ? {
            x: (position as { x: number }).x,
            y: (position as { y: number }).y,
          }
        : undefined;
    laid.push({ id: (widget as { id: string }).id, position: point });
  }
  return laid;
}

/**
 * Version 1 stored a single widget list whose coordinates are the desktop
 * layout. Derive a mobile order from those coordinates and leave the
 * coordinates themselves untouched.
 */
export function migrateDashboardLayout(
  persisted: unknown,
  version: number,
): Record<string, unknown> {
  const record =
    persisted && typeof persisted === "object"
      ? { ...(persisted as Record<string, unknown>) }
      : {};
  const widgets = record.widgets;
  const ids = widgetIdsFromUnknown(widgets);
  if (version < 2 || !Array.isArray(record.mobileOrder)) {
    record.mobileOrder = deriveMobileOrder(layoutWidgetsFromUnknown(widgets));
    return record;
  }
  const saved = record.mobileOrder.filter(
    (id): id is string => typeof id === "string",
  );
  record.mobileOrder = reconcileMobileOrder(saved, ids);
  return record;
}
