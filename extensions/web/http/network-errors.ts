interface ErrorDetails {
  code?: unknown;
  message?: unknown;
  address?: unknown;
  port?: unknown;
  cause?: unknown;
  errors?: unknown;
}

function errorSummary(details: ErrorDetails): string | undefined {
  const code = typeof details.code === "string" ? details.code : undefined;
  const message =
    typeof details.message === "string" ? details.message : undefined;
  const address =
    typeof details.address === "string" ? details.address : undefined;
  const port =
    typeof details.port === "string" || typeof details.port === "number"
      ? String(details.port)
      : undefined;
  const location = address ? ` at ${address}${port ? `:${port}` : ""}` : "";
  return code ? `${code}${location}` : message;
}

function collectNetworkDetails(error: unknown, output: string[]): void {
  if (!error || typeof error !== "object" || output.length >= 4) return;
  const details = error as ErrorDetails;
  const summary = errorSummary(details);
  if (summary && summary !== "fetch failed" && !output.includes(summary)) {
    output.push(summary);
  }
  const nestedErrors = Array.isArray(details.errors) ? details.errors : [];
  for (const nested of nestedErrors) collectNetworkDetails(nested, output);
  collectNetworkDetails(details.cause, output);
}

export function networkError(error: unknown): Error {
  const details: string[] = [];
  collectNetworkDetails(error, details);
  const fallback = error instanceof Error ? error.message : String(error);
  return new Error(`request failed: ${details.join(", ") || fallback}`);
}
