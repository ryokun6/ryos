import { useEffect, useState } from "react";
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
  formatYouBikeStepLabel,
  listYouBikeRouteSteps,
} from "../youbike/routeSteps";

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
}

function formatDuration(seconds: number): string {
  const rounded = Math.max(1, Math.round(seconds / 60));
  return String(rounded);
}

function RouteStepRow({ step }: { step: YouBikeRouteStep }) {
  const { t } = useTranslation();
  const Icon = step.mode === "bike" ? Bicycle : PersonSimpleWalk;
  return (
    <li className="flex items-start gap-2 text-[11px] leading-snug text-os-text-primary">
      <Icon
        size={14}
        weight="fill"
        className="mt-0.5 shrink-0 text-os-text-secondary"
      />
      <div className="min-w-0">
        <div className="font-medium">{formatYouBikeStepLabel(step)}</div>
        <div className="text-os-text-secondary">
          {step.durationSeconds >= 30
            ? t("apps.maps.youbike.legMeta", {
                defaultValue: "{{minutes}} min · {{distance}}",
                minutes: formatDuration(step.durationSeconds),
                distance: formatDistance(step.distanceMeters),
              })
            : formatDistance(step.distanceMeters)}
        </div>
      </div>
    </li>
  );
}

function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function MapsYouBikeRouteCard({
  plan,
  isRouting,
  error,
  onClose,
}: MapsYouBikeRouteCardProps) {
  const { t } = useTranslation();
  const { isMacOSTheme, isWindowsTheme, isSystem7Theme, isWin98 } = useThemeFlags();
  const visible = !!plan || isRouting || !!error;
  const [showSteps, setShowSteps] = useState(false);
  const steps = plan ? listYouBikeRouteSteps(plan) : [];

  useEffect(() => {
    setShowSteps(false);
  }, [plan]);

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
                          distance: formatDistance(plan.totalDistanceMeters),
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
              <ol
                className="flex max-h-40 flex-col gap-1.5 overflow-y-auto"
                aria-label={t("apps.maps.youbike.stepsRegionLabel", {
                  defaultValue: "Turn-by-turn steps",
                })}
              >
                {steps.map((step, index) => (
                  <RouteStepRow key={`${step.mode}-${index}`} step={step} />
                ))}
              </ol>
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
                        defaultValue: "Hide steps",
                      })
                    : t("apps.maps.youbike.showSteps", {
                        defaultValue: "Steps",
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
