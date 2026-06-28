import { useAuthStore } from "@/stores/useAuthStore";

/** True when the signed-in user is the ryOS admin account (ryo). */
export function useIsRyoAdmin(): boolean {
  const username = useAuthStore((state) => state.username);
  return username?.toLowerCase() === "ryo";
}
