import { useRef } from 'react';

/**
 * Custom hook to provide a debounced vibration function.
 * Vibration occurs immediately on the first call, then is debounced
 * for subsequent calls within the specified interval.
 *
 * @param debounceMs The debounce interval in milliseconds (default: 200ms).
 * @param vibrationMs The duration of the vibration in milliseconds (default: 50ms).
 * @returns A function to trigger the debounced vibration.
 */
export const useVibration = (debounceMs = 200, vibrationMs = 50) => {
  const lastVibrateTimeRef = useRef<number>(0);

  const vibrate = () => {
    const now = Date.now();

    // Check if enough time has passed since the last vibration
    if (now - lastVibrateTimeRef.current > debounceMs) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(vibrationMs);
      }
      // Update the last vibration time
      lastVibrateTimeRef.current = now;
    }
  };

  return vibrate;
}; 