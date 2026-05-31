import {
  useRef,
  useEffect,
  useLayoutEffect,
  useReducer,
  type CSSProperties,
} from "react";
import { IpodArtworkPlaceholder } from "../screen";
import { useImageLoaded } from "../../hooks/useImageLoaded";
import {
  COVER_FADE_TRANSITION,
  MODERN_NOW_PLAYING_ART_PX,
  MODERN_NOW_PLAYING_REFLECT_RATIO,
  NP_CROSSFADE_MS,
} from "./constants";
import { nowPlayingArtReducer } from "./nowPlayingArtReducer";

const MODERN_NOW_PLAYING_COVER_BORDER_RADIUS_PX = 0;
const MODERN_NOW_PLAYING_SLEEVE: CSSProperties = {
  borderRadius: `${MODERN_NOW_PLAYING_COVER_BORDER_RADIUS_PX}px`,
};
const MODERN_NOW_PLAYING_REFLECT_IMG: CSSProperties = {
  transform: "scaleY(-1)",
  opacity: 0.36,
  maskImage:
    "linear-gradient(to top, rgba(0, 0, 0, 1) 0%, transparent 50%)",
  WebkitMaskImage:
    "linear-gradient(to top, rgba(0, 0, 0, 1) 0%, transparent 50%)",
  borderRadius: `${MODERN_NOW_PLAYING_COVER_BORDER_RADIUS_PX}px`,
};
const MODERN_NOW_PLAYING_3D_PERSPECTIVE_PX = 180;
/** Left→right perspective (rotate around vertical axis). Negate angle to mirror. */
const MODERN_NOW_PLAYING_ROTATE_Y = "15deg";

const MODERN_NOW_PLAYING_ART_3D: CSSProperties = {
  transformStyle: "preserve-3d",
  transform: `rotateY(${MODERN_NOW_PLAYING_ROTATE_Y})`,
  transformOrigin: "center center",
  width: MODERN_NOW_PLAYING_ART_PX,
};

/** Sleeve + reflection: URLs ping-pong between two fixed `<img>` slots so committing a cross-fade
 * never re-points the displayed bitmap at the same `<img>` with a freshly reset decode hook (avoids gray flicker). */
export function ModernNowPlayingArtwork({ coverUrl }: { coverUrl: string | null }) {
  const reflectH = MODERN_NOW_PLAYING_ART_PX * MODERN_NOW_PLAYING_REFLECT_RATIO;
  const reflectTargetOpacity =
    MODERN_NOW_PLAYING_REFLECT_IMG.opacity as number;

  const [{ slots, front, crossfading }, dispatch] = useReducer(
    nowPlayingArtReducer,
    { slots: [null, null], front: 0, crossfading: false }
  );

  const fadeCommitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const back = 1 - front;
  const backUrl = slots[back];
  const frontUrl = slots[front];

  useLayoutEffect(() => {
    if (fadeCommitTimerRef.current !== null) {
      clearTimeout(fadeCommitTimerRef.current);
      fadeCommitTimerRef.current = null;
    }
    if (!coverUrl) {
      dispatch({ type: "reset" });
      return;
    }
    dispatch({ type: "cover", payload: coverUrl });
  }, [coverUrl]);

  const load0 = useImageLoaded(slots[0]);
  const load1 = useImageLoaded(slots[1]);
  const refl0 = useImageLoaded(slots[0]);
  const refl1 = useImageLoaded(slots[1]);

  const backLoaded = back === 0 ? load0.loaded : load1.loaded;
  const frontHook = front === 0 ? load0 : load1;

  useEffect(() => {
    if (!backUrl || !coverUrl || backUrl !== coverUrl || !backLoaded) {
      return;
    }

    dispatch({ type: "begin-fade" });
    fadeCommitTimerRef.current = setTimeout(() => {
      fadeCommitTimerRef.current = null;
      dispatch({ type: "commit" });
    }, NP_CROSSFADE_MS);

    return () => {
      if (fadeCommitTimerRef.current !== null) {
        clearTimeout(fadeCommitTimerRef.current);
        fadeCommitTimerRef.current = null;
      }
    };
  }, [backUrl, coverUrl, backLoaded]);

  function sleeveOpacity(slot: 0 | 1): number {
    const u = slots[slot];
    if (!u) return 0;
    const L = slot === 0 ? load0 : load1;
    if (!L.loaded) return 0;
    if (!crossfading) return slot === front ? 1 : 0;
    return slot === back ? 1 : 0;
  }

  function sleeveZ(slot: 0 | 1): number {
    if (!crossfading) return slot === front ? 1 : 0;
    return slot === back ? 2 : 1;
  }

  function reflOpacity(slot: 0 | 1): number {
    return sleeveOpacity(slot) > 0 ? reflectTargetOpacity : 0;
  }

  function reflectionImgStyle(slot: 0 | 1): CSSProperties {
    return {
      ...MODERN_NOW_PLAYING_REFLECT_IMG,
      opacity: reflOpacity(slot),
      transition: COVER_FADE_TRANSITION,
    };
  }

  const showFallbackArt =
    !coverUrl ||
    (Boolean(frontUrl) &&
      frontUrl === coverUrl &&
      frontHook.failed &&
      !crossfading);

  const showPrimeLoadingBackdrop =
    Boolean(frontUrl) &&
    frontUrl === coverUrl &&
    !frontHook.failed &&
    !frontHook.loaded &&
    !crossfading;

  const showReflectStack = slots[0] !== null || slots[1] !== null;

  return (
    <div
      className="relative shrink-0 self-start overflow-visible"
      style={{
        width: MODERN_NOW_PLAYING_ART_PX,
        height: MODERN_NOW_PLAYING_ART_PX,
        perspective: `${MODERN_NOW_PLAYING_3D_PERSPECTIVE_PX}px`,
        perspectiveOrigin: "50% 70%",
      }}
    >
      <div style={MODERN_NOW_PLAYING_ART_3D}>
        <div
          className="relative overflow-hidden"
          style={{
            ...MODERN_NOW_PLAYING_SLEEVE,
            height: MODERN_NOW_PLAYING_ART_PX,
            width: MODERN_NOW_PLAYING_ART_PX,
          }}
        >
          {showFallbackArt ? (
            <IpodArtworkPlaceholder
              kind="album"
              className="absolute inset-0 size-full"
            />
          ) : null}
          {showPrimeLoadingBackdrop ? (
            <div
              className="ipod-empty-artwork absolute inset-0 size-full"
              aria-hidden
            />
          ) : null}
          {slots[0] ? (
            <img
              ref={load0.ref}
              src={slots[0]!}
              alt=""
              draggable={false}
              onLoad={load0.onLoad}
              onError={() => {
                if (front !== 0) {
                  dispatch({ type: "abort-back" });
                } else {
                  load0.onError();
                }
              }}
              className="absolute inset-0 size-full object-cover"
              style={{
                opacity: sleeveOpacity(0),
                zIndex: sleeveZ(0),
                transition: COVER_FADE_TRANSITION,
              }}
            />
          ) : null}
          {slots[1] ? (
            <img
              ref={load1.ref}
              src={slots[1]!}
              alt=""
              draggable={false}
              onLoad={load1.onLoad}
              onError={() => {
                if (front !== 1) {
                  dispatch({ type: "abort-back" });
                } else {
                  load1.onError();
                }
              }}
              className="absolute inset-0 size-full object-cover"
              style={{
                opacity: sleeveOpacity(1),
                zIndex: sleeveZ(1),
                transition: COVER_FADE_TRANSITION,
              }}
            />
          ) : null}
        </div>
        {showReflectStack ? (
          <div
            aria-hidden
            className="relative pointer-events-none mt-0 w-full overflow-hidden"
            style={{ height: reflectH }}
          >
            {slots[0] ? (
              <img
                ref={refl0.ref}
                src={slots[0]!}
                alt=""
                draggable={false}
                onLoad={refl0.onLoad}
                onError={() => {
                  if (front !== 0) {
                    dispatch({ type: "abort-back" });
                  } else {
                    refl0.onError();
                  }
                }}
                className="pointer-events-none absolute left-0 top-0 block w-full h-auto max-w-none"
                style={{
                  ...reflectionImgStyle(0),
                  zIndex: sleeveZ(0),
                }}
              />
            ) : null}
            {slots[1] ? (
              <img
                ref={refl1.ref}
                src={slots[1]!}
                alt=""
                draggable={false}
                onLoad={refl1.onLoad}
                onError={() => {
                  if (front !== 1) {
                    dispatch({ type: "abort-back" });
                  } else {
                    refl1.onError();
                  }
                }}
                className="pointer-events-none absolute left-0 top-0 block w-full h-auto max-w-none"
                style={{
                  ...reflectionImgStyle(1),
                  zIndex: sleeveZ(1),
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
