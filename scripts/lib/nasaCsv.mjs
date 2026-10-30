import { readFileSync } from "node:fs";

/** Reads a NASA archive CSV: `#` comment lines, then a quoted CSV table. */
export function readNasaCsv(path) {
  const text = readFileSync(path, "utf8");
  const descriptions = {};
  let retrieved = null;
  let position = 0;

  while (text[position] === "#") {
    const end = text.indexOf("\n", position);
    const line = text.slice(position, end).replace(/\r$/, "");
    const column = line.match(/^# COLUMN (\S+):\s+(.*)$/);
    const date = line.match(/^# (\w{3} \w{3} \d{1,2} [\d:]{8} \d{4})$/);
    if (column) descriptions[column[1]] = column[2].trim();
    if (date) retrieved = date[1];
    position = end + 1;
  }

  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let index = position; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character !== '"') field += character;
      else if (text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === ",") {
      row.push(field);
      field = "";
    } else if (character === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += character;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  const columns = rows.shift();
  const malformed = rows.filter((cells) => cells.length !== columns.length).length;
  const records = rows.map((cells) =>
    Object.fromEntries(columns.map((name, cell) => [name, cells[cell] ?? ""])),
  );
  return { columns, records, descriptions, retrieved, malformed };
}
