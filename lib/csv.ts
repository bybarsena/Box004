export function csvText(rows: (string | number)[][]) {
  return rows
    .map((r) =>
      r
        .map((v) => {
          let s = String(v);
          if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "'" + s;
          return '"' + s.replace(/"/g, '""') + '"';
        })
        .join(";"),
    )
    .join("\r\n");
}
