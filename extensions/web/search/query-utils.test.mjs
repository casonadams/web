import assert from "node:assert/strict";
import { it } from "vitest";
import {
  buildSearchQueryWithFilters,
  relaxedSearchQueries,
} from "./query-utils.ts";

const cases = [
  {
    name: "removes employee-count filler",
    input: "Beyond Inc Overstock Midvale Utah number of employees LinkedIn",
    expected: ["Beyond Inc Overstock Midvale Utah employees LinkedIn"],
  },
  {
    name: "removes quotes",
    input: '1-800 Contacts Draper Utah Glassdoor "Mobile Phone Discount"',
    expected: ["1-800 Contacts Draper Utah Glassdoor Mobile Phone Discount"],
  },
  {
    name: "removes request filler while preserving site filters",
    input: "please find API docs site:nodejs.org",
    expected: ["API docs site:nodejs.org"],
  },
];

it.each(cases)("relaxedSearchQueries: $name", ({ input, expected }) => {
  assert.deepEqual(relaxedSearchQueries(input), expected);
});

it("buildSearchQueryWithFilters: appends allowed and blocked domain syntax", () => {
  assert.equal(
    buildSearchQueryWithFilters("vitest documentation", [
      "vitest.dev",
      "-spam.com",
    ]),
    "vitest documentation site:vitest.dev -site:spam.com",
  );
  assert.equal(
    buildSearchQueryWithFilters("query site:already.org", ["vitest.dev"]),
    "query site:already.org",
  );
  assert.equal(
    buildSearchQueryWithFilters("multi", ["a.com", "b.com"]),
    "multi site:a.com OR site:b.com",
  );
});
