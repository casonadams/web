export type FetchMode = "auto" | "main" | "full";

export type ExtractionKind =
  | "main"
  | "full"
  | "pdf"
  | "json"
  | "markdown"
  | "xml"
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
