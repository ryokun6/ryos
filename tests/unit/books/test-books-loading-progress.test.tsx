import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { BookLoadingProgress } from "../../../src/apps/books/components/BookLoadingProgress";

test("book loading exposes real progress and remains indeterminate while parsing", () => {
  const loading = renderToStaticMarkup(<BookLoadingProgress label="Loading…" />);
  expect(loading).toContain('role="progressbar"');
  expect(loading).toContain('aria-label="Loading…"');
  expect(loading).not.toContain("aria-valuenow");
  const downloading = renderToStaticMarkup(<BookLoadingProgress label="Loading…" percentage={37} />);
  expect(downloading).toContain('aria-valuenow="37"');
  expect(downloading).toContain("width:37%");
  const received = renderToStaticMarkup(<BookLoadingProgress label="Loading…" percentage={100} />);
  expect(received).toContain('aria-valuenow="99"');
});
