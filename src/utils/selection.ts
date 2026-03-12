export interface SelectionModifierState {
  shiftKey: boolean;
  toggleKey: boolean;
}

export interface MultiSelectionRequest<Id extends string> {
  orderedIds: Id[];
  currentSelectedIds: Id[];
  clickedId: Id;
  anchorId: Id | null;
  modifiers: SelectionModifierState;
}

export interface MultiSelectionResult<Id extends string> {
  selectedIds: Id[];
  anchorId: Id | null;
  primaryId: Id | null;
}

export interface SelectionPoint {
  x: number;
  y: number;
}

export interface SelectionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface SelectableRect<Id extends string> {
  id: Id;
  rect: SelectionRect;
}

const uniqueOrderedIds = <Id extends string>(
  orderedIds: Id[],
  ids: readonly Id[]
): Id[] => {
  const idSet = new Set(ids);
  return orderedIds.filter((id) => idSet.has(id));
};

const getRangeIds = <Id extends string>(
  orderedIds: Id[],
  startId: Id,
  endId: Id
): Id[] => {
  const startIndex = orderedIds.indexOf(startId);
  const endIndex = orderedIds.indexOf(endId);

  if (startIndex === -1 || endIndex === -1) {
    return endId ? [endId] : [];
  }

  const rangeStart = Math.min(startIndex, endIndex);
  const rangeEnd = Math.max(startIndex, endIndex);
  return orderedIds.slice(rangeStart, rangeEnd + 1);
};

export const hasToggleModifier = (input: {
  ctrlKey?: boolean;
  metaKey?: boolean;
}): boolean => Boolean(input.ctrlKey || input.metaKey);

export const resolveMultiSelection = <Id extends string>({
  orderedIds,
  currentSelectedIds,
  clickedId,
  anchorId,
  modifiers,
}: MultiSelectionRequest<Id>): MultiSelectionResult<Id> => {
  if (!orderedIds.includes(clickedId)) {
    const selectedIds = uniqueOrderedIds(orderedIds, currentSelectedIds);
    return {
      selectedIds,
      anchorId,
      primaryId: selectedIds[selectedIds.length - 1] ?? null,
    };
  }

  const selectedIds = uniqueOrderedIds(orderedIds, currentSelectedIds);
  const resolvedAnchorId =
    anchorId && orderedIds.includes(anchorId)
      ? anchorId
      : selectedIds[0] ?? clickedId;

  if (modifiers.shiftKey) {
    const rangeIds = getRangeIds(orderedIds, resolvedAnchorId, clickedId);
    const nextSelectedIds = modifiers.toggleKey
      ? uniqueOrderedIds(orderedIds, [...selectedIds, ...rangeIds])
      : rangeIds;

    return {
      selectedIds: nextSelectedIds,
      anchorId: resolvedAnchorId,
      primaryId: clickedId,
    };
  }

  if (modifiers.toggleKey) {
    const nextSelectedIds = selectedIds.includes(clickedId)
      ? selectedIds.filter((id) => id !== clickedId)
      : uniqueOrderedIds(orderedIds, [...selectedIds, clickedId]);

    return {
      selectedIds: nextSelectedIds,
      anchorId: clickedId,
      primaryId: nextSelectedIds.includes(clickedId)
        ? clickedId
        : nextSelectedIds[nextSelectedIds.length - 1] ?? null,
    };
  }

  return {
    selectedIds: [clickedId],
    anchorId: clickedId,
    primaryId: clickedId,
  };
};

export const mergeSelectionIds = <Id extends string>(
  orderedIds: Id[],
  baseIds: readonly Id[],
  addedIds: readonly Id[]
): Id[] => uniqueOrderedIds(orderedIds, [...baseIds, ...addedIds]);

export const createSelectionRect = (
  start: SelectionPoint,
  end: SelectionPoint
): SelectionRect => ({
  left: Math.min(start.x, end.x),
  top: Math.min(start.y, end.y),
  right: Math.max(start.x, end.x),
  bottom: Math.max(start.y, end.y),
});

export const rectanglesIntersect = (
  first: SelectionRect,
  second: SelectionRect
): boolean =>
  !(
    first.right < second.left ||
    first.left > second.right ||
    first.bottom < second.top ||
    first.top > second.bottom
  );

export const getIntersectingSelectionIds = <Id extends string>(
  selectionRect: SelectionRect,
  selectableRects: readonly SelectableRect<Id>[]
): Id[] =>
  selectableRects
    .filter((item) => rectanglesIntersect(selectionRect, item.rect))
    .map((item) => item.id);
