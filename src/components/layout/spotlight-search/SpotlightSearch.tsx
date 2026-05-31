import { createPortal } from "react-dom";
import { SpotlightMobileProxyInput } from "./SpotlightMobileProxyInput";
import { SpotlightSearchOverlay } from "./SpotlightSearchOverlay";
import { useSpotlightSearchController } from "./useSpotlightSearchController";

export function SpotlightSearch() {
  const vm = useSpotlightSearchController();

  if (!vm.hasBeenOpen) {
    if (vm.isMobile) {
      return createPortal(
        <SpotlightMobileProxyInput proxyInputRef={vm.proxyInputRef} />,
        document.body
      );
    }
    return null;
  }

  return createPortal(<SpotlightSearchOverlay vm={vm} />, document.body);
}
