import { parentPort, workerData } from "node:worker_threads";
import { extractLinks, extractText, getDocumentProxy, getMeta } from "unpdf";

interface WorkerResult {
  text?: string;
  error?: string;
}

function metadataValue(value: unknown): string | undefined {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  try {
    const [{ totalPages, text }, { links }, metadata] = await Promise.all([
      extractText(pdf, { mergePages: false }),
      extractLinks(pdf),
      getMeta(pdf, { parseDates: true }),
    ]);
    const pages = text
      .map((page, index) => `[Page ${index + 1}/${totalPages}]\n${page.trim()}`)
      .filter((page) => page.replace(/^\[Page \d+\/\d+\]\s*/, "").trim());
    if (pages.length === 0) {
      throw new Error("PDF contains no extractable text (it may require OCR)");
    }

    const info = metadata.info as Record<string, unknown>;
    const metadataLines = [
      `Pages: ${totalPages}`,
      metadataValue(info.Title)
        ? `Title: ${metadataValue(info.Title)}`
        : undefined,
      metadataValue(info.Author)
        ? `Author: ${metadataValue(info.Author)}`
        : undefined,
      metadataValue(info.Subject)
        ? `Subject: ${metadataValue(info.Subject)}`
        : undefined,
      metadataValue(info.CreationDate)
        ? `Created: ${metadataValue(info.CreationDate)}`
        : undefined,
      metadataValue(info.ModDate)
        ? `Modified: ${metadataValue(info.ModDate)}`
        : undefined,
    ].filter((value): value is string => Boolean(value));
    const uniqueLinks = [...new Set(links)].filter((link) =>
      /^https?:\/\//i.test(link),
    );
    const linkSection =
      uniqueLinks.length > 0
        ? `[PDF links]\n${uniqueLinks.map((link) => `- ${link}`).join("\n")}`
        : undefined;
    return [
      `[PDF metadata]\n${metadataLines.join("\n")}`,
      pages.join("\n\n"),
      linkSection,
    ]
      .filter(Boolean)
      .join("\n\n");
  } finally {
    await pdf.loadingTask.destroy();
  }
}

if (!parentPort || !(workerData instanceof Uint8Array)) {
  throw new Error("PDF worker requires a Uint8Array payload");
}
const port = parentPort;

extractPdfText(workerData).then(
  (text) => port.postMessage({ text } satisfies WorkerResult),
  (error) =>
    port.postMessage({
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResult),
);
