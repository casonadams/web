import assert from "node:assert/strict";
import { test } from "node:test";
import { parseBingHtml } from "./engines/bing.ts";
import { parseDdgLiteHtml } from "./engines/ddg-lite.ts";
import { parseYahooHtml } from "./engines/yahoo.ts";

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

test("parseBingHtml: parses b_algo blocks and decodes /ck/a u= URLs", () => {
  const html = `
    <li class="b_algo">
      <h2><a href="https://www.bing.com/ck/a?!&&p=abc&u=a1aHR0cHM6Ly9leGFtcGxlLmNvbS9wYXRo">Example Title</a></h2>
      <div class="b_caption"><p>A useful snippet with enough text.</p></div>
    </li>`;
  assert.deepEqual(parseBingHtml(html), [
    {
      title: "Example Title",
      abstract: "A useful snippet with enough text.",
      url: "https://example.com/path",
    },
  ]);
});
