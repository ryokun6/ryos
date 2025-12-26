import React, { useState } from "react";
import { MenuBar } from "@/components/layout/MenuBar";
import {
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
} from "@/components/ui/menubar";
import { Filter } from "./PaintFiltersMenu";
import { generateAppShareUrl } from "@/utils/sharedUrl";
import { useThemeStore } from "@/stores/useThemeStore";
import { ShareItemDialog } from "@/components/dialogs/ShareItemDialog";
import { appRegistry } from "@/config/appRegistry";
import { useTranslation } from "react-i18next";

interface PaintMenuBarProps {
  isWindowOpen: boolean;
  isForeground: boolean;
  onClose: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onShowHelp: () => void;
  onShowAbout: () => void;
  onNewFile: () => void;
  onSave: () => void;
  onImportFile: () => void;
  onExportFile: () => void;
  hasUnsavedChanges: boolean;
  currentFilePath: string | null;
  handleFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCut: () => void;
  onCopy: () => void;
  onPaste: () => void;
  onApplyFilter: (filter: Filter) => void;
}

const filters: Filter[] = [
  // Color Adjustments
  {
    name: "Brightness +",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.min(255, data[i] + 30); // R
        data[i + 1] = Math.min(255, data[i + 1] + 30); // G
        data[i + 2] = Math.min(255, data[i + 2] + 30); // B
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  {
    name: "Brightness -",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.max(0, data[i] - 30); // R
        data[i + 1] = Math.max(0, data[i + 1] - 30); // G
        data[i + 2] = Math.max(0, data[i + 2] - 30); // B
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  // Artistic Effects
  {
    name: "Pixelate",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const size = 8; // pixel size

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      // Draw original image to temp canvas
      tempCtx.drawImage(canvas, 0, 0);

      // Clear original canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw pixelated version
      for (let y = 0; y < canvas.height; y += size) {
        for (let x = 0; x < canvas.width; x += size) {
          // Get the color of the first pixel in the block
          const imageData = tempCtx.getImageData(x, y, 1, 1);
          const r = imageData.data[0];
          const g = imageData.data[1];
          const b = imageData.data[2];

          // Draw a block of that color
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(x, y, size, size);
        }
      }
    },
  },
  {
    name: "Edge Detect",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = canvas.width;
      const height = canvas.height;

      // Sobel kernels
      const sobelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
      const sobelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];

      const tempData = new Uint8ClampedArray(data);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let gx = 0;
          let gy = 0;

          // Calculate gradient
          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4;
              const kernelIdx = (ky + 1) * 3 + (kx + 1);

              // Use grayscale value
              const val =
                (tempData[idx] + tempData[idx + 1] + tempData[idx + 2]) / 3;

              gx += val * sobelX[kernelIdx];
              gy += val * sobelY[kernelIdx];
            }
          }

          // Calculate magnitude
          const mag = Math.min(255, Math.sqrt(gx * gx + gy * gy));

          const idx = (y * width + x) * 4;
          data[idx] = mag;
          data[idx + 1] = mag;
          data[idx + 2] = mag;
        }
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  // Retro Effects
  {
    name: "Noise",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const noise = Math.random() * 50 - 25; // Random value between -25 and 25

        data[i] = Math.min(255, Math.max(0, data[i] + noise)); // R
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise)); // G
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise)); // B
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  {
    name: "Old Photo",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        // Add sepia tint
        data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189 + 40);
        data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168 + 20);
        data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);

        // Add slight noise
        const noise = Math.random() * 20 - 10;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  // Original filters...
  {
    name: "Blur",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.filter = "blur(2px)";
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;
      tempCtx.drawImage(canvas, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.filter = "none";
    },
  },
  {
    name: "Sharpen",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      // Apply a sharpening convolution filter
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      const kernel = [0, -1, 0, -1, 5, -1, 0, -1, 0];

      const tempImageData = new ImageData(canvas.width, canvas.height);
      for (let y = 1; y < canvas.height - 1; y++) {
        for (let x = 1; x < canvas.width - 1; x++) {
          const idx = (y * canvas.width + x) * 4;
          let r = 0,
            g = 0,
            b = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const pidx = ((y + ky) * canvas.width + (x + kx)) * 4;
              const weight = kernel[(ky + 1) * 3 + (kx + 1)];
              r += pixels[pidx] * weight;
              g += pixels[pidx + 1] * weight;
              b += pixels[pidx + 2] * weight;
            }
          }

          tempImageData.data[idx] = Math.min(255, Math.max(0, r));
          tempImageData.data[idx + 1] = Math.min(255, Math.max(0, g));
          tempImageData.data[idx + 2] = Math.min(255, Math.max(0, b));
          tempImageData.data[idx + 3] = pixels[idx + 3];
        }
      }

      ctx.putImageData(tempImageData, 0, 0);
    },
  },
  {
    name: "Grayscale",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = avg;
        data[i + 1] = avg;
        data[i + 2] = avg;
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  {
    name: "Invert",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  {
    name: "Sepia",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];

        data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
        data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
        data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  // Advanced Blur Effects
  {
    name: "Gaussian Blur",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const width = canvas.width;
      const height = canvas.height;

      // Gaussian kernel (3x3)
      const kernel = [
        1 / 16,
        2 / 16,
        1 / 16,
        2 / 16,
        4 / 16,
        2 / 16,
        1 / 16,
        2 / 16,
        1 / 16,
      ];

      const tempData = new Uint8ClampedArray(data);

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          let r = 0,
            g = 0,
            b = 0;

          for (let ky = -1; ky <= 1; ky++) {
            for (let kx = -1; kx <= 1; kx++) {
              const idx = ((y + ky) * width + (x + kx)) * 4;
              const weight = kernel[(ky + 1) * 3 + (kx + 1)];

              r += tempData[idx] * weight;
              g += tempData[idx + 1] * weight;
              b += tempData[idx + 2] * weight;
            }
          }

          const idx = (y * width + x) * 4;
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
        }
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  {
    name: "Motion Blur",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const angle = 45; // Angle in degrees
      const distance = 15; // Blur distance

      const rad = (angle * Math.PI) / 180;
      const dx = Math.cos(rad) * distance;
      const dy = Math.sin(rad) * distance;

      ctx.filter = `blur(1px)`; // Initial softening

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      // Create motion blur by drawing multiple offset copies with reduced opacity
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const x = (dx * i) / steps;
        const y = (dy * i) / steps;
        tempCtx.globalAlpha = 1 / steps;
        tempCtx.drawImage(canvas, x, y);
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.filter = "none";
      ctx.drawImage(tempCanvas, 0, 0);
    },
  },
  {
    name: "Radial Blur",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      // Draw original image
      tempCtx.drawImage(canvas, 0, 0);

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Create radial blur effect
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const scale = 1 + i * 0.004;
        ctx.globalAlpha = 1 / steps;

        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.scale(scale, scale);
        ctx.translate(-centerX, -centerY);
        ctx.drawImage(tempCanvas, 0, 0);
        ctx.restore();
      }

      ctx.globalAlpha = 1;
    },
  },
  // New Retro Effects
  {
    name: "VHS",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // RGB shift
      const shift = 2;
      const tempData = new Uint8ClampedArray(data);

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;

          // Add scanlines
          const scanline = y % 2 === 0 ? 0.9 : 1;

          // Shift red channel left
          const r = x > shift ? tempData[i - shift * 4] : tempData[i];
          // Shift blue channel right
          const b =
            x < canvas.width - shift
              ? tempData[i + shift * 4 + 2]
              : tempData[i + 2];

          data[i] = r * scanline; // Red
          data[i + 1] = tempData[i + 1] * scanline; // Green
          data[i + 2] = b * scanline; // Blue
        }
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  {
    name: "CRT",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Add scanlines and RGB subpixel effect
      for (let y = 0; y < canvas.height; y++) {
        const scanline = y % 3;
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;

          // Scanline effect
          const intensity = scanline === 0 ? 1 : 0.7;

          // RGB subpixel simulation
          const subpixel = x % 3;
          if (subpixel === 0) {
            data[i] *= intensity * 1.1; // Boost red
            data[i + 1] *= intensity * 0.9;
            data[i + 2] *= intensity * 0.9;
          } else if (subpixel === 1) {
            data[i] *= intensity * 0.9;
            data[i + 1] *= intensity * 1.1; // Boost green
            data[i + 2] *= intensity * 0.9;
          } else {
            data[i] *= intensity * 0.9;
            data[i + 1] *= intensity * 0.9;
            data[i + 2] *= intensity * 1.1; // Boost blue
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  {
    name: "Glitch",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      const tempData = new Uint8ClampedArray(data);

      // Create random glitch blocks
      const numGlitches = 10;
      for (let g = 0; g < numGlitches; g++) {
        const y = Math.floor(Math.random() * canvas.height);
        const height = Math.floor(Math.random() * 20) + 5;
        const shift = Math.floor(Math.random() * 20) - 10;

        for (let h = 0; h < height && y + h < canvas.height; h++) {
          const row = y + h;
          for (let x = 0; x < canvas.width; x++) {
            const sourceX = Math.max(0, Math.min(canvas.width - 1, x + shift));
            const sourceI = (row * canvas.width + sourceX) * 4;
            const targetI = (row * canvas.width + x) * 4;

            // Random color channel shift
            data[targetI] = tempData[sourceI + (g % 3) * 1];
            data[targetI + 1] = tempData[sourceI + ((g + 1) % 3) * 1];
            data[targetI + 2] = tempData[sourceI + ((g + 2) % 3) * 1];
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
  {
    name: "Dither",
    apply: (canvas: HTMLCanvasElement) => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert to grayscale first
      for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        data[i] = data[i + 1] = data[i + 2] = avg;
      }

      // Apply ordered dithering
      const matrix = [
        [0, 8, 2, 10],
        [12, 4, 14, 6],
        [3, 11, 1, 9],
        [15, 7, 13, 5],
      ];

      const matrixSize = 4;

      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          const matrixValue = matrix[y % matrixSize][x % matrixSize];
          const thresholdValue = (matrixValue / 16) * 255;

          data[i] =
            data[i + 1] =
            data[i + 2] =
              data[i] > thresholdValue ? 255 : 0;
        }
      }

      ctx.putImageData(imageData, 0, 0);
    },
  },
];

// Update filter categories with simpler names and reorganized filters
const filterCategories = {
  Color: ["Brightness +", "Brightness -", "Grayscale", "Invert", "Sepia"],
  Artistic: ["Pixelate", "Edge Detect", "Sharpen"],
  Blur: ["Blur", "Gaussian Blur", "Motion Blur", "Radial Blur"],
  Retro: ["Noise", "Old Photo", "VHS", "CRT", "Glitch", "Dither"],
};

export function PaintMenuBar({
  isWindowOpen,
  onClose,
  onShowHelp,
  onShowAbout,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onNewFile,
  onSave,
  onImportFile,
  onExportFile,
  currentFilePath,
  handleFileSelect,
  onCut,
  onCopy,
  onPaste,
  onApplyFilter,
}: PaintMenuBarProps) {
  const { t } = useTranslation();
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const currentTheme = useThemeStore((state) => state.current);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const appId = "paint";
  const appName = appRegistry[appId as keyof typeof appRegistry]?.name || appId;
  const isXpTheme = currentTheme === "xp" || currentTheme === "win98";

  if (!isWindowOpen) return null;

  // Translation maps
  const categoryKeyMap: Record<string, string> = {
    "Color": "apps.paint.menu.filterCategoryColor",
    "Artistic": "apps.paint.menu.filterCategoryArtistic",
    "Blur": "apps.paint.menu.filterCategoryBlur",
    "Retro": "apps.paint.menu.filterCategoryRetro",
  };

  const filterKeyMap: Record<string, string> = {
    "Brightness +": "apps.paint.menu.filterBrightnessPlus",
    "Brightness -": "apps.paint.menu.filterBrightnessMinus",
    "Grayscale": "apps.paint.menu.filterGrayscale",
    "Invert": "apps.paint.menu.filterInvert",
    "Sepia": "apps.paint.menu.filterSepia",
    "Pixelate": "apps.paint.menu.filterPixelate",
    "Edge Detect": "apps.paint.menu.filterEdgeDetect",
    "Sharpen": "apps.paint.menu.filterSharpen",
    "Blur": "apps.paint.menu.filterBlur",
    "Gaussian Blur": "apps.paint.menu.filterGaussianBlur",
    "Motion Blur": "apps.paint.menu.filterMotionBlur",
    "Radial Blur": "apps.paint.menu.filterRadialBlur",
    "Noise": "apps.paint.menu.filterNoise",
    "Old Photo": "apps.paint.menu.filterOldPhoto",
    "VHS": "apps.paint.menu.filterVhs",
    "CRT": "apps.paint.menu.filterCrt",
    "Glitch": "apps.paint.menu.filterGlitch",
    "Dither": "apps.paint.menu.filterDither",
  };

  return (
    <MenuBar inWindowFrame={isXpTheme}>
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".png,.jpg,.jpeg"
        className="hidden"
      />
      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.file")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onNewFile}
            className="text-md h-6 px-3"
          >
            {t("apps.paint.menu.newFile")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onImportFile}
            className="text-md h-6 px-3"
          >
            {t("apps.paint.menu.open")}
          </MenubarItem>
          <MenubarItem
            onClick={onSave}
            className="text-md h-6 px-3"
          >
            {currentFilePath ? t("apps.paint.menu.save") : t("apps.paint.menu.saveEllipsis")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={() => fileInputRef.current?.click()}
            className="text-md h-6 px-3"
          >
            {t("apps.paint.menu.importFromDevice")}
          </MenubarItem>
          <MenubarItem
            onClick={onExportFile}
            className="text-md h-6 px-3"
          >
            {t("apps.paint.menu.export")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClose}
            className="text-md h-6 px-3"
          >
            {t("common.menu.close")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.edit")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onUndo}
            disabled={!canUndo}
            className={`text-md h-6 px-3 ${
              !canUndo ? "text-gray-500" : ""
            }`}
          >
            {t("common.menu.undo")}
          </MenubarItem>
          <MenubarItem
            onClick={onRedo}
            disabled={!canRedo}
            className={`text-md h-6 px-3 ${
              !canRedo ? "text-gray-500" : ""
            }`}
          >
            {t("common.menu.redo")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onCut}
            className="text-md h-6 px-3"
          >
            {t("common.menu.cut")}
          </MenubarItem>
          <MenubarItem
            onClick={onCopy}
            className="text-md h-6 px-3"
          >
            {t("common.menu.copy")}
          </MenubarItem>
          <MenubarItem
            onClick={onPaste}
            className="text-md h-6 px-3"
          >
            {t("common.menu.paste")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onClear}
            className="text-md h-6 px-3"
          >
            {t("common.menu.clear")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("apps.paint.menu.filters")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          {Object.entries(filterCategories).map(([category, filterNames]) => (
            <MenubarSub key={category}>
              <MenubarSubTrigger className="text-md h-6 px-3">
                {t(categoryKeyMap[category] || category)}
              </MenubarSubTrigger>
              <MenubarSubContent>
                {filterNames.map((name) => {
                  const filter = filters.find((f) => f.name === name);
                  if (!filter) return null;
                  return (
                    <MenubarItem
                      key={name}
                      onClick={() => onApplyFilter(filter)}
                      className="text-md h-6 px-3"
                    >
                      {t(filterKeyMap[name] || name)}
                    </MenubarItem>
                  );
                })}
              </MenubarSubContent>
            </MenubarSub>
          ))}
        </MenubarContent>
      </MenubarMenu>

      <MenubarMenu>
        <MenubarTrigger className="text-md px-2 py-1 border-none focus-visible:ring-0">
          {t("common.menu.help")}
        </MenubarTrigger>
        <MenubarContent align="start" sideOffset={1} className="px-0">
          <MenubarItem
            onClick={onShowHelp}
            className="text-md h-6 px-3"
          >
            {t("apps.paint.menu.paintHelp")}
          </MenubarItem>
          <MenubarItem
            onSelect={() => setIsShareDialogOpen(true)}
            className="text-md h-6 px-3"
          >
            {t("common.menu.shareApp")}
          </MenubarItem>
          <MenubarSeparator className="h-[2px] bg-black my-1" />
          <MenubarItem
            onClick={onShowAbout}
            className="text-md h-6 px-3"
          >
            {t("apps.paint.menu.aboutPaint")}
          </MenubarItem>
        </MenubarContent>
      </MenubarMenu>
      <ShareItemDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        itemType="App"
        itemIdentifier={appId}
        title={appName}
        generateShareUrl={generateAppShareUrl}
      />
    </MenuBar>
  );
}
