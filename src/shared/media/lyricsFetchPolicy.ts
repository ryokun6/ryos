export function shouldForceLyricsFetch({
  isCacheBustRequest,
  isAuthenticated,
}: {
  isCacheBustRequest: boolean;
  isAuthenticated: boolean;
}): boolean {
  // A routine UI refetch should bypass only the client-side memo. Sending
  // force=true would turn a public read into a protected server mutation for
  // songs that already have an owner or lyrics source.
  return isCacheBustRequest && isAuthenticated;
}
