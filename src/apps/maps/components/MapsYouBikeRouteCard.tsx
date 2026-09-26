import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bicycle, ListNumbers, PersonSimpleWalk, Play, Square, X } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import { resumeAudioContext } from "@/lib/audioContext";
import {
  AQUA_ICON_BUTTON_ICON_CLASS,
  AQUA_ICON_BUTTON_PADDING_CLASS,
  AQUA_ICON_BUTTON_PHOSPHOR_SIZE,
  AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT,
  AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE,
} from "@/lib/aquaIconButton";
import { Button } from "@/components/ui/button";
import {
  osCardClassName,
  osSubtleIconButtonClassName,
} from "@/components/shared/osThemePrimitives";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useYouBikeNavigationSpeech } from "../hooks/useYouBikeNavigationSpeech";
import type { GeoPoint, YouBikeRoutePlan, YouBikeRouteStep } from "../youbike";
import { youbikeNavigationFocusedIndex } from "../youbike/navigation";
import {
  listYouBikeRouteSteps,
  localizeYouBikeStepLabel,
  youbikeStepRemainingMeters,
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
  /** Live user point while Locate Me is tracking; used for remaining distance. */
  userLocation?: GeoPoint | null;
  /** Enable map user-location tracking when starting navigation. */
  onStartNavigation?: () => void;
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
          weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE}
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

function YouBikeNavigationFocus({
  current,
  currentIndex,
  upcoming,
  remainingMeters,
  onSelectCurrent,
  onSelectUpcoming,
}: {
  current: YouBikeRouteStep;
  currentIndex: number;
  upcoming: YouBikeRouteStep | null;
  remainingMeters: number | null;
  onSelectCurrent: () => void;
  onSelectUpcoming: () => void;
}) {
  const { t } = useTranslation();
  const CurrentIcon = current.mode === "bike" ? Bicycle : PersonSimpleWalk;
  const UpcomingIcon = upcoming
    ? upcoming.mode === "bike"
      ? Bicycle
      : PersonSimpleWalk
    : null;
  const currentLabel = localizeYouBikeStepLabel(current, t);
  const upcomingLabel = upcoming ? localizeYouBikeStepLabel(upcoming, t) : null;
  const currentMeta = formatDistance(
    remainingMeters ?? current.distanceMeters,
    t
  );

  return (
    <div
      className="flex flex-col gap-1.5"
      role="group"
      aria-label={t("apps.maps.youbike.navigationRegionLabel", {
        defaultValue: "Turn-by-turn navigation",
      })}
    >
      <button
        type="button"
        aria-current="step"
        aria-label={t("apps.maps.youbike.stepAria", {
          defaultValue: "Step {{index}}: {{label}}",
          index: currentIndex + 1,
          label: `${currentLabel}. ${currentMeta}`,
        })}
        onClick={onSelectCurrent}
        className={cn(
          "flex w-full items-start gap-2.5 rounded-os px-1.5 py-1.5 text-left",
          "bg-os-selection-bg text-os-selection-text",
          "focus:outline-none focus-visible:ring-1"
        )}
      >
        <CurrentIcon
          size={18}
          weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE}
          className="mt-0.5 shrink-0"
        />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug">
            {currentLabel}
          </div>
          <div className="text-[11px] leading-snug opacity-80">{currentMeta}</div>
        </div>
      </button>
      {upcoming && upcomingLabel && (
        <button
          type="button"
          aria-label={t("apps.maps.youbike.thenStepAria", {
            defaultValue: "Then {{label}}",
            label: upcomingLabel,
          })}
          onClick={onSelectUpcoming}
          className={cn(
            "flex w-full items-start gap-2 rounded-os px-1.5 py-1 text-left",
            "text-[11px] leading-snug text-os-text-secondary",
            "hover:bg-os-selection-bg/15 focus:outline-none focus-visible:ring-1"
          )}
        >
          {UpcomingIcon && (
            <UpcomingIcon
              size={14}
              weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE}
              className="mt-0.5 shrink-0 text-os-text-secondary"
            />
          )}
          <span className="shrink-0 font-medium text-os-text-secondary">
            {t("apps.maps.youbike.thenStep", { defaultValue: "Then" })}
          </span>
          <span className="min-w-0 font-medium text-os-text-primary">
            {upcomingLabel}
          </span>
        </button>
      )}
    </div>
  );
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
  userLocation = null,
  onStartNavigation,
}: MapsYouBikeRouteCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isWindowsTheme, isSystem7Theme, isWin98 } = useThemeFlags();
  const visible = !!plan || isRouting || !!error;
  const [showSteps, setShowSteps] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [manualIndex, setManualIndex] = useState(0);
  const steps = plan ? listYouBikeRouteSteps(plan) : [];
  const focusedIndex = youbikeNavigationFocusedIndex({
    stepCount: steps.length,
    gpsIndex: activeStepIndex,
    manualIndex,
  });
  const focusedStep = steps[focusedIndex] ?? null;
  const upcomingStep = steps[focusedIndex + 1] ?? null;
  const remainingMeters = focusedStep
    ? youbikeStepRemainingMeters(focusedStep, userLocation)
    : null;
  const buttonVariant = isMacOSTheme ? "aqua" : "retro";

  const labelForIndex = useCallback(
    (index: number) => {
      const step = steps[index];
      return step ? localizeYouBikeStepLabel(step, t) : "";
    },
    [steps, t]
  );
  const thenPhrase = useCallback(
    (label: string) =>
      t("apps.maps.youbike.speech.then", {
        defaultValue: "Then {{label}}",
        label,
      }),
    [t]
  );
  const { speakStart, speakManualAdvance, cancel } = useYouBikeNavigationSpeech({
    enabled: isNavigating,
    focusedIndex,
    stepCount: steps.length,
    remainingMeters,
    labelForIndex,
    thenPhrase,
  });

  useEffect(() => {
    setShowSteps(false);
    setSelectedIndex(null);
    setIsNavigating(false);
    setManualIndex(0);
    cancel();
  }, [plan, cancel]);

  const handleSelectStep = useCallback(
    (step: YouBikeRouteStep, index: number) => {
      setSelectedIndex(index);
      onSelectStep?.(step);
    },
    [onSelectStep]
  );

  const handleStartNavigation = useCallback(() => {
    if (steps.length === 0) return;
    const index = youbikeNavigationFocusedIndex({
      stepCount: steps.length,
      gpsIndex: activeStepIndex,
      manualIndex: 0,
    });
    onStartNavigation?.();
    setManualIndex(index);
    setSelectedIndex(index);
    setShowSteps(false);
    setIsNavigating(true);
    const step = steps[index];
    if (step) onSelectStep?.(step);
    // Resume the shared AudioContext in this tap so Chat / Ryo TTS can play.
    void resumeAudioContext();
    speakStart(index);
  }, [activeStepIndex, onSelectStep, onStartNavigation, speakStart, steps]);

  const handleStopNavigation = useCallback(() => {
    cancel();
    setIsNavigating(false);
  }, [cancel]);

  const handleClose = useCallback(() => {
    cancel();
    setIsNavigating(false);
    onClose();
  }, [cancel, onClose]);

  const stepsRef = useRef(steps);
  const onSelectStepRef = useRef(onSelectStep);
  stepsRef.current = steps;
  onSelectStepRef.current = onSelectStep;

  useEffect(() => {
    if (!isNavigating) return;
    const step = stepsRef.current[focusedIndex];
    if (step) onSelectStepRef.current?.(step);
  }, [focusedIndex, isNavigating]);

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
                onClick={handleClose}
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

            {plan && focusedStep && isNavigating && (
              <YouBikeNavigationFocus
                current={focusedStep}
                currentIndex={focusedIndex}
                upcoming={upcomingStep}
                remainingMeters={remainingMeters}
                onSelectCurrent={() => handleSelectStep(focusedStep, focusedIndex)}
                onSelectUpcoming={() => {
                  if (!upcomingStep) return;
                  const nextIndex = focusedIndex + 1;
                  setManualIndex(nextIndex);
                  setSelectedIndex(nextIndex);
                  handleSelectStep(upcomingStep, nextIndex);
                  speakManualAdvance(nextIndex);
                }}
              />
            )}

            {plan && steps.length > 0 && showSteps && !isNavigating && (
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

            <div className="flex flex-wrap items-center justify-end gap-2">
              {plan && steps.length > 0 && isNavigating && (
                <Button
                  type="button"
                  variant={buttonVariant}
                  size="sm"
                  onClick={handleStopNavigation}
                  className={AQUA_ICON_BUTTON_PADDING_CLASS}
                >
                  <Square
                    className={AQUA_ICON_BUTTON_ICON_CLASS}
                    size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
                    weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE}
                  />
                  <span>
                    {t("apps.maps.youbike.stopNavigation", {
                      defaultValue: "Stop Navigation",
                    })}
                  </span>
                </Button>
              )}
              {plan && steps.length > 0 && !isNavigating && (
                <Button
                  type="button"
                  variant={buttonVariant}
                  size="sm"
                  onClick={handleStartNavigation}
                  className={AQUA_ICON_BUTTON_PADDING_CLASS}
                >
                  <Play
                    className={AQUA_ICON_BUTTON_ICON_CLASS}
                    size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
                    weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT}
                  />
                  <span>
                    {t("apps.maps.youbike.startNavigation", {
                      defaultValue: "Start Navigation",
                    })}
                  </span>
                </Button>
              )}
              {plan && steps.length > 0 && !isNavigating && (
                <Button
                  type="button"
                  variant={buttonVariant}
                  size="sm"
                  aria-expanded={showSteps}
                  onClick={() => setShowSteps((open) => !open)}
                  className={AQUA_ICON_BUTTON_PADDING_CLASS}
                >
                  <ListNumbers
                    className={AQUA_ICON_BUTTON_ICON_CLASS}
                    size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
                    weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT}
                  />
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
                variant={buttonVariant}
                size="sm"
                onClick={handleClose}
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
