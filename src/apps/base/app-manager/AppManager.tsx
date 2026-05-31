import type { AppManagerProps } from "./types";
import { AppManagerView } from "./AppManagerView";
import { useAppManager } from "./useAppManager";

export function AppManager(props: AppManagerProps) {
  const vm = useAppManager(props);
  return <AppManagerView {...vm} />;
}
