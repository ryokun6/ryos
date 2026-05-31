// Game-world dimensions in CSS pixels. The iPod screen is 150px tall ×
// ~218px wide (250px device − 2×16px padding); the title bar takes 26px,
// leaving ~124px of body. We design the world for the smallest sensible
// body size so the paddle is always reachable, and let the canvas
// element's CSS handle the actual rendered size.
export const GAME_WIDTH = 200;
export const GAME_HEIGHT = 110;

// Brick layout — slim rows occupying ~20% of the play area.
export const BRICK_COLS = 10;
export const BRICK_ROWS = 4;
export const BRICK_GAP = 1;
export const BRICK_TOP_OFFSET = 3;
export const BRICK_SIDE_OFFSET = 2;
// 6 game units ≈ ~9 device pixels at 2× DPR — enough vertical room for the
// three-stop gradient + top gloss strip to read as a glossy lozenge in the
// modern (nano 6G/7G) skin, while still keeping the brick band well above
// the paddle. The classic skin gets slightly chunkier monochrome bricks
// which is fine for the 1st-gen LCD aesthetic.
export const BRICK_HEIGHT = 6;

/** Per-row brick palette for the modern (nano 6G/7G) skin. */
export const MODERN_BRICK_COLORS: Array<{
  highlight: string;
  body: string;
  shadow: string;
  topGloss: string;
  border: string;
}> = [
  { highlight: "#ff8a78", body: "#e34a3a", shadow: "#a0231a", topGloss: "rgba(255,255,255,0.5)", border: "rgba(74,15,8,0.55)" },
  { highlight: "#ffb673", body: "#ef892c", shadow: "#a8540f", topGloss: "rgba(255,255,255,0.45)", border: "rgba(85,40,5,0.5)" },
  { highlight: "#ffe572", body: "#ebc935", shadow: "#9c810e", topGloss: "rgba(255,255,255,0.5)", border: "rgba(80,60,5,0.5)" },
  { highlight: "#a8e879", body: "#5cbf3f", shadow: "#2c761a", topGloss: "rgba(255,255,255,0.45)", border: "rgba(20,55,12,0.55)" },
  { highlight: "#7a96ff", body: "#3a5fd6", shadow: "#193a96", topGloss: "rgba(255,255,255,0.45)", border: "rgba(12,25,70,0.6)" },
  { highlight: "#9d70ff", body: "#5d3dc4", shadow: "#31197e", topGloss: "rgba(255,255,255,0.45)", border: "rgba(25,10,60,0.6)" },
];

export const PADDLE_WIDTH = 28;
export const PADDLE_HEIGHT = 3;
export const PADDLE_Y = GAME_HEIGHT - 7;
export const BALL_RADIUS = 1.5;
export const BALL_BASE_SPEED = 75;
export const BALL_SPEED_INCREMENT = 7;
export const WHEEL_TICK_PIXELS = 11;
export const PADDLE_SMOOTH_SPEED = 520;
export const STARTING_LIVES = 3;
