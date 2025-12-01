import { createContext, useContext, useRef, useCallback } from "react";
import { WindowFrameHandle } from "@/components/layout/WindowFrame";

interface WindowFrameRegistry {
  register: (instanceId: string, handle: WindowFrameHandle) => void;
  unregister: (instanceId: string) => void;
  getHandleClose: (instanceId: string) => (() => void) | null;
}

const WindowFrameContext = createContext<WindowFrameRegistry | null>(null);

export function WindowFrameProvider({ children }: { children: React.ReactNode }) {
  const handlesRef = useRef<Map<string, WindowFrameHandle>>(new Map());

  const register = useCallback((instanceId: string, handle: WindowFrameHandle) => {
    handlesRef.current.set(instanceId, handle);
  }, []);

  const unregister = useCallback((instanceId: string) => {
    handlesRef.current.delete(instanceId);
  }, []);

  const getHandleClose = useCallback((instanceId: string) => {
    const handle = handlesRef.current.get(instanceId);
    return handle ? handle.handleClose : null;
  }, []);

  return (
    <WindowFrameContext.Provider value={{ register, unregister, getHandleClose }}>
      {children}
    </WindowFrameContext.Provider>
  );
}

export function useWindowFrameRegistry() {
  const context = useContext(WindowFrameContext);
  if (!context) {
    throw new Error("useWindowFrameRegistry must be used within WindowFrameProvider");
  }
  return context;
}
