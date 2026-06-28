import type { CoalescedCursorRow } from "@/lib/cursorSdkRunCoalesce";
import {
  CursorRunEventView,
  MergedAssistantStreamBlock,
  MergedEvTextStreamBlock,
  MergedThinkingStreamBlock,
  MergedToolCallStreamBlock,
  MergedUserStreamBlock,
} from "@/components/shared/CursorRunEventView";

interface CursorRunCoalescedItemsProps {
  items: CoalescedCursorRow[];
  keyPrefix?: string;
  plainStream?: boolean;
}

/** Renders coalesced Cursor SDK stream rows (shared by chat card and admin panel). */
export function CursorRunCoalescedItems({
  items,
  keyPrefix = "run",
  plainStream = true,
}: CursorRunCoalescedItemsProps) {
  return (
    <>
      {items.map((item, i) => {
        const key = `${keyPrefix}-${i}`;
        switch (item.kind) {
          case "merged_assistant":
            return (
              <MergedAssistantStreamBlock
                key={key}
                plainStream={plainStream}
                tsStart={item.tsStart}
                tsEnd={item.tsEnd}
                segments={item.segments}
              />
            );
          case "merged_thinking":
            return (
              <MergedThinkingStreamBlock
                key={key}
                plainStream={plainStream}
                tsStart={item.tsStart}
                tsEnd={item.tsEnd}
                text={item.text}
              />
            );
          case "merged_user":
            return (
              <MergedUserStreamBlock
                key={key}
                plainStream={plainStream}
                tsStart={item.tsStart}
                tsEnd={item.tsEnd}
                text={item.text}
              />
            );
          case "merged_ev_text":
            return (
              <MergedEvTextStreamBlock
                key={key}
                plainStream={plainStream}
                tsStart={item.tsStart}
                tsEnd={item.tsEnd}
                evType={item.evType}
                text={item.text}
              />
            );
          case "merged_tool_call":
            return (
              <MergedToolCallStreamBlock
                key={key}
                plainStream={plainStream}
                tsStart={item.tsStart}
                tsEnd={item.tsEnd}
                row={item.row}
                rows={item.rows}
              />
            );
          case "single":
            return (
              <CursorRunEventView key={key} plainStream={plainStream} row={item.row} />
            );
          default:
            return null;
        }
      })}
    </>
  );
}
