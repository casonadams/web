import assert from "node:assert/strict";
import { test } from "node:test";
import registerWebTools from "./index.ts";
import { renderFetchResult, renderSearchResult } from "./logic.ts";

function registeredTool(name) {
  const tools = [];
  registerWebTools({
    registerTool(tool) {
      tools.push(tool);
    },
  });
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool);
  return tool;
}

test("webfetch: throws for invalid URLs so pi marks the result as an error", async () => {
  const tool = registeredTool("webfetch");
  await assert.rejects(
    tool.execute("call", { url: "file:///etc/passwd" }, undefined),
    /Fetch blocked: only http and https URLs are allowed/,
  );
});

test("webfetch: propagates caller cancellation", async () => {
  const tool = registeredTool("webfetch");
  const reason = new Error("fetch cancelled by caller");
  const controller = new AbortController();
  controller.abort(reason);
  await assert.rejects(
    tool.execute("call", { url: "https://example.com" }, controller.signal),
    (error) => error === reason,
  );
});

test("renderFetchResult: renders errored calls as failures", () => {
  const theme = {
    bold: (text) => text,
    fg: (color, text) => `[${color}]${text}`,
  };
  const component = renderFetchResult(
    { details: { sourceUrl: "https://example.com" } },
    { isPartial: false },
    theme,
    { isError: true },
  );
  const output = component.render(200).join("\n");
  assert.match(output, /\[error\]/);
  assert.doesNotMatch(output, /\[success\]/);
});

test("renderSearchResult: surfaces the error instead of 0 results", () => {
  const theme = {
    bold: (text) => text,
    fg: (color, text) => `[${color}]${text}`,
  };
  const component = renderSearchResult(
    { content: [{ type: "text", text: "DuckDuckGo Lite: no results" }] },
    { isPartial: false },
    theme,
    { isError: true },
  );
  const output = component.render(200).join("\n");
  assert.match(output, /\[error\]search failed: DuckDuckGo Lite: no results/);
  assert.doesNotMatch(output, /0 results/);
});
