import { useRef, type MutableRefObject } from "react";

/**
 * Custom hook that returns a ref that always contains the latest value.
 * Useful for accessing current values in callbacks/effects without
 * adding them to dependency arrays.
 *
 * This eliminates the need for useEffect to sync state to refs.
 *
 * @param value - The value to track
 * @returns A ref that always contains the latest value
 *
 * @example
 * // Before: Manual sync with useEffect
 * const [count, setCount] = useState(0);
 * const countRef = useRef(count);
 * useEffect(() => { countRef.current = count; }, [count]);
 *
 * // After: Using useLatestRef
 * const [count, setCount] = useState(0);
 * const countRef = useLatestRef(count);
 *
 * // Use in callbacks without stale closure issues
 * const handleClick = useCallback(() => {
 *   console.log('Current count:', countRef.current);
 * }, []); // No need to include count in deps
 */
export function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  // Update synchronously during render
  ref.current = value;
  return ref;
}

/**
 * Custom hook for storing the previous value of a variable.
 * Returns undefined on first render.
 *
 * @param value - The value to track
 * @returns The value from the previous render
 *
 * @example
 * const [count, setCount] = useState(0);
 * const prevCount = usePrevious(count);
 * // On first render: prevCount is undefined
 * // After setCount(5): prevCount is 0
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  const prevValue = ref.current;
  ref.current = value;
  return prevValue;
}
