import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowsLeftRight } from "@phosphor-icons/react";
import { useThemeStore } from "@/stores/useThemeStore";
import { useDashboardStore, type ConverterWidgetConfig } from "@/stores/useDashboardStore";

interface ConverterWidgetProps {
  widgetId: string;
}

type ConverterCategory = NonNullable<ConverterWidgetConfig["category"]>;

interface LinearUnitDefinition {
  key: string;
  label: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
}

interface CategoryDefinition {
  label: string;
  units: LinearUnitDefinition[];
}

function formatResult(value: number, precision: number): string {
  if (!Number.isFinite(value)) return "";
  const fixed = value.toFixed(precision);
  return fixed.replace(/\.?0+$/, "");
}

export function ConverterWidget({ widgetId }: ConverterWidgetProps) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as ConverterWidgetConfig | undefined;

  const categories = useMemo<Record<ConverterCategory, CategoryDefinition>>(
    () => ({
      speed: {
        label: t("apps.dashboard.converter.categories.speed", "Speed"),
        units: [
          { key: "mph", label: t("apps.dashboard.converter.units.mph", "Miles/Hour"), toBase: (v) => v, fromBase: (v) => v },
          { key: "kmh", label: t("apps.dashboard.converter.units.kmh", "Kilometers/Hour"), toBase: (v) => v / 1.609344, fromBase: (v) => v * 1.609344 },
          { key: "ms", label: t("apps.dashboard.converter.units.ms", "Meters/Second"), toBase: (v) => v / 0.44704, fromBase: (v) => v * 0.44704 },
          { key: "knot", label: t("apps.dashboard.converter.units.knot", "Knots"), toBase: (v) => v / 0.868976, fromBase: (v) => v * 0.868976 },
        ],
      },
      length: {
        label: t("apps.dashboard.converter.categories.length", "Length"),
        units: [
          { key: "mm", label: t("apps.dashboard.converter.units.mm", "Millimeters"), toBase: (v) => v / 1000, fromBase: (v) => v * 1000 },
          { key: "cm", label: t("apps.dashboard.converter.units.cm", "Centimeters"), toBase: (v) => v / 100, fromBase: (v) => v * 100 },
          { key: "m", label: t("apps.dashboard.converter.units.m", "Meters"), toBase: (v) => v, fromBase: (v) => v },
          { key: "km", label: t("apps.dashboard.converter.units.km", "Kilometers"), toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
          { key: "in", label: t("apps.dashboard.converter.units.in", "Inches"), toBase: (v) => v * 0.0254, fromBase: (v) => v / 0.0254 },
          { key: "ft", label: t("apps.dashboard.converter.units.ft", "Feet"), toBase: (v) => v * 0.3048, fromBase: (v) => v / 0.3048 },
          { key: "yd", label: t("apps.dashboard.converter.units.yd", "Yards"), toBase: (v) => v * 0.9144, fromBase: (v) => v / 0.9144 },
          { key: "mi", label: t("apps.dashboard.converter.units.mi", "Miles"), toBase: (v) => v * 1609.344, fromBase: (v) => v / 1609.344 },
        ],
      },
      weight: {
        label: t("apps.dashboard.converter.categories.weight", "Weight"),
        units: [
          { key: "g", label: t("apps.dashboard.converter.units.g", "Grams"), toBase: (v) => v, fromBase: (v) => v },
          { key: "kg", label: t("apps.dashboard.converter.units.kg", "Kilograms"), toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
          { key: "lb", label: t("apps.dashboard.converter.units.lb", "Pounds"), toBase: (v) => v * 453.59237, fromBase: (v) => v / 453.59237 },
          { key: "oz", label: t("apps.dashboard.converter.units.oz", "Ounces"), toBase: (v) => v * 28.349523125, fromBase: (v) => v / 28.349523125 },
        ],
      },
      temperature: {
        label: t("apps.dashboard.converter.categories.temperature", "Temperature"),
        units: [
          { key: "c", label: t("apps.dashboard.converter.units.c", "Celsius"), toBase: (v) => v, fromBase: (v) => v },
          { key: "f", label: t("apps.dashboard.converter.units.f", "Fahrenheit"), toBase: (v) => (v - 32) / 1.8, fromBase: (v) => v * 1.8 + 32 },
          { key: "k", label: t("apps.dashboard.converter.units.k", "Kelvin"), toBase: (v) => v - 273.15, fromBase: (v) => v + 273.15 },
        ],
      },
      volume: {
        label: t("apps.dashboard.converter.categories.volume", "Volume"),
        units: [
          { key: "ml", label: t("apps.dashboard.converter.units.ml", "Milliliters"), toBase: (v) => v, fromBase: (v) => v },
          { key: "l", label: t("apps.dashboard.converter.units.l", "Liters"), toBase: (v) => v * 1000, fromBase: (v) => v / 1000 },
          { key: "cup", label: t("apps.dashboard.converter.units.cup", "Cups"), toBase: (v) => v * 236.5882365, fromBase: (v) => v / 236.5882365 },
          { key: "floz", label: t("apps.dashboard.converter.units.floz", "Fluid Ounces"), toBase: (v) => v * 29.5735295625, fromBase: (v) => v / 29.5735295625 },
          { key: "gal", label: t("apps.dashboard.converter.units.gal", "Gallons"), toBase: (v) => v * 3785.411784, fromBase: (v) => v / 3785.411784 },
        ],
      },
      data: {
        label: t("apps.dashboard.converter.categories.data", "Data"),
        units: [
          { key: "b", label: t("apps.dashboard.converter.units.b", "Bytes"), toBase: (v) => v, fromBase: (v) => v },
          { key: "kb", label: t("apps.dashboard.converter.units.kb", "Kilobytes"), toBase: (v) => v * 1024, fromBase: (v) => v / 1024 },
          { key: "mb", label: t("apps.dashboard.converter.units.mb", "Megabytes"), toBase: (v) => v * 1024 * 1024, fromBase: (v) => v / (1024 * 1024) },
          { key: "gb", label: t("apps.dashboard.converter.units.gb", "Gigabytes"), toBase: (v) => v * 1024 * 1024 * 1024, fromBase: (v) => v / (1024 * 1024 * 1024) },
          { key: "tb", label: t("apps.dashboard.converter.units.tb", "Terabytes"), toBase: (v) => v * 1024 * 1024 * 1024 * 1024, fromBase: (v) => v / (1024 * 1024 * 1024 * 1024) },
        ],
      },
    }),
    [t]
  );

  const [category, setCategory] = useState<ConverterCategory>(config?.category ?? "speed");
  const defaultFrom = config?.fromUnit ?? "mph";
  const defaultTo = config?.toUnit ?? "kmh";
  const [fromUnit, setFromUnit] = useState(defaultFrom);
  const [toUnit, setToUnit] = useState(defaultTo);
  const [value, setValue] = useState(config?.value ?? "65");
  const precision = config?.precision ?? 5;

  useEffect(() => {
    if (config?.category && config.category !== category) setCategory(config.category);
    if (config?.fromUnit && config.fromUnit !== fromUnit) setFromUnit(config.fromUnit);
    if (config?.toUnit && config.toUnit !== toUnit) setToUnit(config.toUnit);
    if (config?.value !== undefined && config.value !== value) setValue(config.value);
  }, [category, config?.category, config?.fromUnit, config?.toUnit, config?.value, fromUnit, toUnit, value]);

  const syncConfig = useCallback(
    (updates: Partial<ConverterWidgetConfig>) => {
      updateWidgetConfig(widgetId, {
        ...(config ?? {}),
        category,
        fromUnit,
        toUnit,
        value,
        precision,
        ...updates,
      } as ConverterWidgetConfig);
    },
    [category, config, fromUnit, precision, toUnit, updateWidgetConfig, value, widgetId]
  );

  const currentUnits = categories[category].units;
  const validFrom = currentUnits.some((unit) => unit.key === fromUnit) ? fromUnit : currentUnits[0].key;
  const validTo = currentUnits.some((unit) => unit.key === toUnit)
    ? toUnit
    : currentUnits[Math.min(1, currentUnits.length - 1)].key;

  const converted = useMemo(() => {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return "";
    const sourceUnit = currentUnits.find((unit) => unit.key === validFrom) ?? currentUnits[0];
    const targetUnit = currentUnits.find((unit) => unit.key === validTo) ?? currentUnits[1] ?? currentUnits[0];
    return formatResult(targetUnit.fromBase(sourceUnit.toBase(parsed)), precision);
  }, [currentUnits, precision, validFrom, validTo, value]);

  const handleCategoryChange = useCallback(
    (nextCategory: ConverterCategory) => {
      const nextUnits = categories[nextCategory].units;
      const nextFrom = nextUnits[0].key;
      const nextTo = nextUnits[Math.min(1, nextUnits.length - 1)].key;
      setCategory(nextCategory);
      setFromUnit(nextFrom);
      setToUnit(nextTo);
      syncConfig({ category: nextCategory, fromUnit: nextFrom, toUnit: nextTo });
    },
    [categories, syncConfig]
  );

  const handleSwap = useCallback(() => {
    setFromUnit(validTo);
    setToUnit(validFrom);
    syncConfig({ fromUnit: validTo, toUnit: validFrom });
  }, [syncConfig, validFrom, validTo]);

  if (isXpTheme) {
    return (
      <div
        className="flex h-full flex-col gap-2 p-2"
        onPointerDown={(e) => e.stopPropagation()}
        style={{ background: "#ECE9D8", borderRadius: "inherit", fontFamily: "Tahoma, sans-serif" }}
      >
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-bold text-[#4B4B4B]">
            {t("apps.dashboard.converter.convert", "Convert")}
          </label>
          <select
            value={category}
            onChange={(e) => handleCategoryChange(e.target.value as ConverterCategory)}
            style={{ flex: 1, border: "1px solid #ACA899", background: "#FFF", fontSize: 11 }}
          >
            {Object.entries(categories).map(([key, definition]) => (
              <option key={key} value={key}>
                {definition.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
          <select
            value={validFrom}
            onChange={(e) => {
              setFromUnit(e.target.value);
              syncConfig({ fromUnit: e.target.value });
            }}
            style={{ border: "1px solid #ACA899", background: "#FFF", fontSize: 11 }}
          >
            {currentUnits.map((unit) => (
              <option key={unit.key} value={unit.key}>
                {unit.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSwap}
            style={{ border: "1px solid #ACA899", background: "#ECE9D8", padding: "0 6px" }}
          >
            <ArrowsLeftRight size={12} />
          </button>
          <select
            value={validTo}
            onChange={(e) => {
              setToUnit(e.target.value);
              syncConfig({ toUnit: e.target.value });
            }}
            style={{ border: "1px solid #ACA899", background: "#FFF", fontSize: 11 }}
          >
            {currentUnits.map((unit) => (
              <option key={unit.key} value={unit.key}>
                {unit.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid flex-1 grid-cols-[1fr_auto_1fr] items-center gap-2">
          <input
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              syncConfig({ value: e.target.value });
            }}
            style={{ border: "1px solid #ACA899", background: "#FFF", padding: "4px 6px", fontSize: 14 }}
          />
          <span className="text-[12px] font-bold text-[#555]">=</span>
          <div style={{ border: "1px solid #ACA899", background: "#FFF", padding: "4px 6px", fontSize: 14 }}>
            {converted}
          </div>
        </div>
      </div>
    );
  }

  const chromeBorder = "1px solid rgba(79,79,79,0.46)";
  const controlStyle = {
    borderRadius: 4,
    border: "1px solid #9a9a9a",
    background: "linear-gradient(180deg, #fbfbfb 0%, #d8d8d8 100%)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.96), inset 0 -1px 1px rgba(0,0,0,0.18)",
    color: "#444",
  } as const;

  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        minHeight: "inherit",
        borderRadius: "inherit",
        overflow: "hidden",
        background:
          "linear-gradient(180deg, #f4f4f4 0%, #dadada 22%, #c8c8c8 46%, #b4b4b4 100%)",
        border: chromeBorder,
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.98), inset 0 -1px 0 rgba(80,80,80,0.28), 0 12px 20px rgba(0,0,0,0.2)",
        fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.16) 0 1px, rgba(0,0,0,0.02) 1px 3px, transparent 3px 7px)",
          opacity: 0.2,
          pointerEvents: "none",
        }}
      />
      <div
        style={{
          height: 20,
          position: "relative",
          background:
            "linear-gradient(180deg, #9a9a9a 0%, #7f7f7f 24%, #5d5d5d 24%, #484848 100%)",
          borderBottom: "1px solid rgba(0,0,0,0.35)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: "2px 10px 5px",
            background:
              "repeating-linear-gradient(90deg, rgba(255,255,255,0.28) 0 1px, transparent 1px 10px, rgba(0,0,0,0.26) 10px 11px)",
            opacity: 0.78,
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: -6,
            transform: "translateX(-50%)",
            width: 18,
            height: 18,
            borderRadius: "50%",
            background: "linear-gradient(180deg, #ffd49f 0%, #ff8e18 55%, #de5800 100%)",
            border: "1px solid rgba(133,55,0,0.6)",
            boxShadow:
              "0 2px 5px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.75), 0 0 6px rgba(255,156,48,0.35)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 2,
            transform: "translateX(-50%)",
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "rgba(255,255,255,0.7)",
            filter: "blur(0.4px)",
          }}
        />
      </div>

      <div
        style={{
          height: "calc(100% - 20px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px 14px 12px",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 248,
            display: "grid",
            gap: 8,
            margin: "0 auto",
          }}
        >
          <div className="grid grid-cols-[54px_minmax(0,1fr)] items-center gap-2">
            <div
              style={{
                fontSize: 12,
                color: "#4b4b4b",
                textShadow: "0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              {t("apps.dashboard.converter.convert", "Convert")}
            </div>
            <select
              value={category}
              onChange={(e) => handleCategoryChange(e.target.value as ConverterCategory)}
              onPointerDown={(e) => e.stopPropagation()}
              style={{
                ...controlStyle,
                height: 24,
                padding: "0 8px",
                fontSize: 12,
              }}
            >
              {Object.entries(categories).map(([key, definition]) => (
                <option key={key} value={key}>
                  {definition.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-2">
            <div className="flex flex-col gap-1.5">
              <select
                value={validFrom}
                onChange={(e) => {
                  setFromUnit(e.target.value);
                  syncConfig({ fromUnit: e.target.value });
                }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  ...controlStyle,
                  height: 22,
                  padding: "0 8px",
                  fontSize: 11,
                }}
              >
                {currentUnits.map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </select>
              <input
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  syncConfig({ value: e.target.value });
                }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  ...controlStyle,
                  height: 30,
                  padding: "0 8px",
                  fontSize: 15,
                  background: "linear-gradient(180deg, #ffffff 0%, #ececec 100%)",
                }}
              />
            </div>

            <button
              type="button"
              onClick={handleSwap}
              onPointerDown={(e) => e.stopPropagation()}
              title={t("apps.dashboard.converter.swap", "Swap units")}
              style={{
                width: 20,
                height: 20,
                borderRadius: "50%",
                border: "1px solid rgba(119,119,119,0.6)",
                background: "linear-gradient(180deg, #fafafa 0%, #d0d0d0 100%)",
                color: "#4d4d4d",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 1px rgba(0,0,0,0.18)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                justifySelf: "center",
              }}
            >
              <ArrowsLeftRight size={11} weight="bold" />
            </button>

            <div className="flex flex-col gap-1.5">
              <select
                value={validTo}
                onChange={(e) => {
                  setToUnit(e.target.value);
                  syncConfig({ toUnit: e.target.value });
                }}
                onPointerDown={(e) => e.stopPropagation()}
                style={{
                  ...controlStyle,
                  height: 22,
                  padding: "0 8px",
                  fontSize: 11,
                }}
              >
                {currentUnits.map((unit) => (
                  <option key={unit.key} value={unit.key}>
                    {unit.label}
                  </option>
                ))}
              </select>
              <div
                style={{
                  ...controlStyle,
                  height: 30,
                  padding: "0 8px",
                  fontSize: 15,
                  background: "linear-gradient(180deg, #ffffff 0%, #ececec 100%)",
                  display: "flex",
                  alignItems: "center",
                  color: "#4b4b4b",
                }}
              >
                {converted}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConverterBackPanel({
  widgetId,
  onDone,
}: {
  widgetId: string;
  onDone?: () => void;
}) {
  const { t } = useTranslation();
  const currentTheme = useThemeStore((state) => state.current);
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";
  const widget = useDashboardStore((s) => s.widgets.find((w) => w.id === widgetId));
  const updateWidgetConfig = useDashboardStore((s) => s.updateWidgetConfig);
  const config = widget?.config as ConverterWidgetConfig | undefined;
  const precision = config?.precision ?? 5;

  const updatePrecision = useCallback(
    (nextPrecision: number) => {
      updateWidgetConfig(widgetId, {
        ...(config ?? {}),
        precision: nextPrecision,
      } as ConverterWidgetConfig);
      onDone?.();
    },
    [config, onDone, updateWidgetConfig, widgetId]
  );

  const resetDefaults = useCallback(() => {
    updateWidgetConfig(widgetId, {
      ...(config ?? {}),
      category: "speed",
      fromUnit: "mph",
      toUnit: "kmh",
      value: "65",
      precision: 5,
    } as ConverterWidgetConfig);
    onDone?.();
  }, [config, onDone, updateWidgetConfig, widgetId]);

  return (
    <div
      className="flex h-full flex-col justify-center gap-4 px-4 py-3"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ fontFamily: isXpTheme ? "Tahoma, sans-serif" : "'Helvetica Neue', Helvetica, Arial, sans-serif" }}
    >
      <div
        className="text-center text-[11px] font-semibold uppercase tracking-[0.18em]"
        style={{ color: isXpTheme ? "#555" : "rgba(255,255,255,0.6)" }}
      >
        {t("apps.dashboard.converter.precision", "Decimal places")}
      </div>
      <div className="flex justify-center gap-2">
        {[2, 4, 5, 6].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => updatePrecision(value)}
            style={{
              minWidth: 36,
              borderRadius: 999,
              padding: "6px 10px",
              border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.18)",
              background:
                value === precision
                  ? isXpTheme
                    ? "#D9ECFF"
                    : "linear-gradient(180deg, #fafafa 0%, #d6d6d6 100%)"
                  : isXpTheme
                    ? "#F3F0E1"
                    : "rgba(255,255,255,0.06)",
              color: isXpTheme ? "#222" : "#fff",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            {value}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={resetDefaults}
        style={{
          borderRadius: 999,
          padding: "7px 12px",
          border: isXpTheme ? "1px solid #ACA899" : "1px solid rgba(255,255,255,0.18)",
          background: isXpTheme ? "#ECE9D8" : "rgba(255,255,255,0.08)",
          color: isXpTheme ? "#222" : "#fff",
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        {t("apps.dashboard.converter.reset", "Reset defaults")}
      </button>
    </div>
  );
}
