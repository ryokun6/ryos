export type DateTimePaneContentProps = {
  t: (key: string, opts?: Record<string, unknown>) => string;
};

export function DateTimePaneContent({ t }: DateTimePaneContentProps) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const now = new Date().toLocaleString();

  return (
    <div className="control-panels-pref-form h-full overflow-y-auto">
      <div className="control-panels-pref-well space-y-3">
        <p className="text-[11px] text-neutral-600 font-geneva-12 leading-relaxed">
          {t("apps.control-panels.dateTimeDescription")}
        </p>
        <dl className="space-y-2 text-[11px] font-geneva-12">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-600">{t("apps.control-panels.timeZone")}</dt>
            <dd className="font-medium text-right">{timeZone}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-600">{t("apps.control-panels.currentTime")}</dt>
            <dd className="font-medium text-right">{now}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
