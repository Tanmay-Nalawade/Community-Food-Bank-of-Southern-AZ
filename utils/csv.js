// Minimal CSV reading/writing for the import/export scripts (RFC 4180:
// comma-separated, fields with commas, quotes or line breaks are wrapped in
// double quotes, and a quote inside one is doubled). Handles files saved by
// Excel, including its leading byte-order mark and CRLF line endings.

function parseCsv(text) {
  const input = String(text).replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (inQuotes) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") {
        i += 1;
      }
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Excel often leaves fully blank lines at the end.
  return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
}

// Returns one object per data row, keyed by the header row's column names,
// plus the row's line number in the file (header is line 1) for messages.
function parseCsvObjects(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) {
    return [];
  }

  const columns = header.map((name) => name.trim().toLowerCase());
  return rows.map((cells, index) => {
    const record = { line: index + 2 };
    columns.forEach((column, i) => {
      record[column] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

function toCsvField(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(columns, records) {
  const lines = [columns.join(",")];
  for (const record of records) {
    lines.push(columns.map((column) => toCsvField(record[column])).join(","));
  }
  return `${lines.join("\r\n")}\r\n`;
}

module.exports = { parseCsv, parseCsvObjects, toCsv };
