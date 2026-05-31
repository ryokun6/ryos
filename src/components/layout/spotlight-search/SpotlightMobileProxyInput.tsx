import type { RefObject } from "react";

type SpotlightMobileProxyInputProps = {
  proxyInputRef: RefObject<HTMLInputElement | null>;
};

export function SpotlightMobileProxyInput({
  proxyInputRef,
}: SpotlightMobileProxyInputProps) {
  return (
    <input
      ref={proxyInputRef}
      aria-hidden="true"
      tabIndex={-1}
      style={{
        position: "fixed",
        opacity: 0,
        pointerEvents: "none",
        top: 0,
        left: 0,
        width: 0,
        height: 0,
        fontSize: "16px",
        border: "none",
        padding: 0,
        margin: 0,
      }}
    />
  );
}
