import type { Selection } from "./types";

export const extractSelectionRegion = (
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  selection: Selection
): HTMLCanvasElement | null => {
  const { startX, startY, width, height, type, path } = selection;

  const intStartX = Math.floor(startX);
  const intStartY = Math.floor(startY);
  const intEndX = Math.ceil(startX + width);
  const intEndY = Math.ceil(startY + height);
  const intWidth = Math.max(1, intEndX - intStartX);
  const intHeight = Math.max(1, intEndY - intStartY);

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = intWidth;
  tempCanvas.height = intHeight;
  const tempCtx = tempCanvas.getContext("2d", { willReadFrequently: true });
  if (!tempCtx) return null;

  if (type === "rectangle") {
    const imageData = context.getImageData(
      intStartX,
      intStartY,
      intWidth,
      intHeight
    );
    tempCtx.putImageData(imageData, 0, 0);
  } else if (type === "lasso" && path && path.length > 0) {
    const fullImageData = context.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    );

    const maskCanvas = document.createElement("canvas");
    maskCanvas.width = canvas.width;
    maskCanvas.height = canvas.height;
    const maskCtx = maskCanvas.getContext("2d");
    if (!maskCtx) return null;

    maskCtx.beginPath();
    maskCtx.moveTo(path[0].x, path[0].y);
    for (let i = 1; i < path.length; i++) {
      maskCtx.lineTo(path[i].x, path[i].y);
    }
    maskCtx.closePath();
    maskCtx.fillStyle = "white";
    maskCtx.fill();

    const maskData = maskCtx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const outputData = tempCtx.createImageData(intWidth, intHeight);

    for (let y = 0; y < intHeight; y++) {
      for (let x = 0; x < intWidth; x++) {
        const canvasX = intStartX + x;
        const canvasY = intStartY + y;
        const canvasIdx = (canvasY * canvas.width + canvasX) * 4;
        const outputIdx = (y * intWidth + x) * 4;

        if (maskData.data[canvasIdx + 3] > 0) {
          outputData.data[outputIdx] = fullImageData.data[canvasIdx];
          outputData.data[outputIdx + 1] = fullImageData.data[canvasIdx + 1];
          outputData.data[outputIdx + 2] = fullImageData.data[canvasIdx + 2];
          outputData.data[outputIdx + 3] = fullImageData.data[canvasIdx + 3];
        } else {
          outputData.data[outputIdx] = 0;
          outputData.data[outputIdx + 1] = 0;
          outputData.data[outputIdx + 2] = 0;
          outputData.data[outputIdx + 3] = 0;
        }
      }
    }

    tempCtx.putImageData(outputData, 0, 0);
  }

  return tempCanvas;
};
