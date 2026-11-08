import { useState } from "react";
import { toast } from "sonner";
import { useFitnessStore } from "@/stores/useFitnessStore";
import type { FitnessLogic } from "../hooks/useFitnessLogic";
import { formatShortDate } from "../utils/format";
import { WORKOUT_TEMPLATE_IDS, type WorkoutTemplateId } from "../utils/workoutTemplates";
import { SmallSelect } from "./FitnessUi";

/** One click appends a full session template to `date` without replacing entries already there. */
export function AddWorkoutTemplate({ l, date }: { l: FitnessLogic; date: string }) {
  const { t, locale } = l;
  const [value, setValue] = useState<WorkoutTemplateId | "">("");

  return (
    <SmallSelect<WorkoutTemplateId | "">
      label={t("apps.fitness.workoutTemplates.add")}
      placeholder={t("apps.fitness.workoutTemplates.add")}
      value={value}
      className="w-auto min-w-max shrink-0"
      onChange={(next) => {
        if (!next) return;
        setValue("");
        const { added } = useFitnessStore.getState().applyWorkoutTemplate(date, next);
        const name = t(`apps.fitness.workoutTemplates.${next}`);
        const day = formatShortDate(date, locale);
        toast.success(
          added > 0
            ? t("apps.fitness.toasts.workoutTemplateAdded", { name, date: day })
            : t("apps.fitness.toasts.workoutTemplatePresent", { name, date: day })
        );
      }}
      options={WORKOUT_TEMPLATE_IDS.map((id) => ({
        value: id,
        label: t(`apps.fitness.workoutTemplates.${id}`),
      }))}
    />
  );
}
