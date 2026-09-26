import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Car,
  DotsThree,
  ListNumbers,
  PersonSimpleWalk,
  Play,
  Square,
  TrainSimple,
  X,
} from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import {
  AQUA_ICON_BUTTON_ICON_CLASS,
  AQUA_ICON_BUTTON_PADDING_CLASS,
  AQUA_ICON_BUTTON_PHOSPHOR_SIZE,
  AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT,
  AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE,
} from "@/lib/aquaIconButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  osCardClassName,
  osSubtleIconButtonClassName,
} from "@/components/shared/osThemePrimitives";
import { useThemeFlags } from "@/hooks/useThemeFlags";
import { useYouBikeNavigationSpeech } from "../hooks/useYouBikeNavigationSpeech";
import { youbikeNavigationFocusedIndex } from "../youbike/navigation";
import {
  formatYouBikeStepLabel,
  youbikeStepRemainingMeters,
} from "../youbike/routeSteps";
import {
  directionsBadgeGradient,
  type DirectionsMode,
  type DirectionsRouteError,
  type DirectionsRoutePlan,
  type DirectionsRouteStep,
} from "../directions";
import { MapsExternalMapsMenuItems } from "./MapsExternalMapsMenuItems";

const STEPS_FADE_PX = 20;

const CARD_TRANSITION: Transition = {
  type: "spring",
  stiffness: 360,
  damping: 30,
  mass: 0.7,
};

export interface MapsDirectionsRouteCardProps {
  plan: DirectionsRoutePlan | null;
  isRouting: boolean;
  error: DirectionsRouteError | null;
  pendingMode?: DirectionsMode | null;
  fallbackDestination?: { latitude: number; longitude: number; name?: string } | null;
  onClose: () => void;
  onChangeMode: (mode: DirectionsMode) => void;
  onSelectStep?: (step: DirectionsRouteStep) => void;
  activeStepIndex?: number | null;
  userLocation?: { latitude: number; longitude: number } | null;
  followUserLocation?: boolean;
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

function StepIcon({
  kind,
  size,
  className,
}: {
  kind: DirectionsRouteStep["kind"];
  size: number;
  className?: string;
}) {
  const Icon =
    kind === "walk" ? PersonSimpleWalk : kind === "transit" ? TrainSimple : Car;
  return (
    <Icon
      size={size}
      weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT_ACTIVE}
      className={className}
    />
  );
}

function stepProgress(index: number, activeStepIndex: number | null): StepProgress {
  if (activeStepIndex == null) return "idle";
  if (index < activeStepIndex) return "past";
  if (index === activeStepIndex) return "current";
  return "later";
}

function RouteStepRow({
  step,
  index,
  progress,
  tapped,
  onSelect,
}: {
  step: DirectionsRouteStep;
  index: number;
  progress: StepProgress;
  tapped: boolean;
  onSelect: (step: DirectionsRouteStep, index: number) => void;
}) {
  const { t } = useTranslation();
  const label = formatYouBikeStepLabel(step);
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
        <StepIcon
          kind={step.kind}
          size={14}
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

function NavigationFocus({
  current,
  currentIndex,
  upcoming,
  remainingMeters,
  onSelectCurrent,
  onSelectUpcoming,
}: {
  current: DirectionsRouteStep;
  currentIndex: number;
  upcoming: DirectionsRouteStep | null;
  remainingMeters: number | null;
  onSelectCurrent: () => void;
  onSelectUpcoming: () => void;
}) {
  const { t } = useTranslation();
  const currentLabel = formatYouBikeStepLabel(current);
  const upcomingLabel = upcoming ? formatYouBikeStepLabel(upcoming) : null;
  const currentMeta = formatDistance(remainingMeters ?? current.distanceMeters, t);

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
        <StepIcon kind={current.kind} size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[15px] font-semibold leading-snug">{currentLabel}</div>
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
          <StepIcon
            kind={upcoming.kind}
            size={14}
            className="mt-0.5 shrink-0 text-os-text-secondary"
          />
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

function StepsList({
  steps,
  selectedIndex,
  activeStepIndex,
  onSelect,
}: {
  steps: DirectionsRouteStep[];
  selectedIndex: number | null;
  activeStepIndex: number | null;
  onSelect: (step: DirectionsRouteStep, index: number) => void;
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
          key={`${step.kind}-${index}`}
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

function ModeSwitcher({
  mode,
  disabled,
  onChange,
}: {
  mode: DirectionsMode;
  disabled: boolean;
  onChange: (mode: DirectionsMode) => void;
}) {
  const { t } = useTranslation();
  const { isMacOSTheme } = useThemeFlags();
  const variant = isMacOSTheme ? "aqua" : "retro";
  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="tablist"
      aria-label={t("apps.maps.directions.modeListLabel", {
        defaultValue: "Travel mode",
      })}
    >
      <Button
        type="button"
        variant={variant}
        size="sm"
        role="tab"
        aria-selected={mode === "drive"}
        disabled={disabled && mode !== "drive"}
        onClick={() => onChange("drive")}
        className={AQUA_ICON_BUTTON_PADDING_CLASS}
      >
        <Car
          size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
          weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT}
        />
        <span>
          {t("apps.maps.placeCard.drive", { defaultValue: "Drive" })}
        </span>
      </Button>
      <Button
        type="button"
        variant={variant}
        size="sm"
        role="tab"
        aria-selected={mode === "transit"}
        disabled={disabled && mode !== "transit"}
        onClick={() => onChange("transit")}
        className={AQUA_ICON_BUTTON_PADDING_CLASS}
      >
        <TrainSimple
          size={AQUA_ICON_BUTTON_PHOSPHOR_SIZE}
          weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT}
        />
        <span>
          {t("apps.maps.placeCard.transit", { defaultValue: "Transit" })}
        </span>
      </Button>
    </div>
  );
}

export function MapsDirectionsRouteCard({
  plan,
  isRouting,
  error,
  pendingMode = null,
  fallbackDestination = null,
  onClose,
  onChangeMode,
  onSelectStep,
  activeStepIndex = null,
  userLocation = null,
  followUserLocation = false,
  onStartNavigation,
}: MapsDirectionsRouteCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isWindowsTheme, isSystem7Theme, isWin98 } = useThemeFlags();
  const visible = !!plan || isRouting || !!error;
  const mode = plan?.mode ?? pendingMode ?? "drive";
  const [showSteps, setShowSteps] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [manualIndex, setManualIndex] = useState(0);
  const steps = plan?.steps ?? [];
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
  const HeaderIcon = mode === "transit" ? TrainSimple : Car;

  const labelForIndex = useCallback(
    (index: number) => {
      const step = steps[index];
      return step ? formatYouBikeStepLabel(step) : "";
    },
    [steps]
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
    (step: DirectionsRouteStep, index: number) => {
      setSelectedIndex(index);
      if (!followUserLocation) onSelectStep?.(step);
    },
    [followUserLocation, onSelectStep]
  );

  const handleStartNavigation = useCallback(() => {
    if (steps.length === 0) return;
    const index = youbikeNavigationFocusedIndex({
      stepCount: steps.length,
      gpsIndex: activeStepIndex,
      manualIndex: 0,
    });
    speakStart(index);
    onStartNavigation?.();
    setManualIndex(index);
    setSelectedIndex(index);
    setShowSteps(false);
    setIsNavigating(true);
    const step = steps[index];
    if (step && !followUserLocation) onSelectStep?.(step);
  }, [
    activeStepIndex,
    followUserLocation,
    onSelectStep,
    onStartNavigation,
    speakStart,
    steps,
  ]);

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
    if (!isNavigating || followUserLocation) return;
    const step = stepsRef.current[focusedIndex];
    if (step) onSelectStepRef.current?.(step);
  }, [focusedIndex, followUserLocation, isNavigating]);

  const title =
    mode === "transit"
      ? t("apps.maps.directions.transitTitle", {
          defaultValue: "Transit Directions",
        })
      : t("apps.maps.directions.driveTitle", {
          defaultValue: "Driving Directions",
        });
  const routingLabel =
    mode === "transit"
      ? t("apps.maps.directions.routingTransit", {
          defaultValue: "Finding a transit route…",
        })
      : t("apps.maps.directions.routingDrive", {
          defaultValue: "Finding a driving route…",
        });
  const errorLabel = error
    ? t(`apps.maps.directions.errors.${error}`, {
        defaultValue:
          error === "no_origin"
            ? "Turn on Locate Me or set Home to start directions."
            : error === "transit_unavailable"
              ? "Couldn't find a transit route from here."
              : "Couldn't find a route right now.",
      })
    : null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="maps-directions"
          role="region"
          aria-label={t("apps.maps.directions.routeRegionLabel", {
            defaultValue: "Directions",
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
                style={{ backgroundImage: directionsBadgeGradient(mode) }}
                aria-hidden="true"
              >
                <HeaderIcon size={20} weight="fill" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-semibold leading-tight text-os-text-primary">
                  {title}
                </div>
                <div className="text-[11px] leading-snug text-os-text-secondary">
                  {isRouting
                    ? routingLabel
                    : plan
                      ? t("apps.maps.youbike.routeSummary", {
                          defaultValue: "{{minutes}} min · {{distance}}",
                          minutes: formatDuration(plan.durationSeconds),
                          distance: formatDistance(plan.distanceMeters, t),
                        })
                      : errorLabel}
                </div>
              </div>
              {(plan || fallbackDestination) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title={t("apps.maps.placeCard.moreActions", {
                        defaultValue: "More",
                      })}
                      aria-label={t("apps.maps.placeCard.moreActions", {
                        defaultValue: "More",
                      })}
                      className={cn(
                        "inline-flex size-6 shrink-0 items-center justify-center rounded-full p-0",
                        "focus:outline-none focus-visible:ring-1",
                        osSubtleIconButtonClassName()
                      )}
                    >
                      <DotsThree size={16} weight="bold" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent side="top" align="end">
                    <MapsExternalMapsMenuItems
                      destination={plan?.destination ?? fallbackDestination!}
                      origin={plan?.origin}
                      mode={mode}
                      placeName={plan?.destinationLabel ?? fallbackDestination?.name}
                      asDirections
                      t={t}
                    />
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <button
                type="button"
                onClick={handleClose}
                className={cn(
                  "shrink-0 -mr-0.5 -mt-0.5 flex size-6 items-center justify-center rounded-full",
                  "focus:outline-none focus-visible:ring-1",
                  osSubtleIconButtonClassName()
                )}
                aria-label={t("apps.maps.directions.clearRoute", {
                  defaultValue: "Clear route",
                })}
              >
                <X size={12} weight="bold" />
              </button>
            </div>

            <ModeSwitcher mode={mode} disabled={isRouting} onChange={onChangeMode} />

            {plan && focusedStep && isNavigating && (
              <NavigationFocus
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
              <StepsList
                steps={steps}
                selectedIndex={selectedIndex}
                activeStepIndex={activeStepIndex}
                onSelect={handleSelectStep}
              />
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
                    weight={AQUA_ICON_BUTTON_PHOSPHOR_WEIGHT}
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
