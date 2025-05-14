import { useRef, useEffect } from 'react';

/**
 * Returns a ref to the latest value, useful for solving closure trap issues
 * Commonly used in callbacks, event handlers, or inside setTimeout/setInterval to access latest state
 * 
 * @example
 * // Access latest state in setTimeout callback
 * const count = useState(0);
 * const countRef = useLatest(count);
 * 
 * useEffect(() => {
 *   const timer = setTimeout(() => {
 *     // Use countRef.current instead of count
 *     console.log(countRef.current);
 *   }, 1000);
 *   return () => clearTimeout(timer);
 * }, []);
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  
  // Update ref value on each render to ensure ref.current is always the latest value
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref;
} 