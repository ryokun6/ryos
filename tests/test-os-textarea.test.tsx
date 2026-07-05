import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OsTextarea } from "@/components/ui/os-textarea";
import {
  osFieldInputClasses,
  osFieldTextareaClasses,
} from "@/components/ui/os-field-styles";

describe("os-field-styles", () => {
  test("pill search field uses rounded-full", () => {
    expect(osFieldInputClasses(true, "pill")).toContain("rounded-full");
    expect(osFieldInputClasses(true, "pill")).not.toContain("rounded-os");
  });

  test("textarea field uses rounded-os on macOS and square corners on classic themes", () => {
    expect(osFieldTextareaClasses(true)).toContain("rounded-os");
    expect(osFieldTextareaClasses(true)).not.toContain("rounded-full");
    expect(osFieldTextareaClasses(true)).toContain("os-theme-system7:rounded-none");
    expect(osFieldTextareaClasses(true)).toContain("os-windows:rounded-none");
  });

  test("search field reserves space for leading and trailing chrome", () => {
    const classes = osFieldInputClasses(true, "pill", {
      withLeadingIcon: true,
      withTrailingAction: true,
    });
    expect(classes).toContain("pl-7");
    expect(classes).toContain("pr-7");
  });
});

describe("OsTextarea", () => {
  test("marks field for shared OS theme overrides", () => {
    const html = renderToStaticMarkup(
      <OsTextarea value="hello" onChange={() => {}} aria-label="Notes" />
    );
    expect(html).toContain('data-os-field-input="true"');
    expect(html).toContain("rounded-os");
  });
});
