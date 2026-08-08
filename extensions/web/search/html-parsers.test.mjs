import assert from "node:assert/strict";
import { test } from "vitest";
import { BRAVE_CHROME_UA, parseBraveHtml } from "./engines/brave.ts";
import { parseDdgLiteHtml } from "./engines/ddg-lite.ts";
import { parseYahooHtml } from "./engines/yahoo.ts";

test("parseBraveHtml: parses top-level web snippets", () => {
  const html = `
    <div class="snippet result" data-type="web" data-pos="1">
      <a href="https://example.com/path">
        <div class="title">Example <strong>Title</strong></div>
      </a>
      <div class="content">A useful <strong>snippet</strong>.</div>
      <div class="snippet"><a href="https://example.com/nested">Nested result</a></div>
    </div>
    <div class="snippet" data-type="web" data-pos="2">
      <a href="https://example.org/"><div class="title">No description</div></a>
    </div>
    <div class="snippet" data-type="news" data-pos="3">
      <a href="https://example.net/"><div class="title">News result</div></a>
    </div>`;
  assert.deepEqual(parseBraveHtml(html), [
    {
      title: "Example Title",
      abstract: "A useful snippet.",
      url: "https://example.com/path",
    },
    {
      title: "No description",
      abstract: "",
      url: "https://example.org/",
    },
  ]);
  assert.match(BRAVE_CHROME_UA, /Chrome\/\d+/);
});

test("parseDdgLiteHtml: parses result-link anchors and decodes uddg URLs", () => {
  const html = `
    <table>
      <tr><td>
        <a rel="nofollow" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath&rut=abc" class='result-link'>Example Title</a>
      </td></tr>
      <tr><td>&nbsp;</td><td class='result-snippet'>A useful snippet with enough text.</td></tr>
    </table>`;
  assert.deepEqual(parseDdgLiteHtml(html), [
    {
      title: "Example Title",
      abstract: "A useful snippet with enough text.",
      url: "https://example.com/path",
    },
  ]);
});

test("parseDdgLiteHtml: preserves encoding inside decoded target URLs", () => {
  const html = `
    <table>
      <tr><td>
        <a href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fsearch%3Fq%3D100%2525" class="result-link">Encoded URL</a>
      </td></tr>
      <tr><td></td><td class="result-snippet">Encoded target.</td></tr>
      <tr><td>
        <a href="%" class="result-link">Malformed URL</a>
      </td></tr>
    </table>`;
  assert.deepEqual(parseDdgLiteHtml(html), [
    {
      title: "Encoded URL",
      abstract: "Encoded target.",
      url: "https://example.com/search?q=100%25",
    },
  ]);
});

test("parseYahooHtml: parses algo-sr blocks and decodes RU= URLs", () => {
  const html = `
    <li class="first">
      <div class="dd fst algo algo-sr relsrch richAlgo">
        <div class="compTitle options-toggle">
          <a href="https://r.search.yahoo.com/_ylt=abc/RV=2/RE=1/RO=10/RU=https%3a%2f%2fexample.com%2fpath/RK=2/RS=xyz">
            <h3><span>Example Title</span></h3>
          </a>
        </div>
        <div class="compText aAbs"><p>A useful snippet with enough text.</p></div>
      </div>
    </li>`;
  assert.deepEqual(parseYahooHtml(html), [
    {
      title: "Example Title",
      abstract: "A useful snippet with enough text.",
      url: "https://example.com/path",
    },
  ]);
});
