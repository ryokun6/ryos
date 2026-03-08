export function resizeImageToBase64(
  src: string | File,
  size = 64
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      const sourceWidth = img.naturalWidth || img.width;
      const sourceHeight = img.naturalHeight || img.height;

      if (!sourceWidth || !sourceHeight) {
        reject(new Error("Invalid image dimensions"));
        return;
      }

      const squareSize = Math.min(sourceWidth, sourceHeight);
      const sourceX = Math.floor((sourceWidth - squareSize) / 2);
      const sourceY = Math.floor((sourceHeight - squareSize) / 2);

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        squareSize,
        squareSize,
        0,
        0,
        size,
        size
      );
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Failed to load image"));

    if (typeof src === "string") {
      img.src = src;
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(src);
    }
  });
}
