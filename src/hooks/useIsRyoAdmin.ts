import { useChatsStore } from "@/stores/useChatsStore";

/** True when the signed-in user is the ryOS admin account (ryo). */
export function useIsRyoAdmin(): boolean {
  const username = useChatsStore((state) => state.username);
  return username?.toLowerCase() === "ryo";
}
