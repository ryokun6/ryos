#!/usr/bin/env bun
/**
 * Guardrail tests for pusher client constructor resolution wiring.
 *
 * Why:
 * A prior regression relied on globalThis.Pusher only, which broke under Vite
 * module builds. These checks ensure module-default + global fallback logic
 * stays in place.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  header,
  section,
  runTest,
  printSummary,
  clearResults,
  assert,
} from "./test-utils";

const readPusherClientSource = (): string =>
  readFileSync(resolve(process.cwd(), "src/lib/pusherClient.ts"), "utf-8");

export async function runPusherClientConstructorWiringTests(): Promise<{
  passed: number;
  failed: number;
}> {
  clearResults();
  console.log(header("Pusher Constructor Wiring Tests"));

  console.log(section("Constructor resolution fallback"));
  await runTest("checks module default constructor first", async () => {
    const source = readPusherClientSource();
    assert(
      source.includes("constructorFromModule"),
      "Expected constructorFromModule resolution"
    );
    assert(
      /PusherNamespace[\s\S]*default\?/.test(source),
      "Expected module-default constructor lookup from PusherNamespace"
    );
  });

  await runTest("falls back to global constructor when needed", async () => {
    const source = readPusherClientSource();
    assert(
      source.includes("constructorFromGlobal"),
      "Expected constructorFromGlobal fallback path"
    );
    assert(
      source.includes("globalWithPusher.Pusher"),
      "Expected fallback to globalWithPusher.Pusher"
    );
  });

  await runTest("throws explicit error when no constructor is available", async () => {
    const source = readPusherClientSource();
    assert(
      source.includes("[pusherClient] Pusher constructor not available"),
      "Expected explicit missing-constructor error message"
    );
  });

  return printSummary();
}

if (import.meta.main) {
  runPusherClientConstructorWiringTests()
    .then(({ failed }) => process.exit(failed > 0 ? 1 : 0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
