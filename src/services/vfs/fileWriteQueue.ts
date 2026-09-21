// Serialize saves and lifecycle operations in this tab. IndexedDB transactions
// and catalog validation provide the corresponding cross-tab protection.
let tail: Promise<unknown> = Promise.resolve();
export function enqueueFileWrite<T>(write: () => Promise<T>): Promise<T> {
  const run = tail.catch(() => {}).then(write);
  tail = run;
  return run;
}
