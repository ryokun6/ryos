import {
  getPoiVisual,
  POI_CATEGORY_VISUAL_ENTRIES,
  poiVisualGradient,
  poiVisualWithIcon,
} from "../utils/poiVisuals";
import {
  HOME_SAVED_VISUAL,
  WORK_SAVED_VISUAL,
} from "../utils/savedPlaceVisuals";

/**
 * Dev-only gallery: POI list badges (gradient + icon) and map marker hue
 * (`from` only), matching `MapsPlacesDrawer` / `getPoiMarkerAnnotationOptions`.
 */
export function PoiVisualsPreview() {
  const defaultVisual = getPoiVisual(undefined);
  const home = poiVisualWithIcon(HOME_SAVED_VISUAL);
  const work = poiVisualWithIcon(WORK_SAVED_VISUAL);

  return (
    <div
      className="min-h-screen bg-[#f0f0f0] p-6 text-[13px] text-neutral-800"
      data-preview="maps-poi"
    >
      <h1 className="mb-1 text-lg font-semibold text-neutral-900">
        Maps POI category visuals (ryOS)
      </h1>
      <p className="mb-6 max-w-3xl text-neutral-600">
        List/drawer badges use{" "}
        <code className="rounded bg-black/5 px-1">poiVisualGradient</code> on{" "}
        <code className="rounded bg-black/5 px-1">.aqua-icon-badge</code>. Map{" "}
        <code className="rounded bg-black/5 px-1">MarkerAnnotation</code> color is the{" "}
        <code className="rounded bg-black/5 px-1">from</code> stop only.
      </p>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Saved place overrides
        </h2>
        <div className="flex flex-wrap gap-6">
          <PreviewPair
            label="Home"
            listVisual={home}
            markerLabel={HOME_SAVED_VISUAL.from}
          />
          <PreviewPair
            label="Work"
            listVisual={work}
            markerLabel={WORK_SAVED_VISUAL.from}
          />
        </div>
      </section>

      <section className="mb-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Default (unknown category)
        </h2>
        <PreviewPair
          label="—"
          subtitle="getPoiVisual() with no category"
          listVisual={defaultVisual}
          markerLabel={defaultVisual.from}
        />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          MapKit pointOfInterestCategory → VISUALS
        </h2>
        <div className="columns-1 gap-x-10 md:columns-2 lg:columns-3">
          {POI_CATEGORY_VISUAL_ENTRIES.map(({ key, visual }) => {
            const v = poiVisualWithIcon(visual);
            return (
              <div key={key} className="mb-3 break-inside-avoid">
                <PreviewPair label={key} listVisual={v} markerLabel={visual.from} />
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function PreviewPair({
  label,
  subtitle,
  listVisual,
  markerLabel,
}: {
  label: string;
  subtitle?: string;
  listVisual: ReturnType<typeof getPoiVisual>;
  markerLabel: string;
}) {
  const Icon = listVisual.Icon;
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="font-mono text-[12px] font-medium text-neutral-900">{label}</div>
        {subtitle && (
          <div className="text-[11px] text-neutral-500">{subtitle}</div>
        )}
        <div className="mt-0.5 font-mono text-[10px] text-neutral-500">
          {listVisual.from} → {listVisual.to}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-400">
          List
        </span>
        <div
          className="aqua-icon-badge flex h-8 w-8 items-center justify-center text-white"
          style={{ backgroundImage: poiVisualGradient(listVisual) }}
        >
          <Icon size={16} weight="fill" />
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-center gap-1.5">
        <span className="text-[9px] font-medium uppercase tracking-wide text-neutral-400">
          Map pin
        </span>
        <svg
          width={28}
          height={34}
          viewBox="0 0 28 34"
          className="drop-shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
          aria-hidden
        >
          <title>MarkerAnnotation color (= from)</title>
          <path
            d="M14 1.5C7.65 1.5 2.5 6.5 2.5 12.75c0 4.7 3.15 8.95 5.6 12.4L14 32.5l5.9-7.35c2.45-3.45 5.6-7.7 5.6-12.4C25.5 6.5 20.35 1.5 14 1.5Z"
            fill={markerLabel}
            stroke="rgba(0,0,0,0.12)"
            strokeWidth={1}
          />
          <circle cx="14" cy="13" r="4.5" fill="#fff" opacity={0.95} />
        </svg>
      </div>
    </div>
  );
}
