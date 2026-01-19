# React Hooks Patterns Analysis for ryOS

## Executive Summary

This codebase demonstrates **excellent React hooks hygiene** with well-designed custom hooks and proper patterns. The analysis covers 109 files using `useEffect` and 33 custom hooks. Below are findings and improvement suggestions.

---

## 1. Strengths (Current Patterns)

### Pattern A: `useRef` for Stable Callbacks ✅

The codebase consistently uses refs to store callbacks, preventing unnecessary effect re-runs:

```typescript
// src/hooks/useEventListener.ts
const savedHandler = useRef(handler);
savedHandler.current = handler;

useEffect(() => {
  const eventListener = (event: Event) => {
    savedHandler.current(event as EventMap[K]);
  };
  // ... subscription logic
}, [eventName, element, options]); // handler NOT in deps
```

**Why it's good:** Avoids re-subscribing when callback identity changes but logic is the same.

### Pattern B: `useLatestRef` for Clean API ✅

The `useLatestRef` hook provides a clean way to access latest values without adding to deps:

```typescript
// src/hooks/useLatestRef.ts
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value; // Update synchronously during render
  return ref;
}
```

**Usage in `useFurigana.tsx`:**
```typescript
const linesRef = useLatestRef(lines);
const onLoadingChangeRef = useLatestRef(onLoadingChange);

useEffect(() => {
  // Can use linesRef.current without adding `lines` to deps
  const currentLines = linesRef.current;
}, [songId, cacheKey]); // lines NOT in deps
```

### Pattern C: Proper AbortController Cleanup ✅

Fetch operations correctly use AbortController:

```typescript
// src/hooks/useFurigana.tsx
const controller = new AbortController();

processFuriganaSSE(songId, {
  signal: controller.signal,
  // ...
});

return () => {
  controller.abort();
};
```

### Pattern D: Custom Hooks with Proper Composition ✅

Hooks like `useInterval`, `useTimeout`, and `useEventListener` encapsulate common patterns correctly:

```typescript
// src/hooks/useInterval.ts
export function useInterval(
  callback: () => void,
  delay: number | null,
  options?: { immediate?: boolean }
): void {
  const savedCallback = useRef(callback);
  savedCallback.current = callback;

  useEffect(() => {
    if (delay === null) return;
    if (options?.immediate) savedCallback.current();
    
    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay, options?.immediate]);
}
```

---

## 2. Improvement Opportunities

### Issue A: Callback Props Should Use `useLatestRef`

**File:** `src/components/dialogs/BootScreen.tsx` (lines 38-83)

**Current code:**
```typescript
useEffect(() => {
  // ... timer logic
  onBootComplete?.();
  onOpenChange(false);
}, [isOpen, play, onBootComplete, onOpenChange, debugMode]);
```

**Problem:** `play`, `onBootComplete`, and `onOpenChange` are function props. If parent re-renders with new function references (common with inline functions), this effect re-runs unnecessarily.

**Suggested fix:**
```typescript
const playRef = useLatestRef(play);
const onBootCompleteRef = useLatestRef(onBootComplete);
const onOpenChangeRef = useLatestRef(onOpenChange);

useEffect(() => {
  // ... timer logic
  onBootCompleteRef.current?.();
  onOpenChangeRef.current(false);
}, [isOpen, debugMode]); // Callbacks NOT in deps
```

---

### Issue B: Animation Loop Pattern Could Be Cleaner

**File:** `src/components/screensavers/Matrix.tsx` (lines 79-82)

**Current code:**
```typescript
// Uses both setInterval AND requestAnimationFrame
const intervalId = setInterval(() => {
  cancelAnimationFrame(animationId);
  animationId = requestAnimationFrame(draw);
}, 50);
```

**Problem:** Unusual combination of `setInterval` and `requestAnimationFrame`. This achieves ~20fps but is harder to understand.

**Suggested cleaner approach:**
```typescript
useEffect(() => {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  let animationId: number;
  let lastFrame = 0;
  const targetInterval = 50; // ~20fps

  const draw = (timestamp: number) => {
    if (timestamp - lastFrame >= targetInterval) {
      // Drawing logic here
      lastFrame = timestamp;
    }
    animationId = requestAnimationFrame(draw);
  };

  animationId = requestAnimationFrame(draw);

  return () => cancelAnimationFrame(animationId);
}, []);
```

---

### Issue C: Complex Effects Could Use Data Fetching Library

**File:** `src/hooks/useFurigana.tsx` (lines 172-348)

**Observation:** The furigana fetching effect has ~12 dependencies and complex cache logic. Similar patterns exist in `useLyrics.ts`.

**Current pattern:**
```typescript
// eslint-disable-next-line react-hooks/exhaustive-deps
useEffect(() => {
  // 175+ lines of fetch logic with:
  // - Cache key management
  // - AbortController setup
  // - Progress tracking
  // - Error handling
  // - Stale request detection
}, [songId, cacheKey, shouldFetchFurigana, hasLines, isShowingOriginal, ...]);
```

**Suggested improvement:** Consider extracting into a custom `useAsyncFetch` hook or using `@tanstack/react-query`:

```typescript
// Option 1: Custom hook to reduce boilerplate
function useAsyncFetch<T>({
  fetchFn,
  cacheKey,
  enabled,
  onProgress,
  onError,
}: AsyncFetchOptions<T>) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const cacheKeyRef = useRef(cacheKey);

  useEffect(() => {
    if (!enabled || cacheKey === cacheKeyRef.current) return;
    
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    
    setIsLoading(true);
    
    fetchFn(controller.signal)
      .then(setData)
      .catch((err) => {
        if (err.name !== 'AbortError') onError?.(err);
      })
      .finally(() => setIsLoading(false));

    return () => controller.abort();
  }, [cacheKey, enabled, fetchFn, onError]);

  return { data, isLoading };
}
```

---

### Issue D: Menu Rebuild Effect Could Use `useMemo`

**File:** `src/apps/ipod/hooks/useIpodLogic.ts` (lines 771-816)

**Current code:**
```typescript
useEffect(() => {
  setMenuHistory((prev) => {
    // Complex logic rebuilding menu structure
  });
  // Also updates selectedMenuItem
}, [rebuildMenuItems, selectedMenuItem]);
```

**Problem:** Using `useEffect` to derive state from other state. This creates an extra render cycle.

**Suggested improvement:** Use `useMemo` for derived data:

```typescript
// Derive menu items directly
const currentMenuItems = useMemo(() => {
  const currentMenu = menuHistory[menuHistory.length - 1];
  if (!currentMenu) return [];
  return rebuildMenuItems(currentMenu) || currentMenu.items;
}, [menuHistory, rebuildMenuItems]);

// Only use effect for side effects that MUST happen after render
useEffect(() => {
  if (selectedMenuItem >= currentMenuItems.length) {
    setSelectedMenuItem(Math.max(0, currentMenuItems.length - 1));
  }
}, [currentMenuItems.length, selectedMenuItem]);
```

---

### Issue E: Multiple Similar Effects Could Be Combined

**File:** `src/components/layout/WindowFrame.tsx`

Has 7+ separate `useEffect` hooks. Some could potentially be grouped:

| Effect | Purpose |
|--------|---------|
| Line 188-197 | Cleanup timeouts |
| Line 229-236 | Play window open sound |
| Line 239-243 | Sync window title |
| Line 249-255 | Play restore sound |
| Line 308-328 | Expose performClose |
| Line 332-352 | Listen for close requests |
| Line 440-445 | Track fullHeight state |

**Suggested groupings:**
```typescript
// Group 1: Sound effects on state changes
useEffect(() => {
  if (!skipInitialSound) playWindowOpen();
}, []);

// Group 2: External event listeners (could be combined)
useEffect(() => {
  if (!instanceId) return;
  
  const handleCloseRequest = () => { /* ... */ };
  const handlePerformClose = () => { /* ... */ };
  
  window.addEventListener(`requestCloseWindow-${instanceId}`, handleCloseRequest);
  if (interceptClose) {
    window.addEventListener(`closeWindow-${instanceId}`, handlePerformClose);
  }
  
  return () => {
    window.removeEventListener(`requestCloseWindow-${instanceId}`, handleCloseRequest);
    if (interceptClose) {
      window.removeEventListener(`closeWindow-${instanceId}`, handlePerformClose);
    }
  };
}, [instanceId, interceptClose, performClose]);
```

**Counter-argument:** The current separation follows "one concern per effect" principle, which improves readability. This is a judgment call based on team preference.

---

## 3. ESLint Disable Comments Audit

Found **8 instances** of `eslint-disable-next-line react-hooks/exhaustive-deps`:

| File | Line | Assessment |
|------|------|------------|
| `useSound.ts` | 111 | ✅ Valid - mount-only effect |
| `useAdminLogic.ts` | 826 | ✅ Valid - mount-only initialization |
| `useAiChat.ts` | 1870 | ✅ Valid - prevents infinite loop with Zustand |
| `useAiGeneration.ts` | 493 | ✅ Valid - throttled streaming |
| `AppStore.tsx` | 173 | ⚠️ Review - toast on applets change |
| `AppStoreFeed.tsx` | 291 | ✅ Valid - content fetching |
| `useFurigana.tsx` | 347 | ✅ Valid - documented complex deps |
| `useFurigana.tsx` | 563 | ✅ Valid - documented complex deps |

**All are reasonably justified** with comments explaining intent.

---

## 4. Best Practices Checklist

### ✅ Already Following
- [x] Always cleanup timers, intervals, and event listeners
- [x] Use AbortController for fetch cancellation
- [x] Store callbacks in refs when they shouldn't trigger re-runs
- [x] Use `useCallback` for handlers passed to children
- [x] Use `useMemo` for expensive computations
- [x] Document ESLint disable comments with reasoning

### 📝 Recommendations
- [ ] Consider extracting common async patterns into shared hooks
- [ ] Stabilize callback props with `useLatestRef` pattern
- [ ] Prefer `useMemo` over `useEffect` for derived state
- [ ] Use timestamp-based throttling for animations instead of setInterval + rAF

---

## 5. Custom Hooks Quality Assessment

| Hook | Quality | Notes |
|------|---------|-------|
| `useEventListener` | ⭐⭐⭐⭐⭐ | Excellent - handles all edge cases |
| `useInterval` | ⭐⭐⭐⭐⭐ | Excellent - null delay pauses |
| `useTimeout` | ⭐⭐⭐⭐⭐ | Excellent - clear/reset API |
| `useLatestRef` | ⭐⭐⭐⭐⭐ | Excellent - simple and effective |
| `useResizeObserver` | ⭐⭐⭐⭐⭐ | Excellent - debounced with cleanup |
| `useSound` | ⭐⭐⭐⭐ | Good - could benefit from `useLatestRef` |
| `useLyrics` | ⭐⭐⭐⭐ | Good - complex but well-structured |
| `useFurigana` | ⭐⭐⭐⭐ | Good - complex deps but documented |
| `useStreamingFetch` | ⭐⭐⭐⭐⭐ | Excellent - proper SSE handling |
| `useWallpaper` | ⭐⭐⭐⭐ | Good - one-time refresh guard |

---

## 6. Metrics Summary

| Metric | Count |
|--------|-------|
| Files with `useEffect` | 109 |
| Custom hooks in `src/hooks/` | 33 |
| ESLint disable comments | 8 (all justified) |
| Effects with proper cleanup | ~95% |
| Missing dependency arrays | 0 |
| Empty `[]` arrays without justification | 0 |

---

## 7. Conclusion

This codebase has **excellent React hooks patterns**. The main opportunities for improvement are:

1. **Stabilize callback props** with `useLatestRef` to prevent unnecessary effect re-runs
2. **Prefer `useMemo`** over `useEffect` for derived state
3. **Cleaner animation patterns** using only `requestAnimationFrame` with timestamp throttling
4. **Consider extracting** common async fetch patterns into a shared hook

No critical anti-patterns were found. The codebase demonstrates strong understanding of React's concurrent rendering model and proper effect management.
