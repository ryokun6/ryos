export interface SingleFlightRef<T> {
  current: Promise<T> | null;
}

/**
 * Share one in-flight async operation while allowing a fresh operation after
 * the current one settles.
 */
export function runSingleFlight<T>(
  ref: SingleFlightRef<T>,
  operation: () => Promise<T>
): Promise<T> {
  if (ref.current) return ref.current;

  const pending = operation();
  ref.current = pending;
  const clear = () => {
    if (ref.current === pending) ref.current = null;
  };
  void pending.then(clear, clear);
  return pending;
}
