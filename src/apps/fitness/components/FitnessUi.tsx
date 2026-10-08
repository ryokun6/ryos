import { useEffect, useId, useState, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { parseNumberInput } from "../utils/units";

export const FITNESS_CARD_CLASS =
  "rounded-md border border-black/10 bg-black/[0.025] p-3 dark:border-white/10 dark:bg-white/5";
export const FITNESS_CHIP_CLASS =
  "rounded-full border border-black/15 bg-black/[0.03] px-2 py-0.5 text-[11px] hover:bg-black/10 dark:border-white/20 dark:bg-white/5 dark:hover:bg-white/15";
export const FITNESS_MUTED_CLASS = "text-black/55 dark:text-white/55";
export const FITNESS_INPUT_CLASS = "h-6 px-1.5 text-[12px]";

export function Section({
  title,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn(FITNESS_CARD_CLASS, "flex flex-col gap-2", className)}>
      {title || actions ? (
        <div className="flex min-h-6 items-center justify-between gap-2">
          {title ? <h3 className="text-[12px] font-bold">{title}</h3> : <span />}
          {actions ? <div className="flex items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function ProgressBar({
  fraction,
  over = false,
  label,
  className,
}: {
  fraction: number;
  over?: boolean;
  label?: string;
  className?: string;
}) {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-black/10 dark:bg-white/15", className)}
    >
      <div
        className={cn(
          "h-full rounded-full transition-[width] duration-300",
          over ? "bg-orange-500" : "bg-emerald-500"
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export function EmptyNote({ children }: { children: ReactNode }) {
  return <p className={cn("py-2 text-center text-[12px]", FITNESS_MUTED_CLASS)}>{children}</p>;
}

/** Text input that edits a number; commits on blur/Enter, empty → null. */
export function NumberField({
  value,
  onCommit,
  label,
  placeholder,
  className,
  suffix,
  min = 0,
}: {
  value: number | null;
  onCommit: (value: number | null) => void;
  label: string;
  placeholder?: string;
  className?: string;
  suffix?: string;
  min?: number;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));
  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);
  const commit = () => {
    const parsed = parseNumberInput(draft);
    const next = parsed == null || parsed < min ? null : parsed;
    if (next !== value) onCommit(next);
    else setDraft(value == null ? "" : String(value));
  };
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Input
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        aria-label={label}
        title={label}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          }
        }}
        className={cn(FITNESS_INPUT_CLASS, "w-16 min-w-0")}
      />
      {suffix ? <span className={cn("text-[11px]", FITNESS_MUTED_CLASS)}>{suffix}</span> : null}
    </span>
  );
}

export function LabeledField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px]">
      <span className={FITNESS_MUTED_CLASS}>{label}</span>
      {children}
    </label>
  );
}

export function SmallSelect<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger
        className={cn("h-6 min-w-0 text-[11px]", className)}
        aria-label={label}
        title={label}
      >
        <SelectValue>{current?.label ?? value}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-[12px]">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export interface ChartPoint {
  date: string;
  value: number;
}

/** Dependency-free SVG line chart for small time series. */
export function LineChart({
  points,
  formatValue,
  formatDate,
  height = 120,
  label,
  target,
}: {
  points: readonly ChartPoint[];
  formatValue: (value: number) => string;
  formatDate: (date: string) => string;
  height?: number;
  label: string;
  target?: number | null;
}) {
  const gradientId = useId();
  const width = 320;
  const padX = 6;
  const padTop = 10;
  const padBottom = 6;
  const values = points.map((p) => p.value);
  if (target != null) values.push(target);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || Math.max(1, Math.abs(max) * 0.1);
  const lo = min - span * 0.1;
  const hi = max + span * 0.1;
  const x = (i: number) =>
    points.length === 1 ? width / 2 : padX + (i / (points.length - 1)) * (width - padX * 2);
  const y = (v: number) => padTop + (1 - (v - lo) / (hi - lo)) * (height - padTop - padBottom);
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area =
    points.length > 1
      ? `M${x(0).toFixed(1)},${height} L${line.replace(/ /g, " L")} L${x(points.length - 1).toFixed(1)},${height} Z`
      : "";
  const last = points[points.length - 1];

  return (
    <figure className="flex flex-col gap-1" aria-label={label}>
      <div className="flex items-baseline justify-between text-[11px]">
        <span className={FITNESS_MUTED_CLASS}>{formatValue(hi)}</span>
        {last ? <span className="font-bold">{formatValue(last.value)}</span> : null}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-auto w-full text-os-link"
        role="img"
        aria-label={label}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {target != null ? (
          <line
            x1={0}
            x2={width}
            y1={y(target)}
            y2={y(target)}
            stroke="currentColor"
            strokeOpacity={0.45}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
        {area ? <path d={area} fill={`url(#${gradientId})`} /> : null}
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle key={p.date} cx={x(i)} cy={y(p.value)} r={2.5} fill="currentColor">
            <title>{`${formatDate(p.date)}: ${formatValue(p.value)}`}</title>
          </circle>
        ))}
      </svg>
      <div className={cn("flex justify-between text-[10px]", FITNESS_MUTED_CLASS)}>
        <span>{points[0] ? formatDate(points[0].date) : ""}</span>
        <span>{formatValue(lo)}</span>
        <span>{last && points.length > 1 ? formatDate(last.date) : ""}</span>
      </div>
    </figure>
  );
}
