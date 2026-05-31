export const performFloodFill = (
  canvas: HTMLCanvasElement,
  context: CanvasRenderingContext2D,
  patternSource: HTMLCanvasElement | HTMLImageElement,
  startX: number,
  startY: number,
  onComplete: () => void
): void => {
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imageData.data;

  const startPos = (startY * canvas.width + startX) * 4;
  const startR = pixels[startPos];
  const startG = pixels[startPos + 1];
  const startB = pixels[startPos + 2];
  const startA = pixels[startPos + 3];

  const tempCanvas = document.createElement("canvas");
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  const tempContext = tempCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!tempContext) return;

  const pattern = tempContext.createPattern(patternSource, "repeat");
  if (!pattern) return;
  tempContext.fillStyle = pattern;
  tempContext.fillRect(0, 0, canvas.width, canvas.height);
  const patternData = tempContext.getImageData(
    0,
    0,
    canvas.width,
    canvas.height
  );

  const targetPos = (startY * canvas.width + startX) * 4;
  if (
    pixels[targetPos] === patternData.data[targetPos] &&
    pixels[targetPos + 1] === patternData.data[targetPos + 1] &&
    pixels[targetPos + 2] === patternData.data[targetPos + 2] &&
    pixels[targetPos + 3] === patternData.data[targetPos + 3]
  ) {
    return;
  }

  const maxPixels = Math.floor(canvas.width * canvas.height * 0.8);
  let filledPixels = 0;

  const matchesStart = (pos: number) => {
    return (
      pixels[pos] === startR &&
      pixels[pos + 1] === startG &&
      pixels[pos + 2] === startB &&
      pixels[pos + 3] === startA
    );
  };

  const setPixel = (pos: number) => {
    pixels[pos] = patternData.data[pos];
    pixels[pos + 1] = patternData.data[pos + 1];
    pixels[pos + 2] = patternData.data[pos + 2];
    pixels[pos + 3] = patternData.data[pos + 3];
    filledPixels++;
  };

  interface ScanLine {
    y: number;
    leftX: number;
    rightX: number;
    direction: number;
  }
  const scanlines: ScanLine[] = [];

  scanlines.push({
    y: startY,
    leftX: startX,
    rightX: startX,
    direction: 1,
  });
  scanlines.push({
    y: startY,
    leftX: startX,
    rightX: startX,
    direction: -1,
  });

  while (scanlines.length > 0 && filledPixels < maxPixels) {
    const { y, leftX, rightX, direction } = scanlines.pop()!;
    const newY = y + direction;

    if (newY < 0 || newY >= canvas.height) continue;

    let x1 = leftX;
    let x2 = rightX;

    while (x1 > 0 && matchesStart((y * canvas.width + (x1 - 1)) * 4)) {
      x1--;
    }

    while (
      x2 < canvas.width - 1 &&
      matchesStart((y * canvas.width + (x2 + 1)) * 4)
    ) {
      x2++;
    }

    for (let x = x1; x <= x2; x++) {
      setPixel((y * canvas.width + x) * 4);
    }

    let inRange = false;
    for (let x = x1; x <= x2; x++) {
      const newPos = (newY * canvas.width + x) * 4;
      const matchesNow = matchesStart(newPos);

      if (!inRange && matchesNow) {
        scanlines.push({
          y: newY,
          leftX: x,
          rightX: x,
          direction: direction,
        });
        inRange = true;
      } else if (inRange && !matchesNow) {
        scanlines[scanlines.length - 1].rightX = x - 1;
        inRange = false;
      }
    }
    if (inRange) {
      scanlines[scanlines.length - 1].rightX = x2;
    }
  }

  context.putImageData(imageData, 0, 0);
  onComplete();
};
