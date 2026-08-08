import assert from "node:assert/strict";
import { test } from "node:test";
import { relaxedSearchQueries } from "./query-utils.ts";

test("relaxedSearchQueries: removes quotes and natural-language filler", () => {
  assert.deepEqual(
    relaxedSearchQueries(
      "Beyond Inc Overstock Midvale Utah number of employees LinkedIn",
    ),
    ["Beyond Inc Overstock Midvale Utah employees LinkedIn"],
  );
  assert.deepEqual(
    relaxedSearchQueries(
      '1-800 Contacts Draper Utah Glassdoor "Mobile Phone Discount"',
    ),
    ["1-800 Contacts Draper Utah Glassdoor Mobile Phone Discount"],
  );
  assert.deepEqual(
    relaxedSearchQueries("please find API docs site:nodejs.org"),
    ["API docs site:nodejs.org"],
  );
});
