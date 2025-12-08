// Utility functions for Expose/Mission Control view

// Calculate grid layout for windows
export function calculateExposeGrid(
  windowCount: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 60,
  gap = 24
): { cols: number; rows: number; cellWidth: number; cellHeight: number; padding: number; gap: number } {
  if (windowCount === 0) {
    return { cols: 1, rows: 1, cellWidth: 0, cellHeight: 0, padding, gap };
  }

  // Calculate optimal grid dimensions based on count
  let cols: number;
  let rows: number;
  
  if (windowCount === 1) {
    cols = 1;
    rows = 1;
  } else if (windowCount === 2) {
    cols = 2;
    rows = 1;
  } else if (windowCount <= 4) {
    cols = 2;
    rows = Math.ceil(windowCount / 2);
  } else if (windowCount <= 6) {
    cols = 3;
    rows = Math.ceil(windowCount / 3);
  } else if (windowCount <= 9) {
    cols = 3;
    rows = Math.ceil(windowCount / 3);
  } else {
    cols = Math.ceil(Math.sqrt(windowCount));
    rows = Math.ceil(windowCount / cols);
  }

  // Calculate cell dimensions - leave space for labels at bottom
  const labelSpace = 60;
  const availableWidth = viewportWidth - padding * 2 - gap * (cols - 1);
  const availableHeight = viewportHeight - padding * 2 - gap * (rows - 1) - labelSpace;
  const cellWidth = Math.floor(availableWidth / cols);
  const cellHeight = Math.floor(availableHeight / rows);

  return { cols, rows, cellWidth, cellHeight, padding, gap };
}

// Calculate the CENTER position for a cell in the expose grid
export function getExposeCellCenter(
  index: number,
  grid: ReturnType<typeof calculateExposeGrid>,
  viewportWidth: number,
  viewportHeight: number
): { x: number; y: number } {
  const { cols, cellWidth, cellHeight, gap } = grid;
  const col = index % cols;
  const row = Math.floor(index / cols);

  const totalGridWidth = cols * cellWidth + (cols - 1) * gap;
  const totalGridHeight = grid.rows * cellHeight + (grid.rows - 1) * gap;

  // Center the grid in the viewport
  const startX = (viewportWidth - totalGridWidth) / 2;
  const startY = (viewportHeight - totalGridHeight) / 2 - 20; // Shift up slightly for labels

  // Return the CENTER of the cell
  return {
    x: startX + col * (cellWidth + gap) + cellWidth / 2,
    y: startY + row * (cellHeight + gap) + cellHeight / 2,
  };
}

// Calculate scale to fit window in cell
export function getExposeScale(
  windowWidth: number,
  windowHeight: number,
  cellWidth: number,
  cellHeight: number,
  maxScale = 0.85
): number {
  if (cellWidth <= 0 || cellHeight <= 0) return 0.5;
  const scaleX = (cellWidth * maxScale) / windowWidth;
  const scaleY = (cellHeight * maxScale) / windowHeight;
  return Math.min(scaleX, scaleY, 0.8); // Cap at 80% to ensure windows look scaled
}

// Calculate the transform for a window to move to its expose position
export function getExposeTransform(
  windowX: number,
  windowY: number,
  windowWidth: number,
  windowHeight: number,
  index: number,
  grid: ReturnType<typeof calculateExposeGrid>,
  viewportWidth: number,
  viewportHeight: number
): { translateX: number; translateY: number; scale: number } {
  const cellCenter = getExposeCellCenter(index, grid, viewportWidth, viewportHeight);
  const scale = getExposeScale(windowWidth, windowHeight, grid.cellWidth, grid.cellHeight);
  
  // Current window center
  const windowCenterX = windowX + windowWidth / 2;
  const windowCenterY = windowY + windowHeight / 2;
  
  // Calculate translation needed to move window center to cell center
  // After scaling, the window will be centered at the cell center
  const translateX = cellCenter.x - windowCenterX;
  const translateY = cellCenter.y - windowCenterY;
  
  return { translateX, translateY, scale };
}

