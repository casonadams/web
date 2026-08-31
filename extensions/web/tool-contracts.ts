import { StringEnum } from "@earendil-works/pi-ai";
import { type Static, Type } from "typebox";
import { config } from "./config.ts";
import { FETCH_MODES, type FetchedPage } from "./fetch/fetch-types.ts";

const MAX_SEARCH_RESULTS = 10;
export const DEFAULT_SEARCH_LIMIT = Math.min(
  config.maxResults,
  MAX_SEARCH_RESULTS,
);

export const SEARCH_RECENCY_OPTIONS = ["day", "week", "month", "year"] as const;
export type SearchRecency = (typeof SEARCH_RECENCY_OPTIONS)[number];

export const webSearchParameters = Type.Object({
  query: Type.String({ description: "Search query" }),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: MAX_SEARCH_RESULTS,
      description: `Maximum results to return (default ${DEFAULT_SEARCH_LIMIT})`,
    }),
  ),
  recency: Type.Optional(
    StringEnum(SEARCH_RECENCY_OPTIONS, {
      description:
        "Filter search results by time period: 'day', 'week', 'month', or 'year'",
    }),
  ),
  domains: Type.Optional(
    Type.Array(Type.String(), {
      description:
        "Limit results to specific domains (e.g. ['github.com']) or exclude domains with a leading '-' (e.g. ['-spam.com'])",
    }),
  ),
});

export const webFetchParameters = Type.Object({
  url: Type.String({ description: "URL to fetch" }),
  offset: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Line number to start from (1-indexed, default 1)",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 2000,
      description: `Maximum number of lines to return (default ${config.fetchLimit})`,
    }),
  ),
  mode: Type.Optional(
    StringEnum(FETCH_MODES, {
      description:
        'HTML extraction mode (default "auto"). Use "full" when navigation or sidebars matter.',
    }),
  ),
});

export type WebSearchInput = Static<typeof webSearchParameters>;
export type WebFetchInput = Static<typeof webFetchParameters>;

export interface WebSearchDetails {
  count: number;
  engine: string;
}

export interface WebFetchDetails {
  sourceUrl: string;
  finalUrl: string;
  extraction: FetchedPage["extraction"];
}
