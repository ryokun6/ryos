import React from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Sliders } from "@phosphor-icons/react";
import { useTranslation } from "react-i18next";

export interface Filter {
  name: string;
  apply: (canvas: HTMLCanvasElement) => void;
}

const filters: Filter[] = [
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
];

interface PaintFiltersMenuProps {
  onApplyFilter: (filter: Filter) => void;
}

export const PaintFiltersMenu: React.FC<PaintFiltersMenuProps> = ({
  onApplyFilter,
}) => {
  const { t } = useTranslation();
  const filterKeyMap: Record<string, string> = {
    "Blur": "apps.paint.menu.filterBlur",
    "Sharpen": "apps.paint.menu.filterSharpen",
    "Grayscale": "apps.paint.menu.filterGrayscale",
    "Invert": "apps.paint.menu.filterInvert",
    "Sepia": "apps.paint.menu.filterSepia",
  };
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Sliders className="h-4 w-4" weight="bold" />
          <span className="sr-only">{t("apps.paint.filtersMenu.openFiltersMenu")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>{t("apps.paint.menu.filters")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {filters.map((filter) => (
          <DropdownMenuItem
            key={filter.name}
            onClick={() => onApplyFilter(filter)}
          >
            {t(filterKeyMap[filter.name] || filter.name)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
