/**
 * `ios/ryOS.xcodeproj` must list its sources explicitly.
 *
 * CodeQL's Swift autobuilder (GitHub code scanning default setup) decides
 * what to build from each target's `PBXSourcesBuildPhase`. Xcode 16+
 * file-system synchronized folders leave those phases empty, so Analyze
 * (swift) failed with "All targets ... contain no Swift source files". This
 * parses the project (no Xcode on Linux CI) and checks every Swift file on
 * disk is compiled by its target.
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

type PlistValue = string | PlistValue[] | { [key: string]: PlistValue };
type PlistDict = { [key: string]: PlistValue };

const IOS_DIR = join(import.meta.dir, "../../../ios");

/** Minimal OpenStep (old-style) plist parser — enough for project.pbxproj. */
function parseOpenStepPlist(source: string): PlistValue {
  let i = 0;
  const fail = (message: string): never => {
    throw new Error(`${message} at offset ${i}: ${JSON.stringify(source.slice(i, i + 40))}`);
  };
  const skip = () => {
    for (;;) {
      if (/\s/.test(source[i] ?? "")) i++;
      else if (source.startsWith("//", i)) i = source.indexOf("\n", i) + 1 || source.length;
      else if (source.startsWith("/*", i)) {
        const end = source.indexOf("*/", i + 2);
        if (end === -1) fail("Unterminated comment");
        i = end + 2;
      } else return;
    }
  };
  const parseString = (): string => {
    if (source[i] === '"') {
      let out = "";
      i++;
      while (source[i] !== '"') {
        if (i >= source.length) fail("Unterminated string");
        if (source[i] === "\\") {
          out += source[i + 1];
          i += 2;
        } else out += source[i++];
      }
      i++;
      return out;
    }
    const match = /^[A-Za-z0-9_$+/:.\-<>]+/.exec(source.slice(i));
    if (!match) fail("Expected a value");
    i += match![0].length;
    return match![0];
  };
  const parseValue = (): PlistValue => {
    skip();
    if (source[i] === "{") {
      i++;
      const dict: PlistDict = {};
      for (;;) {
        skip();
        if (source[i] === "}") {
          i++;
          return dict;
        }
        const key = parseString();
        skip();
        if (source[i] !== "=") fail("Expected '='");
        i++;
        dict[key] = parseValue();
        skip();
        if (source[i] !== ";") fail("Expected ';'");
        i++;
      }
    }
    if (source[i] === "(") {
      i++;
      const list: PlistValue[] = [];
      for (;;) {
        skip();
        if (source[i] === ")") {
          i++;
          return list;
        }
        list.push(parseValue());
        skip();
        if (source[i] === ",") i++;
        else if (source[i] !== ")") fail("Expected ',' or ')'");
      }
    }
    return parseString();
  };
  const value = parseValue();
  skip();
  if (i !== source.length) fail("Trailing content");
  return value;
}

const project = parseOpenStepPlist(
  readFileSync(join(IOS_DIR, "ryOS.xcodeproj/project.pbxproj"), "utf8")
) as PlistDict;
const objects = project.objects as Record<string, PlistDict>;

function object(id: PlistValue): PlistDict {
  const found = objects[id as string];
  if (!found) throw new Error(`Dangling object reference ${String(id)}`);
  return found;
}

function target(name: string): PlistDict {
  const found = Object.values(objects).find(
    (entry) => entry.isa === "PBXNativeTarget" && entry.name === name
  );
  if (!found) throw new Error(`Missing target ${name}`);
  return found;
}

function phaseFileNames(targetName: string, isa: string): string[] {
  const phase = (target(targetName).buildPhases as string[])
    .map(object)
    .find((entry) => entry.isa === isa);
  if (!phase) return [];
  return (phase.files as string[]).map(
    (id) => object(object(id).fileRef).path as string
  );
}

function swiftFilesIn(dir: string): string[] {
  return readdirSync(join(IOS_DIR, dir))
    .filter((name) => name.endsWith(".swift"))
    .sort();
}

describe("ios/ryOS.xcodeproj", () => {
  test("parses and has no dangling object references", () => {
    expect(project.rootObject).toBeDefined();
    const referenceKeys = new Set([
      "buildPhases",
      "children",
      "files",
      "fileRef",
      "targets",
      "dependencies",
      "buildConfigurations",
      "buildConfigurationList",
      "mainGroup",
      "productRefGroup",
      "productReference",
      "target",
      "targetProxy",
    ]);
    for (const entry of Object.values(objects)) {
      for (const [key, value] of Object.entries(entry)) {
        if (!referenceKeys.has(key)) continue;
        for (const id of Array.isArray(value) ? value : [value]) object(id);
      }
    }
  });

  test("does not use file-system synchronized folders", () => {
    const isas = new Set(Object.values(objects).map((entry) => entry.isa));
    expect(isas.has("PBXFileSystemSynchronizedRootGroup")).toBe(false);
    expect(isas.has("PBXFileSystemSynchronizedBuildFileExceptionSet")).toBe(false);
  });

  test("the app target compiles every Swift file in ios/ryOS", () => {
    expect(phaseFileNames("ryOS", "PBXSourcesBuildPhase").sort()).toEqual(
      swiftFilesIn("ryOS")
    );
  });

  test("the test target compiles every Swift file in ios/ryOSTests", () => {
    expect(phaseFileNames("ryOSTests", "PBXSourcesBuildPhase").sort()).toEqual(
      swiftFilesIn("ryOSTests")
    );
  });

  test("bundles the asset catalog and string catalog but not build inputs", () => {
    const resources = phaseFileNames("ryOS", "PBXResourcesBuildPhase");
    expect(resources.sort()).toEqual(["Assets.xcassets", "Localizable.xcstrings"]);
  });
});
