import type { Point, Selection } from "./types";

export const compareImageData = (img1: ImageData, img2: ImageData): boolean => {
  if (img1.width !== img2.width || img1.height !== img2.height) return false;

  const data1 = img1.data;
  const data2 = img2.data;
  const length = data1.length;
  const sampleSize = Math.min(1000, length / 4);
  const step = Math.floor(length / (sampleSize * 4));

  for (let i = 0; i < length; i += step) {
    if (data1[i] !== data2[i]) return false;
  }

  return true;
};

export const getCanvasPoint = (
  canvas: HTMLCanvasElement | null,
  event:
    | React.MouseEvent<HTMLCanvasElement>
    | React.TouchEvent<HTMLCanvasElement>,
  fallbackPoint: Point | null
): Point => {
  if (!canvas) return { x: 0, y: 0 };
  const rect = canvas.getBoundingClientRect();

  let clientX: number;
  let clientY: number;

  if ("touches" in event) {
    if (event.touches.length === 0 && event.changedTouches?.length > 0) {
      clientX = event.changedTouches[0].clientX;
      clientY = event.changedTouches[0].clientY;
    } else if (event.touches.length > 0) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
    } else {
      return fallbackPoint || { x: 0, y: 0 };
    }
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
};

export const isPointInLassoPath = (point: Point, path: Point[]): boolean => {
  if (path.length < 3) return false;

  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i].x;
    const yi = path[i].y;
    const xj = path[j].x;
    const yj = path[j].y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

export const isPointInSelection = (point: Point, sel: Selection): boolean => {
  if (sel.type === "rectangle") {
    return (
      point.x >= sel.startX &&
      point.x <= sel.startX + sel.width &&
      point.y >= sel.startY &&
      point.y <= sel.startY + sel.height
    );
  }
  if (sel.type === "lasso" && sel.path) {
    return isPointInLassoPath(point, sel.path);
  }
  return false;
};
