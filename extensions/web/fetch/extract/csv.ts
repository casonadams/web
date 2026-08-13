const MAX_ROWS = 50;
const MAX_COLS = 20;
const MAX_CELL_CHARS = 200;

interface ParserState {
  rows: string[][];
  row: string[];
  field: string;
  inQuotes: boolean;
}

function appendUnquoted(
  state: ParserState,
  char: string,
  delimiter: string,
): boolean {
  if (char === '"') {
    state.inQuotes = true;
  } else if (char === delimiter) {
    state.row.push(state.field);
    state.field = "";
  } else if (char === "\n" || char === "\r") {
    state.row.push(state.field);
    state.rows.push(state.row);
    state.row = [];
    state.field = "";
    return char === "\r";
  } else {
    state.field += char;
  }
  return false;
}

function appendQuoted(state: ParserState, char: string, next: string): boolean {
  if (char !== '"') {
    state.field += char;
    return false;
  }
  if (next === '"') {
    state.field += '"';
    return true;
  }
  state.inQuotes = false;
  return false;
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const state: ParserState = {
    rows: [],
    row: [],
    field: "",
    inQuotes: false,
  };
  for (let i = 0; i < text.length; i += 1) {
    const skipNext = state.inQuotes
      ? appendQuoted(state, text[i], text[i + 1])
      : appendUnquoted(state, text[i], delimiter) && text[i + 1] === "\n";
    if (skipNext) i += 1;
  }
  if (state.field !== "" || state.row.length > 0) {
    state.row.push(state.field);
    state.rows.push(state.row);
  }
  return state.rows;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
}

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
