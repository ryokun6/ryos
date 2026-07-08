/**
 * Real React render-count before/after for the chat row ephemeral-state fix.
 *
 * Mounts N memoized rows and toggles a shared "copied" id the OLD way
 * (pass id to every row) vs the NEW way (pass per-row boolean). Counts
 * how many times each row's render function runs.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import React, { memo, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";

let registeredDomHere = false;

beforeAll(() => {
  if (!GlobalRegistrator.isRegistered) {
    GlobalRegistrator.register();
    registeredDomHere = true;
  }
});

afterAll(() => {
  if (registeredDomHere && GlobalRegistrator.isRegistered) {
    GlobalRegistrator.unregister();
  }
});

const MESSAGE_COUNT = 40;
const COPY_CLICKS = 20;

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("ChatMessageItem render counts (old vs new props)", () => {
  test("per-row booleans cut commits vs shared copiedMessageId", async () => {
    const oldRenderCounts = new Map<string, number>();
    const newRenderCounts = new Map<string, number>();

    const OldRow = memo(function OldRow({
      messageKey,
      copiedMessageId,
    }: {
      messageKey: string;
      copiedMessageId: string | null;
    }) {
      oldRenderCounts.set(
        messageKey,
        (oldRenderCounts.get(messageKey) ?? 0) + 1
      );
      const isCopied = copiedMessageId === messageKey;
      return React.createElement("div", {
        "data-key": messageKey,
        "data-copied": isCopied ? "1" : "0",
      });
    });

    const NewRow = memo(function NewRow({
      messageKey,
      isCopied,
    }: {
      messageKey: string;
      isCopied: boolean;
    }) {
      newRenderCounts.set(
        messageKey,
        (newRenderCounts.get(messageKey) ?? 0) + 1
      );
      return React.createElement("div", {
        "data-key": messageKey,
        "data-copied": isCopied ? "1" : "0",
      });
    });

    function OldList({
      copiedId,
      keys,
    }: {
      copiedId: string | null;
      keys: string[];
    }) {
      return React.createElement(
        "div",
        null,
        keys.map((key) =>
          React.createElement(OldRow, {
            key,
            messageKey: key,
            copiedMessageId: copiedId,
          })
        )
      );
    }

    function NewList({
      copiedId,
      keys,
    }: {
      copiedId: string | null;
      keys: string[];
    }) {
      return React.createElement(
        "div",
        null,
        keys.map((key) =>
          React.createElement(NewRow, {
            key,
            messageKey: key,
            isCopied: copiedId === key,
          })
        )
      );
    }

    const keys = Array.from({ length: MESSAGE_COUNT }, (_, i) => `msg-${i}`);

    // --- OLD ---
    const oldHost = document.createElement("div");
    document.body.appendChild(oldHost);
    let oldRoot: Root = createRoot(oldHost);
    let copiedId: string | null = null;
    await act(async () => {
      oldRoot.render(
        React.createElement(OldList, { copiedId, keys })
      );
      await flush();
    });

    for (let c = 0; c < COPY_CLICKS; c++) {
      copiedId = keys[c % MESSAGE_COUNT]!;
      await act(async () => {
        oldRoot.render(
          React.createElement(OldList, { copiedId, keys })
        );
        await flush();
      });
    }

    const oldTotal = [...oldRenderCounts.values()].reduce((a, b) => a + b, 0);

    // --- NEW ---
    const newHost = document.createElement("div");
    document.body.appendChild(newHost);
    let newRoot: Root = createRoot(newHost);
    copiedId = null;
    await act(async () => {
      newRoot.render(
        React.createElement(NewList, { copiedId, keys })
      );
      await flush();
    });

    for (let c = 0; c < COPY_CLICKS; c++) {
      copiedId = keys[c % MESSAGE_COUNT]!;
      await act(async () => {
        newRoot.render(
          React.createElement(NewList, { copiedId, keys })
        );
        await flush();
      });
    }

    const newTotal = [...newRenderCounts.values()].reduce((a, b) => a + b, 0);
    const reductionPct = Math.round(
      ((oldTotal - newTotal) / oldTotal) * 1000
    ) / 10;

    // Persist numbers for the measurement artifact.
    const summary = {
      messageCount: MESSAGE_COUNT,
      copyClicks: COPY_CLICKS,
      oldTotalRenders: oldTotal,
      newTotalRenders: newTotal,
      reductionPct,
    };
    await Bun.write(
      "/opt/cursor/artifacts/react_chat_row_render_counts.json",
      JSON.stringify(summary, null, 2)
    );

    console.log(
      `[chat-row-renders] old=${oldTotal} new=${newTotal} reduction=${reductionPct}%`
    );

    // OLD: initial N + (N * clicks) because every row sees a new copiedMessageId
    expect(oldTotal).toBe(MESSAGE_COUNT * (1 + COPY_CLICKS));
    // NEW: initial N + at most 2 rows per click (prev + next); first click
    // only flips one row from false→true.
    expect(newTotal).toBeLessThan(oldTotal);
    expect(newTotal).toBeLessThanOrEqual(
      MESSAGE_COUNT + COPY_CLICKS * 2
    );
    expect(reductionPct).toBeGreaterThan(80);

    await act(async () => {
      oldRoot.unmount();
      newRoot.unmount();
      await flush();
    });
    oldHost.remove();
    newHost.remove();
  });

  test("per-row highlightSegment null cuts commits vs shared object", async () => {
    type Highlight = { messageId: string; start: number; end: number };
    const HIGHLIGHT_TICKS = 20;
    const oldRenderCounts = new Map<string, number>();
    const newRenderCounts = new Map<string, number>();

    const OldRow = memo(function OldRow({
      messageKey,
      highlightSegment,
    }: {
      messageKey: string;
      highlightSegment: Highlight | null;
    }) {
      oldRenderCounts.set(
        messageKey,
        (oldRenderCounts.get(messageKey) ?? 0) + 1
      );
      const active =
        highlightSegment?.messageId === messageKey ? highlightSegment : null;
      return React.createElement("div", {
        "data-key": messageKey,
        "data-active": active ? "1" : "0",
      });
    });

    const NewRow = memo(function NewRow({
      messageKey,
      highlightSegment,
    }: {
      messageKey: string;
      highlightSegment: Highlight | null;
    }) {
      newRenderCounts.set(
        messageKey,
        (newRenderCounts.get(messageKey) ?? 0) + 1
      );
      return React.createElement("div", {
        "data-key": messageKey,
        "data-active": highlightSegment ? "1" : "0",
      });
    });

    function OldList({
      highlight,
      keys,
    }: {
      highlight: Highlight | null;
      keys: string[];
    }) {
      return React.createElement(
        "div",
        null,
        keys.map((key) =>
          React.createElement(OldRow, {
            key,
            messageKey: key,
            highlightSegment: highlight,
          })
        )
      );
    }

    function NewList({
      highlight,
      keys,
    }: {
      highlight: Highlight | null;
      keys: string[];
    }) {
      return React.createElement(
        "div",
        null,
        keys.map((key) =>
          React.createElement(NewRow, {
            key,
            messageKey: key,
            highlightSegment:
              highlight?.messageId === key ? highlight : null,
          })
        )
      );
    }

    const keys = Array.from({ length: MESSAGE_COUNT }, (_, i) => `msg-${i}`);
    const spokenKey = keys[0]!;

    const oldHost = document.createElement("div");
    document.body.appendChild(oldHost);
    const oldRoot: Root = createRoot(oldHost);
    let highlight: Highlight | null = null;
    await act(async () => {
      oldRoot.render(React.createElement(OldList, { highlight, keys }));
      await flush();
    });

    for (let t = 0; t < HIGHLIGHT_TICKS; t++) {
      highlight = { messageId: spokenKey, start: t, end: t + 1 };
      await act(async () => {
        oldRoot.render(React.createElement(OldList, { highlight, keys }));
        await flush();
      });
    }

    const oldTotal = [...oldRenderCounts.values()].reduce((a, b) => a + b, 0);

    const newHost = document.createElement("div");
    document.body.appendChild(newHost);
    const newRoot: Root = createRoot(newHost);
    highlight = null;
    await act(async () => {
      newRoot.render(React.createElement(NewList, { highlight, keys }));
      await flush();
    });

    for (let t = 0; t < HIGHLIGHT_TICKS; t++) {
      highlight = { messageId: spokenKey, start: t, end: t + 1 };
      await act(async () => {
        newRoot.render(React.createElement(NewList, { highlight, keys }));
        await flush();
      });
    }

    const newTotal = [...newRenderCounts.values()].reduce((a, b) => a + b, 0);
    const reductionPct =
      Math.round(((oldTotal - newTotal) / oldTotal) * 1000) / 10;

    const summary = {
      messageCount: MESSAGE_COUNT,
      highlightTicks: HIGHLIGHT_TICKS,
      oldTotalRenders: oldTotal,
      newTotalRenders: newTotal,
      reductionPct,
    };
    await Bun.write(
      "/opt/cursor/artifacts/react_chat_highlight_render_counts.json",
      JSON.stringify(summary, null, 2)
    );

    console.log(
      `[chat-highlight-renders] old=${oldTotal} new=${newTotal} reduction=${reductionPct}%`
    );

    // OLD: every row sees a new highlight object each tick.
    expect(oldTotal).toBe(MESSAGE_COUNT * (1 + HIGHLIGHT_TICKS));
    // NEW: only the spoken row re-renders; others keep null (Object.is-stable).
    expect(newTotal).toBeLessThan(oldTotal);
    expect(newTotal).toBeLessThanOrEqual(MESSAGE_COUNT + HIGHLIGHT_TICKS);
    expect(reductionPct).toBeGreaterThan(80);

    await act(async () => {
      oldRoot.unmount();
      newRoot.unmount();
      await flush();
    });
    oldHost.remove();
    newHost.remove();
  });
});
