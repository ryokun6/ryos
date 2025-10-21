import {
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
  forwardRef,
} from "react";
import type React from "react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useAppStoreShallow } from "@/stores/helpers";
import { ThemedIcon } from "@/components/shared/ThemedIcon";
import { AppId, getAppIconPath, appRegistry } from "@/config/appRegistry";
import { useLaunchApp } from "@/hooks/useLaunchApp";
import { useFinderStore } from "@/stores/useFinderStore";
import { useFilesStore } from "@/stores/useFilesStore";
import { useIsPhone } from "@/hooks/useIsPhone";
import type { AppInstance } from "@/stores/useAppStore";
import type { AppletViewerInitialData } from "@/apps/applet-viewer";
import {
  AnimatePresence,
  motion,
  LayoutGroup,
  useMotionValue,
  useSpring,
  useTransform,
  useIsPresent,
} from "framer-motion";

function MacDock() {
  const isPhone = useIsPhone();
  const { instances, instanceOrder, bringInstanceToForeground } =
    useAppStoreShallow((s) => ({
      instances: s.instances,
      instanceOrder: s.instanceOrder,
      bringInstanceToForeground: s.bringInstanceToForeground,
    }));

  const launchApp = useLaunchApp();
  const files = useFilesStore((s) => s.items);
  const trashIcon = useFilesStore(
    (s) => s.items["/Trash"]?.icon || "/icons/trash-empty.png"
  );
  const finderInstances = useFinderStore((s) => s.instances);

  // Helper to get applet info (icon and name) from instance
  const getAppletInfo = useCallback(
    (instance: AppInstance) => {
      const initialData = instance.initialData as
        | AppletViewerInitialData
        | undefined;
      const path = initialData?.path || "";
      const file = files[path];

      // Get filename from path for label
      const getFileName = (path: string): string => {
        const parts = path.split("/");
        const fileName = parts[parts.length - 1];
        return fileName.replace(/\.(html|app)$/i, "");
      };

      const label = path ? getFileName(path) : "Applet";

      // Check if the file icon is an emoji (not a file path)
      const fileIcon = file?.icon;
      const isEmojiIcon =
        fileIcon &&
        !fileIcon.startsWith("/") &&
        !fileIcon.startsWith("http") &&
        fileIcon.length <= 10;

      const icon = isEmojiIcon ? fileIcon : "📦";

      return { icon, label };
    },
    [files]
  );

  // Pinned apps on the left side (in order)
  const pinnedLeft: AppId[] = useMemo(
    () => ["finder", "chats", "internet-explorer"] as AppId[],
    []
  );

  // Compute open apps and individual applet instances
  const openItems = useMemo(() => {
    const items: Array<{
      type: "app" | "applet";
      appId: AppId;
      instanceId?: string;
      sortKey: number;
    }> = [];

    // Group instances by appId
    const openByApp: Record<string, AppInstance[]> = {};
    Object.values(instances)
      .filter((i) => i.isOpen)
      .forEach((i) => {
        if (!openByApp[i.appId]) openByApp[i.appId] = [];
        openByApp[i.appId].push(i);
      });

    // For each app, either add individual applet instances or a single app entry
    Object.entries(openByApp).forEach(([appId, instancesList]) => {
      if (appId === "applet-viewer") {
        // Add each applet instance separately
        instancesList.forEach((inst) => {
          items.push({
            type: "applet",
            appId: inst.appId as AppId,
            instanceId: inst.instanceId,
            sortKey: inst.createdAt || 0,
          });
        });
      } else {
        // Add a single entry for this app
        items.push({
          type: "app",
          appId: appId as AppId,
          sortKey: instancesList[0]?.createdAt ?? 0,
        });
      }
    });

    // Sort by creation time to keep a stable order
    items.sort((a, b) => a.sortKey - b.sortKey);
    
    // Filter out pinned apps
    return items.filter((item) => !pinnedLeft.includes(item.appId));
  }, [instances, pinnedLeft]);

  const openAppsAllSet = useMemo(() => {
    const set = new Set<AppId>();
    Object.values(instances).forEach((inst) => {
      if (inst.isOpen) set.add(inst.appId as AppId);
    });
    return set;
  }, [instances]);

  const focusMostRecentInstanceOfApp = (appId: AppId) => {
    // Walk instanceOrder from end to find most recent open instance for appId
    for (let i = instanceOrder.length - 1; i >= 0; i--) {
      const id = instanceOrder[i];
      const inst = instances[id];
      if (inst && inst.appId === appId && inst.isOpen) {
        bringInstanceToForeground(id);
        return;
      }
    }
    // No open instance found
  };

  const focusOrLaunchApp = useCallback(
    (appId: AppId, initialData?: unknown) => {
      // Try focusing existing instance of this app
      for (let i = instanceOrder.length - 1; i >= 0; i--) {
        const id = instanceOrder[i];
        const inst = instances[id];
        if (inst && inst.appId === appId && inst.isOpen) {
          bringInstanceToForeground(id);
          return;
        }
      }
      // Launch new
      launchApp(appId, initialData !== undefined ? { initialData } : undefined);
    },
    [instanceOrder, instances, bringInstanceToForeground, launchApp]
  );

  // Finder-specific: bring existing to foreground, otherwise launch one
  const focusOrLaunchFinder = useCallback(
    (initialPath?: string) => {
      // Try focusing existing Finder instance
      for (let i = instanceOrder.length - 1; i >= 0; i--) {
        const id = instanceOrder[i];
        const inst = instances[id];
        if (inst && inst.appId === "finder" && inst.isOpen) {
          bringInstanceToForeground(id);
          return;
        }
      }
      // None open; launch new Finder instance (multi-window supported by hook)
      if (initialPath) launchApp("finder", { initialPath });
      else launchApp("finder", { initialPath: "/" });
    },
    [instances, instanceOrder, bringInstanceToForeground, launchApp]
  );

  // Focus a Finder window already at targetPath (or its subpath); otherwise launch new Finder at targetPath
  const focusFinderAtPathOrLaunch = useCallback(
    (targetPath: string, initialData?: unknown) => {
      for (let i = instanceOrder.length - 1; i >= 0; i--) {
        const id = instanceOrder[i];
        const inst = instances[id];
        if (inst && inst.appId === "finder" && inst.isOpen) {
          const fi = finderInstances[id];
          if (
            fi &&
            (fi.currentPath === targetPath ||
              fi.currentPath.startsWith(targetPath + "/"))
          ) {
            bringInstanceToForeground(id);
            return;
          }
        }
      }
      launchApp("finder", {
        initialPath: targetPath,
        initialData: initialData,
      });
    },
    [
      instanceOrder,
      instances,
      finderInstances,
      bringInstanceToForeground,
      launchApp,
    ]
  );

  // Dock magnification state/logic driven by Framer motion value at container level
  const mouseX = useMotionValue<number>(Infinity);
  const MAX_SCALE = 2.3; // peak multiplier at cursor center
  const DISTANCE = 140; // px range where magnification is applied

  // Disable magnification on mobile/touch (coarse pointer or no hover)
  const [magnifyEnabled, setMagnifyEnabled] = useState(true);
  useEffect(() => {
    const compute = () => {
      if (
        typeof window === "undefined" ||
        typeof window.matchMedia !== "function"
      ) {
        setMagnifyEnabled(true);
        return;
      }
      const coarse = window.matchMedia("(pointer: coarse)").matches;
      const noHover = window.matchMedia("(hover: none)").matches;
      setMagnifyEnabled(!(coarse || noHover));
    };
    compute();

    const mqlPointerCoarse = window.matchMedia("(pointer: coarse)");
    const mqlHoverNone = window.matchMedia("(hover: none)");

    const onChange = () => compute();

    const removeListeners: Array<() => void> = [];

    const addListener = (mql: MediaQueryList) => {
      if (typeof mql.addEventListener === "function") {
        const listener = onChange as EventListener;
        mql.addEventListener("change", listener);
        removeListeners.push(() => mql.removeEventListener("change", listener));
      } else if (
        typeof (
          mql as {
            addListener?: (
              this: MediaQueryList,
              listener: (ev: MediaQueryListEvent) => void
            ) => void;
          }
        ).addListener === "function"
      ) {
        const legacyListener = () => onChange();
        (mql as MediaQueryList).addListener!(legacyListener);
        removeListeners.push(() =>
          (mql as MediaQueryList).removeListener!(legacyListener)
        );
      }
    };

    addListener(mqlPointerCoarse);
    addListener(mqlHoverNone);

    return () => {
      removeListeners.forEach((fn) => fn());
    };
  }, []);

  // Ensure no magnification state is applied when disabled
  useEffect(() => {
    if (!magnifyEnabled) mouseX.set(Infinity);
  }, [magnifyEnabled, mouseX]);

  // Track which icons have appeared before to control enter animations
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [hasMounted, setHasMounted] = useState(false);
  // Mark all currently visible ids as seen whenever the set changes
  const allVisibleIds = useMemo(() => {
    const ids = [
      ...pinnedLeft,
      ...openItems.map((item) =>
        item.type === "applet" ? item.instanceId! : item.appId
      ),
      "__applications__",
      "__trash__",
    ];
    return ids;
  }, [pinnedLeft, openItems]);
  // After first paint, mark everything present as seen and mark mounted
  // Also update seen set whenever visible ids change
  useEffect(() => {
    allVisibleIds.forEach((id) => seenIdsRef.current.add(id));
    if (!hasMounted) setHasMounted(true);
  }, [allVisibleIds, hasMounted]);

  // No global pointer listeners; container updates mouseX and resets to Infinity on leave

  // index tracking no longer needed; sizing is per-element via motion values

  const IconButton = forwardRef<
    HTMLDivElement,
    {
      label: string;
      onClick: () => void;
      icon: string;
      idKey: string;
      showIndicator?: boolean;
      isEmoji?: boolean;
    }
  >(
    (
      { label, onClick, icon, idKey, showIndicator = false, isEmoji = false },
      forwardedRef
    ) => {
      const isNew = hasMounted && !seenIdsRef.current.has(idKey);
      const baseButtonSize = 48; // px (w-12)
      const maxButtonSize = Math.round(baseButtonSize * MAX_SCALE);
      const wrapperRef = useRef<HTMLDivElement | null>(null);
      const isPresent = useIsPresent();
      const distanceCalc = useTransform(mouseX, (val) => {
        const bounds = wrapperRef.current?.getBoundingClientRect();
        if (!bounds || !Number.isFinite(val)) return Infinity;
        return val - (bounds.left + bounds.width / 2);
      });
      const sizeTransform = useTransform(
        distanceCalc,
        [-DISTANCE, 0, DISTANCE],
        [baseButtonSize, maxButtonSize, baseButtonSize]
      );
      const sizeSpring = useSpring(sizeTransform, {
        mass: 0.15,
        stiffness: 160,
        damping: 18,
      });
      const widthValue = isPresent
        ? magnifyEnabled
          ? sizeSpring
          : baseButtonSize
        : 0;

      // Scale factor for emoji to match magnification (relative to baseButtonSize)
      const emojiScale = useTransform(sizeSpring, (val) => val / baseButtonSize);
 
      const setCombinedRef = useCallback(
        (node: HTMLDivElement | null) => {
          wrapperRef.current = node;
          if (typeof forwardedRef === "function") {
            forwardedRef(node);
          } else if (forwardedRef && "current" in (forwardedRef as object)) {
            (
              forwardedRef as React.MutableRefObject<HTMLDivElement | null>
            ).current = node;
          }
        },
        [forwardedRef]
      );

      return (
        <motion.div
          ref={setCombinedRef}
          layout
          layoutId={`dock-icon-${idKey}`}
          initial={isNew ? { scale: 0, opacity: 0 } : undefined}
          animate={{ scale: 1, opacity: 1 }}
          exit={{
            scale: 0,
            opacity: 0,
          }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            mass: 0.8,
            layout: {
              type: "spring",
              stiffness: 300,
              damping: 30,
              mass: 0.8,
            },
          }}
          style={{
            transformOrigin: "bottom center",
            willChange: "width, height, transform",
            width: widthValue,
            height: widthValue,
            marginLeft: isPresent ? 4 : 0,
            marginRight: isPresent ? 4 : 0,
            overflow: "visible",
          }}
          className="flex-shrink-0"
        >
          <button
            aria-label={label}
            title={label}
            onClick={onClick}
            className="relative flex items-end justify-center w-full h-full"
            style={{
              willChange: "transform",
            }}
          >
            {isEmoji ? (
              <motion.span
                className="select-none pointer-events-none flex items-end justify-center"
                style={{
                  // Slightly larger base size so initial (non-hover) emoji isn't too small
                  fontSize: baseButtonSize * 0.8,
                  lineHeight: 1,
                  originY: 1,
                  originX: 0.5,
                  scale: magnifyEnabled ? emojiScale : 1,
                  // Lift a couple px so it's not too tight against the bottom
                  y: -5,
                  width: "100%",
                  height: "100%",
                }}
              >
                {icon}
              </motion.span>
            ) : (
              <ThemedIcon
                name={icon}
                alt={label}
                className="select-none pointer-events-none"
                draggable={false}
                style={{
                  imageRendering: "-webkit-optimize-contrast",
                  width: "100%",
                  height: "100%",
                }}
              />
            )}
            {showIndicator ? (
              <span
                aria-hidden
                className="absolute"
                style={{
                  bottom: -3,
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: "0",
                  borderBottom: "4px solid #000",
                  filter: "none",
                }}
              />
            ) : null}
          </button>
        </motion.div>
      );
    }
  );

  const Divider = forwardRef<HTMLDivElement, { idKey: string }>(
    ({ idKey }, ref) => (
      <motion.div
        ref={ref}
        layout
        layoutId={`dock-divider-${idKey}`}
        initial={{ opacity: 0, scaleY: 0.8 }}
        animate={{ opacity: 0.9, scaleY: 1 }}
        exit={{ opacity: 0, scaleY: 0.8 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="bg-black/20"
        style={{
          width: 1,
          height: 48,
          marginLeft: 6,
          marginRight: 6,
          alignSelf: "center",
        }}
      />
    )
  );

  return (
    <div
      className="fixed left-0 right-0 z-50"
      style={{
        bottom: 0,
        pointerEvents: "none",
      }}
    >
      <div
        className="flex w-full items-end justify-center"
        style={{
          paddingBottom: "env(safe-area-inset-bottom, 0px)",
        }}
      >
        <motion.div
          layout
          layoutRoot
          className="inline-flex items-end px-1 py-1"
          style={{
            pointerEvents: "auto",
            background: "rgba(248, 248, 248, 0.75)",
            backgroundImage: "var(--os-pinstripe-menubar)",
            border: "none",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
            height: 56,
            maxWidth: "min(92vw, 980px)",
            transformOrigin: "center bottom",
            borderRadius: "0px",
            overflowX: isPhone ? "auto" : "visible",
            overflowY: "visible",
            WebkitOverflowScrolling: isPhone ? "touch" : undefined,
            overscrollBehaviorX: isPhone ? "contain" : undefined,
          }}
          transition={{
            layout: {
              type: "spring",
              stiffness: 400,
              damping: 30,
            },
          }}
          onMouseMove={magnifyEnabled ? (e) => mouseX.set(e.clientX) : undefined}
          onMouseLeave={magnifyEnabled ? () => mouseX.set(Infinity) : undefined}
        >
          <LayoutGroup>
            <AnimatePresence mode="popLayout" initial={false}>
              {/* Left pinned */}
              {pinnedLeft.map((appId) => {
                const icon = getAppIconPath(appId);
                const isOpen = openAppsAllSet.has(appId);
                const label = appRegistry[appId]?.name ?? appId;
                return (
                  <IconButton
                    key={appId}
                    label={label}
                    icon={icon}
                    idKey={appId}
                    onClick={() => {
                      if (appId === "finder") {
                        focusOrLaunchFinder("/");
                      } else {
                        focusOrLaunchApp(appId);
                      }
                    }}
                    showIndicator={isOpen}
                  />
                );
              })}

              {/* Open apps and applet instances dynamically (excluding pinned) */}
              {openItems.map((item) => {
                if (item.type === "applet" && item.instanceId) {
                  // Render individual applet instance
                  const instance = instances[item.instanceId];
                  if (!instance) return null;

                  const { icon, label } = getAppletInfo(instance);
                  return (
                    <IconButton
                      key={item.instanceId}
                      label={label}
                      icon={icon}
                      idKey={item.instanceId}
                      onClick={() => bringInstanceToForeground(item.instanceId!)}
                      showIndicator
                      isEmoji
                    />
                  );
                } else {
                  // Render regular app
                  const icon = getAppIconPath(item.appId);
                  const label = appRegistry[item.appId]?.name ?? item.appId;
                  return (
                    <IconButton
                      key={item.appId}
                      label={label}
                      icon={icon}
                      idKey={item.appId}
                      onClick={() => focusMostRecentInstanceOfApp(item.appId)}
                      showIndicator
                    />
                  );
                }
              })}

              {/* Divider between open apps and Applications/Trash */}
              <Divider key="divider-between" idKey="between" />

              {/* Applications (left of Trash) */}
              <IconButton
                key="__applications__"
                label="Applications"
                icon="/icons/default/applications.png"
                idKey="__applications__"
                onClick={() =>
                  focusFinderAtPathOrLaunch("/Applications", {
                    path: "/Applications",
                    viewType: "large",
                  })
                }
              />

              {/* Trash (right side) */}
              {(() => {
                return (
                  <IconButton
                    key="__trash__"
                    label="Trash"
                    icon={trashIcon}
                    idKey="__trash__"
                    onClick={() => {
                      focusFinderAtPathOrLaunch("/Trash");
                    }}
                  />
                );
              })()}
            </AnimatePresence>
          </LayoutGroup>
        </motion.div>
      </div>
    </div>
  );
}

export function Dock() {
  const currentTheme = useThemeStore((s) => s.current);
  if (currentTheme !== "macosx") return null;
  return <MacDock />;
}
