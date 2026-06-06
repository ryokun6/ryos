import { motion, AnimatePresence } from "motion/react";
import type { Applet } from "../../utils/appletActions";
import {
  PREVIEW_SCALE_FACTOR,
  PREVIEW_Y_SPACING,
  PREVIEW_Z_SPACING,
  exitVariants,
} from "./constants";
import { AppStoreFeedCard, type AppStoreFeedCardProps } from "./AppStoreFeedCard";

export interface AppStoreFeedMotionStackProps {
  feedRef: React.RefObject<HTMLDivElement | null>;
  visibleApplets: Applet[];
  startIndex: number;
  currentIndex: number;
  applets: Applet[];
  navigationDirection: "forward" | "backward" | "none";
  scrollToIndex: (index: number) => void;
  appletContents: Map<string, string>;
  loadingContents: Set<string>;
  cardProps: Omit<
    AppStoreFeedCardProps,
    | "applet"
    | "index"
    | "currentIndex"
    | "appletsCount"
    | "content"
    | "isLoadingContent"
  >;
}

export function AppStoreFeedMotionStack({
  feedRef,
  visibleApplets,
  startIndex,
  currentIndex,
  applets,
  navigationDirection,
  scrollToIndex,
  appletContents,
  loadingContents,
  cardProps,
}: AppStoreFeedMotionStackProps) {
  return (
    <div
      ref={feedRef}
      className="h-full w-full overflow-hidden bg-black/20 flex items-center justify-center"
      style={{
        position: "relative",
        perspective: "calc(100vh * 1.25)",
        transformStyle: "preserve-3d",
      }}
    >
      <div
        className="relative w-full flex items-center justify-center"
        style={{
          transformStyle: "preserve-3d",
          height: "100%",
          maxHeight: "1200px",
        }}
      >
        <AnimatePresence initial={false} custom={navigationDirection}>
          {visibleApplets.map((applet, indexInSlice) => {
            const originalIndex = startIndex + indexInSlice;
            const distance = originalIndex - currentIndex;
            const opacity = 1 / (distance + 1);
            const zIndex = applets.length - originalIndex;

            return (
              <motion.div
                key={applet.id}
                className="absolute w-[90%] h-[75%] max-w-4xl rounded-2xl shadow-2xl overflow-hidden bg-white"
                style={{
                  boxShadow: "0 0 0 1px rgba(0,0,0,0.05)",
                  transformStyle: "preserve-3d",
                  clipPath: "inset(0 round 1rem)",
                  zIndex: zIndex,
                  transformOrigin: "center center",
                  rotateX: distance !== 0 ? -5 : 0,
                  pointerEvents: distance === 0 ? "auto" : "none",
                  maxHeight: "720px",
                  top: "12.5%",
                }}
                initial={(() => {
                  const base = {
                    z: distance * PREVIEW_Z_SPACING,
                    scale: 1 - distance * PREVIEW_SCALE_FACTOR,
                    y: distance * PREVIEW_Y_SPACING,
                    opacity: 0,
                  } as const;

                  if (distance === 0 && navigationDirection === "forward") {
                    return {
                      z: 50,
                      scale: 1.05,
                      y: -PREVIEW_Y_SPACING,
                      opacity: 0,
                    } as const;
                  }

                  return base;
                })()}
                animate={{
                  z: distance * PREVIEW_Z_SPACING,
                  y: distance * PREVIEW_Y_SPACING,
                  scale: 1 - distance * PREVIEW_SCALE_FACTOR,
                  opacity: opacity,
                }}
                variants={exitVariants}
                exit="exit"
                transition={{
                  type: "spring",
                  stiffness: 150,
                  damping: 25,
                }}
                drag={distance === 0 ? true : false}
                dragConstraints={{ top: 0, bottom: 0, left: 0, right: 0 }}
                dragElastic={0.4}
                dragPropagation={false}
                dragDirectionLock={true}
                dragMomentum={false}
                onDragStart={(event) => {
                  if (distance !== 0) return;

                  const target = event.target as HTMLElement;
                  const card = target.closest(
                    "[data-applet-card]"
                  ) as HTMLElement;
                  if (!card) return;

                  const cardRect = card.getBoundingClientRect();
                  const dragY =
                    "touches" in event
                      ? event.touches[0]?.clientY
                      : (event as MouseEvent).clientY;

                  (
                    card as HTMLElement & { __dragOnToolbar?: boolean }
                  ).__dragOnToolbar = dragY
                    ? dragY - cardRect.top < 60
                    : false;
                }}
                onDrag={(event, info) => {
                  if (distance !== 0) return;

                  const target = event.target as HTMLElement;
                  const card = target.closest(
                    "[data-applet-card]"
                  ) as HTMLElement & { _primaryDragAxis?: "x" | "y" };
                  if (card) {
                    const absX = Math.abs(info.offset.x);
                    const absY = Math.abs(info.offset.y);
                    card._primaryDragAxis = absX > absY ? "x" : "y";
                  }
                }}
                onDragEnd={(event, info) => {
                  if (distance !== 0) return;

                  const target = event.target as HTMLElement;
                  const card = target.closest("[data-applet-card]") as
                    | (HTMLElement & {
                        __dragOnToolbar?: boolean;
                        _primaryDragAxis?: "x" | "y";
                      })
                    | null;
                  const dragOnToolbar = card?.__dragOnToolbar;
                  const primaryAxis = card?._primaryDragAxis || "y";

                  if (primaryAxis === "x") {
                    const threshold = 30;
                    const velocity = info.velocity.x;

                    if (currentIndex < applets.length - 1) {
                      if (Math.abs(velocity) > 300) {
                        scrollToIndex(currentIndex + 1);
                        return;
                      }

                      if (Math.abs(info.offset.x) > threshold) {
                        scrollToIndex(currentIndex + 1);
                      }
                    }
                    return;
                  }

                  if (!dragOnToolbar) {
                    const iframe = card?.querySelector(
                      "iframe"
                    ) as HTMLIFrameElement;
                    if (iframe) {
                      try {
                        const iframeDoc =
                          iframe.contentDocument ||
                          iframe.contentWindow?.document;
                        if (iframeDoc) {
                          const scrollTop =
                            iframeDoc.documentElement.scrollTop ||
                            iframeDoc.body.scrollTop ||
                            0;
                          const scrollHeight =
                            iframeDoc.documentElement.scrollHeight ||
                            iframeDoc.body.scrollHeight ||
                            0;
                          const clientHeight =
                            iframeDoc.documentElement.clientHeight ||
                            iframeDoc.body.clientHeight ||
                            0;

                          const atTop = scrollTop <= 5;
                          const atBottom =
                            scrollTop + clientHeight >= scrollHeight - 5;
                          const canScroll = scrollHeight > clientHeight;

                          if (canScroll) {
                            const draggingUp = info.offset.y < 0;
                            const draggingDown = info.offset.y > 0;

                            if (
                              (draggingUp && !atTop) ||
                              (draggingDown && !atBottom)
                            ) {
                              return;
                            }
                          }
                        }
                      } catch {
                        // Cross-origin - allow navigation
                      }
                    }
                  }

                  const threshold = 30;
                  const velocity = info.velocity.y;

                  if (Math.abs(velocity) > 300) {
                    if (velocity > 0 && currentIndex < applets.length - 1) {
                      scrollToIndex(currentIndex + 1);
                    } else if (velocity < 0 && currentIndex > 0) {
                      scrollToIndex(currentIndex - 1);
                    }
                    return;
                  }

                  if (Math.abs(info.offset.y) > threshold) {
                    if (info.offset.y > 0 && currentIndex < applets.length - 1) {
                      scrollToIndex(currentIndex + 1);
                    } else if (info.offset.y < 0 && currentIndex > 0) {
                      scrollToIndex(currentIndex - 1);
                    }
                  }
                }}
                whileDrag={{
                  scale: 0.98,
                  transition: { duration: 0.1 },
                }}
              >
                <AppStoreFeedCard
                  {...cardProps}
                  applet={applet}
                  index={originalIndex}
                  currentIndex={currentIndex}
                  appletsCount={applets.length}
                  content={appletContents.get(applet.id)}
                  isLoadingContent={loadingContents.has(applet.id)}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
