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

export async function runTest(
  name: string,
  testFn: () => Promise<void>
): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({ name, passed: true, duration: Date.now() - start });
    console.log(`✅ ${name}`);
  } catch (error) {
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    results.push({
      name,
      passed: false,
      error: errorMsg,
      duration: Date.now() - start,
    });
    console.log(`❌ ${name}: ${errorMsg}`);
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

export function assertEq<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(
      message || `Expected ${expected}, got ${actual}`
    );
  }
}

export function assertIncludes(actual: string, expected: string, message?: string): void {
  if (!actual.includes(expected)) {
    throw new Error(
      message || `Expected "${actual}" to include "${expected}"`
    );
  }
}

export function assertOk(response: Response, message?: string): void {
  if (!response.ok) {
    throw new Error(
      message || `Expected OK response, got ${response.status}`
    );
  }
}

export function printSummary(): { passed: number; failed: number } {
  console.log("\n" + "=".repeat(60));
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`\n📊 Test Summary:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   ⏱️  Total time: ${totalDuration}ms`);

  if (failed > 0) {
    console.log(`\n❌ Failed tests:`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`   - ${r.name}: ${r.error}`);
      });
  } else {
    console.log(`\n✅ All tests passed!`);
  }

  return { passed, failed };
}

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
  token: string,
  username: string,
  options: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(options.headers);
  headers.set("Origin", "http://localhost:3000");
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("X-Username", username);
  return fetch(url, { ...options, headers });
}
