import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bicycle, ListNumbers, PersonSimpleWalk, X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  osCardClassName,
  osSubtleIconButtonClassName,
} from "@/components/shared/osThemePrimitives";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import type { YouBikeRoutePlan, YouBikeRouteStep } from "../youbike";
import {
  listYouBikeRouteSteps,
  localizeYouBikeStepLabel,
} from "../youbike/routeSteps";

const STEPS_FADE_PX = 20;

const CARD_TRANSITION: Transition = {
  type: "spring",
  stiffness: 360,
  damping: 30,
  mass: 0.7,
};

export interface MapsYouBikeRouteCardProps {
  plan: YouBikeRoutePlan | null;
  isRouting: boolean;
  error: string | null;
  onClose: () => void;
  onSelectStep?: (step: YouBikeRouteStep) => void;
  /** Step the rider is on while Locate Me is tracking. Null leaves tap styling only. */
  activeStepIndex?: number | null;
}

type StepProgress = "idle" | "past" | "current" | "later";

function formatDuration(seconds: number): string {
  const rounded = Math.max(1, Math.round(seconds / 60));
  return String(rounded);
}

function formatDistance(
  meters: number,
  t: (key: string, options?: Record<string, unknown>) => string
): string {
  if (meters >= 1000) {
    return t("apps.maps.youbike.distanceKilometers", {
      defaultValue: "{{distance}} km",
      distance: (meters / 1000).toFixed(1),
    });
  }
  return t("apps.maps.youbike.distanceMeters", {
    defaultValue: "{{distance}} m",
    distance: Math.round(meters),
  });
}

function stepsScrollMask(fadeTop: boolean, fadeBottom: boolean): string | undefined {
  if (fadeTop && fadeBottom) {
    return `linear-gradient(to bottom, transparent 0, #000 ${STEPS_FADE_PX}px, #000 calc(100% - ${STEPS_FADE_PX}px), transparent 100%)`;
  }
  if (fadeTop) {
    return `linear-gradient(to bottom, transparent 0, #000 ${STEPS_FADE_PX}px, #000 100%)`;
  }
  if (fadeBottom) {
    return `linear-gradient(to bottom, #000 0, #000 calc(100% - ${STEPS_FADE_PX}px), transparent 100%)`;
  }
  return undefined;
}

function RouteStepRow({
  step,
  index,
  progress,
  tapped,
  onSelect,
}: {
  step: YouBikeRouteStep;
  index: number;
  progress: StepProgress;
  tapped: boolean;
  onSelect: (step: YouBikeRouteStep, index: number) => void;
}) {
  const { t } = useTranslation();
  const Icon = step.mode === "bike" ? Bicycle : PersonSimpleWalk;
  const label = localizeYouBikeStepLabel(step, t);
  const distance = formatDistance(step.distanceMeters, t);
  const meta =
    step.durationSeconds >= 30
      ? t("apps.maps.youbike.legMeta", {
          defaultValue: "{{minutes}} min · {{distance}}",
          minutes: formatDuration(step.durationSeconds),
          distance,
        })
      : distance;
  const highlighted = progress === "current" || (progress === "idle" && tapped);
  return (
    <li>
      <button
        type="button"
        aria-current={highlighted ? "step" : undefined}
        aria-label={t("apps.maps.youbike.stepAria", {
          defaultValue: "Step {{index}}: {{label}}",
          index: index + 1,
          label: `${label}. ${meta}`,
        })}
        onClick={() => onSelect(step, index)}
        className={cn(
          "flex w-full items-start gap-2 rounded-os px-1.5 py-1 text-left text-[11px] leading-snug",
          "focus:outline-none focus-visible:ring-1",
          highlighted
            ? "bg-os-selection-bg text-os-selection-text"
            : "text-os-text-primary hover:bg-os-selection-bg/15",
          !highlighted && tapped && "bg-os-selection-bg/20",
          progress === "past" && "opacity-40"
        )}
      >
        <Icon
          size={14}
          weight="fill"
          className={cn(
            "mt-0.5 shrink-0",
            highlighted ? "text-os-selection-text" : "text-os-text-secondary"
          )}
        />
        <div className="min-w-0">
          <div className="font-medium">{label}</div>
          <div className={highlighted ? "opacity-80" : "text-os-text-secondary"}>
            {meta}
          </div>
        </div>
      </button>
    </li>
  );
}

function stepProgress(index: number, activeStepIndex: number | null): StepProgress {
  if (activeStepIndex == null) return "idle";
  if (index < activeStepIndex) return "past";
  if (index === activeStepIndex) return "current";
  return "later";
}

function YouBikeStepsList({
  steps,
  selectedIndex,
  activeStepIndex,
  onSelect,
}: {
  steps: YouBikeRouteStep[];
  selectedIndex: number | null;
  activeStepIndex: number | null;
  onSelect: (step: YouBikeRouteStep, index: number) => void;
}) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLOListElement>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });

  const updateFade = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    const canScroll = maxScroll > 1;
    const top = canScroll && el.scrollTop > 1;
    const bottom = canScroll && el.scrollTop < maxScroll - 1;
    setFade((prev) =>
      prev.top === top && prev.bottom === bottom ? prev : { top, bottom }
    );
  }, []);

  useLayoutEffect(() => {
    const list = scrollRef.current;
    if (list && activeStepIndex != null) {
      const row = list.children.item(activeStepIndex);
      if (row instanceof HTMLElement) {
        const listRect = list.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        if (rowRect.top < listRect.top) {
          list.scrollTop -= listRect.top - rowRect.top;
        } else if (rowRect.bottom > listRect.bottom) {
          list.scrollTop += rowRect.bottom - listRect.bottom;
        }
      }
    }
    updateFade();
  }, [activeStepIndex, steps.length, updateFade]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", updateFade, { passive: true });
    const observer = new ResizeObserver(() => updateFade());
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", updateFade);
      observer.disconnect();
    };
  }, [updateFade, steps.length]);

  const maskImage = stepsScrollMask(fade.top, fade.bottom);

  return (
    <ol
      ref={scrollRef}
      className="flex max-h-40 flex-col overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
      style={{ maskImage, WebkitMaskImage: maskImage }}
      aria-label={t("apps.maps.youbike.stepsRegionLabel", {
        defaultValue: "Turn-by-turn steps",
      })}
    >
      {steps.map((step, index) => (
        <RouteStepRow
          key={`${step.mode}-${index}`}
          step={step}
          index={index}
          progress={stepProgress(index, activeStepIndex)}
          tapped={selectedIndex === index}
          onSelect={onSelect}
        />
      ))}
    </ol>
  );
}

export function MapsYouBikeRouteCard({
  plan,
  isRouting,
  error,
  onClose,
  onSelectStep,
  activeStepIndex = null,
}: MapsYouBikeRouteCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isWindowsTheme, isSystem7Theme, isWin98 } = useThemeFlags();
  const visible = !!plan || isRouting || !!error;
  const [showSteps, setShowSteps] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const steps = plan ? listYouBikeRouteSteps(plan) : [];

  useEffect(() => {
    setShowSteps(false);
    setSelectedIndex(null);
  }, [plan]);

  const handleSelectStep = useCallback(
    (step: YouBikeRouteStep, index: number) => {
      setSelectedIndex(index);
      onSelectStep?.(step);
    },
    [onSelectStep]
  );

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="youbike-route"
          role="region"
          aria-label={t("apps.maps.youbike.routeRegionLabel", {
            defaultValue: "YouBike directions",
          })}
          className="pointer-events-auto relative w-full min-w-0 select-none"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={CARD_TRANSITION}
        >
          <div
            className={cn(
              osCardClassName(
                { isMacOSTheme, isSystem7Theme, isWindowsTheme, isWin98 },
                { embed: "panel" }
              ),
              "gap-2 p-3",
              isWindowsTheme && "shadow-md"
            )}
          >
            <div className="flex items-start gap-2.5">
              <div
                className="aqua-icon-badge flex size-9 shrink-0 items-center justify-center text-white"
                style={{
                  backgroundImage:
                    "linear-gradient(180deg, #7CB518 0%, color-mix(in srgb, #7CB518 82%, #4d7c0f) 100%)",
                }}
                aria-hidden="true"
              >
                <Bicycle size={20} weight="fill" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold leading-tight text-os-text-primary">
                  {t("apps.maps.youbike.routeTitle", {
                    defaultValue: "YouBike Directions",
                  })}
                </div>
                <div className="text-[11px] leading-snug text-os-text-secondary">
                  {isRouting
                    ? t("apps.maps.youbike.routing", {
                        defaultValue: "Finding a YouBike trip…",
                      })
                    : plan
                      ? t("apps.maps.youbike.routeSummary", {
                          defaultValue: "{{minutes}} min · {{distance}}",
                          minutes: formatDuration(plan.totalDurationSeconds),
                          distance: formatDistance(plan.totalDistanceMeters, t),
                        })
                      : error
                        ? t(`apps.maps.youbike.errors.${error}`, {
                            defaultValue:
                              "Couldn't plan a YouBike trip from here.",
                          })
                        : null}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className={cn(
                  "shrink-0 -mr-0.5 -mt-0.5 flex size-6 items-center justify-center rounded-full",
                  "focus:outline-none focus-visible:ring-1",
                  osSubtleIconButtonClassName()
                )}
                aria-label={t("apps.maps.youbike.clearRoute", {
                  defaultValue: "Clear YouBike route",
                })}
              >
                <X size={12} weight="bold" />
              </button>
            </div>

            {plan && steps.length > 0 && showSteps && (
              <YouBikeStepsList
                steps={steps}
                selectedIndex={selectedIndex}
                activeStepIndex={activeStepIndex}
                onSelect={handleSelectStep}
              />
            )}

            {plan?.warnings.includes("origin_station_no_bikes") && (
              <div className="text-[11px] text-os-text-secondary">
                {t("apps.maps.youbike.warningNoBikes", {
                  defaultValue:
                    "The nearest start station may have no bikes right now.",
                })}
              </div>
            )}
            {plan?.warnings.includes("destination_station_no_docks") && (
              <div className="text-[11px] text-os-text-secondary">
                {t("apps.maps.youbike.warningNoDocks", {
                  defaultValue:
                    "The nearest end station may have no empty docks right now.",
                })}
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              {plan && steps.length > 0 && (
                <Button
                  type="button"
                  variant={isMacOSTheme ? "aqua" : "retro"}
                  size="sm"
                  aria-expanded={showSteps}
                  onClick={() => setShowSteps((open) => !open)}
                >
                  <ListNumbers size={14} weight="bold" />
                  {showSteps
                    ? t("apps.maps.youbike.hideSteps", {
                        defaultValue: "Hide Steps",
                      })
                    : t("apps.maps.youbike.showSteps", {
                        defaultValue: "Show Steps",
                      })}
                </Button>
              )}
              <Button
                type="button"
                variant={isMacOSTheme ? "aqua" : "retro"}
                size="sm"
                onClick={onClose}
              >
                {t("apps.maps.youbike.done", { defaultValue: "Done" })}
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
