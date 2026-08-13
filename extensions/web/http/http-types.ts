export interface HttpRequestOptions {
  timeoutSec: number;
  maxBytes: number;
  pdfMaxBytes?: number;
  allowPrivateNetwork?: boolean;
  retries?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: string;
}

export type FetchTextOptions = HttpRequestOptions;

export interface BinaryResponse {
  body: Uint8Array;
  contentType: string;
  url: string;
}

export interface TextResponse {
  body: string;
  contentType: string;
  url: string;
}
