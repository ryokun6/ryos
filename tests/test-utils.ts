#!/usr/bin/env bun
/**
 * Shared test utilities for API endpoint tests
 */

export const BASE_URL = process.env.API_URL || "http://localhost:3000";

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export const results: TestResult[] = [];

// ANSI color codes
export const COLOR = {
  RESET: "\x1b[0m",
  BOLD: "\x1b[1m",
  DIM: "\x1b[2m",
  GREEN: "\x1b[32m",
  RED: "\x1b[31m",
  YELLOW: "\x1b[33m",
  CYAN: "\x1b[36m",
  WHITE: "\x1b[37m",
  BG_GREEN: "\x1b[42m",
  BG_RED: "\x1b[41m",
};

// Box drawing characters for clean TUI
const BOX = {
  TOP_LEFT: "┌",
  TOP_RIGHT: "┐",
  BOTTOM_LEFT: "└",
  BOTTOM_RIGHT: "┘",
  HORIZONTAL: "─",
  VERTICAL: "│",
  T_DOWN: "┬",
  T_UP: "┴",
  T_RIGHT: "├",
  T_LEFT: "┤",
  CROSS: "┼",
};

// Status indicators with colors (no emojis)
const STATUS = {
  PASS: `${COLOR.GREEN}[PASS]${COLOR.RESET}`,
  FAIL: `${COLOR.RED}[FAIL]${COLOR.RESET}`,
  INFO: `${COLOR.CYAN}[INFO]${COLOR.RESET}`,
  WARN: `${COLOR.YELLOW}[WARN]${COLOR.RESET}`,
  RUN: `${COLOR.DIM}[....]${COLOR.RESET}`,
};

/**
 * Create a horizontal line
 */
export function line(width: number = 70, char: string = BOX.HORIZONTAL): string {
  return char.repeat(width);
}

/**
 * Create a boxed header
 */
export function header(text: string, width: number = 70): string {
  const padding = width - text.length - 4;
  const leftPad = Math.floor(padding / 2);
  const rightPad = padding - leftPad;
  return [
    `${BOX.TOP_LEFT}${line(width - 2)}${BOX.TOP_RIGHT}`,
    `${BOX.VERTICAL} ${" ".repeat(leftPad)}${text}${" ".repeat(rightPad)} ${BOX.VERTICAL}`,
    `${BOX.BOTTOM_LEFT}${line(width - 2)}${BOX.BOTTOM_RIGHT}`,
  ].join("\n");
}

/**
 * Create a section header
 */
export function section(text: string): string {
  return `\n${BOX.T_RIGHT}${line(3)} ${COLOR.CYAN}${text}${COLOR.RESET} ${line(70 - text.length - 6)}`;
}

/**
 * Format duration in human readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Run a single test
 */
export async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`  ${STATUS.PASS} ${name} ${COLOR.DIM}(${formatDuration(duration)})${COLOR.RESET}`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, duration });
    console.log(`  ${STATUS.FAIL} ${name}`);
    console.log(`         ${COLOR.DIM}${errorMsg}${COLOR.RESET}`);
  }
}

/**
 * Assert condition is true
 */
export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

/**
 * Assert two values are equal
 */
export function assertEq<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

/**
 * Assert string includes substring
 */
export function assertIncludes(actual: string, expected: string, message?: string): void {
  if (!actual.includes(expected)) {
    throw new Error(message || `Expected "${actual}" to include "${expected}"`);
  }
}

/**
 * Assert response is OK
 */
export function assertOk(response: Response, message?: string): void {
  if (!response.ok) {
    throw new Error(message || `Expected OK response, got ${response.status}`);
  }
}

/**
 * Print test summary and return counts
 */
export function printSummary(): { passed: number; failed: number } {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n${line()}`);
  
  const passedStr = `${COLOR.GREEN}${passed} passed${COLOR.RESET}`;
  const failedStr = failed > 0 
    ? `${COLOR.RED}${failed} failed${COLOR.RESET}` 
    : `${COLOR.DIM}${failed} failed${COLOR.RESET}`;
  console.log(`\n  Results: ${passedStr}, ${failedStr}`);
  console.log(`  Duration: ${COLOR.DIM}${formatDuration(totalDuration)}${COLOR.RESET}`);

  if (failed > 0) {
    console.log(`\n  ${COLOR.RED}Failed tests:${COLOR.RESET}`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`    ${COLOR.RED}-${COLOR.RESET} ${r.name}`);
        if (r.error) {
          console.log(`      ${COLOR.DIM}${r.error}${COLOR.RESET}`);
        }
      });
  }

  console.log("");
  return { passed, failed };
}

/**
 * Clear results between test suites
 */
export function clearResults(): void {
  results.length = 0;
}

/**
 * Helper to make fetch requests with localhost origin header
 */
export async function fetchWithOrigin(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has("Origin")) {
    headers.set("Origin", "http://localhost:3000");
  }
  return fetch(url, { ...options, headers });
}

/**
 * Helper to make authenticated requests
 */
export async function fetchWithAuth(
  url: string,
  username: string,
  token: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Origin", "http://localhost:3000");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Username", username);
  return fetch(url, { ...options, headers });
}
