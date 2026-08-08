const MAX_ROWS = 50;
const MAX_COLS = 20;
const MAX_CELL_CHARS = 200;

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && text[i + 1] === "\n") i += 1;
    } else {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
}

/** Format CSV/TSV as a compact Markdown table, bounded to avoid context bloat. */
export function extractCsv(body: string, delimiter: string): string {
  const rows = parseDelimited(body, delimiter).filter((row) =>
    row.some((cell) => cell.trim() !== ""),
  );
  if (rows.length === 0) return "Empty CSV/TSV content.";

  const colCount = Math.min(
    MAX_COLS,
    rows.reduce((max, row) => Math.max(max, row.length), 0),
  );
  const header = rows[0].slice(0, colCount);
  while (header.length < colCount) header.push("");
  const dataRows = rows.slice(1, MAX_ROWS);
  const formatRow = (row: string[]) =>
    `| ${row
      .slice(0, colCount)
      .map((cell) => escapeCell(truncate(cell, MAX_CELL_CHARS)))
      .join(" | ")} |`;

  const table = [
    formatRow(header),
    `| ${header.map(() => "---").join(" | ")} |`,
    ...dataRows.map(formatRow),
  ].join("\n");

  const notes: string[] = [];
  if (rows.length - 1 > dataRows.length) {
    notes.push(
      `showing first ${dataRows.length} of ${rows.length - 1} data rows`,
    );
  }
  if (rows[0].length > colCount) {
    notes.push(`showing first ${colCount} of ${rows[0].length} columns`);
  }
  return notes.length > 0
    ? `${table}\n\n[Truncated: ${notes.join("; ")}]`
    : table;
}
