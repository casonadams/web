export const FETCH_MODES = ["auto", "main", "full"] as const;
export type FetchMode = (typeof FETCH_MODES)[number];

type ExtractionKind =
  | "main"
  | "full"
  | "pdf"
  | "json"
  | "markdown"
  | "xml"
  | "csv"
  | "text";

export interface FetchedPage {
  content: string;
  total: number;
  nextOffset: number;
  extraction: ExtractionKind;
  finalUrl: string;
}

export interface PreparedLine {
  text: string;
  bytes: number;
}

export interface ExtractedResource {
  lines: PreparedLine[];
  extraction: ExtractionKind;
  finalUrl: string;
  size: number;
}

export interface ExtractedText {
  text: string;
  extraction: ExtractionKind;
}
