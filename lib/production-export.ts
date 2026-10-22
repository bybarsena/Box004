import type { Order } from "./types";
import { number, statuses } from "./types";
import { productionSummary, productionOrders } from "./production";
export type ExportOptions = {
  title: string;
  scope: string;
  includeNames: boolean;
  createdAt: Date;
};
const stamp = (d: Date) =>
  d.toLocaleString("es-ES", {
    timeZone: "Europe/Madrid",
    dateStyle: "short",
    timeStyle: "short",
  });
const fileName = (o: ExportOptions) =>
  `box004-produccion-${o.createdAt.toISOString().slice(0, 10)}`;
export async function productionPdf(input: Order[], options: ExportOptions) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const orders = productionOrders(input),
    summary = productionSummary(orders);
  if (!orders.length)
    throw new Error("Selecciona al menos un pedido no cancelado.");
  const doc = new jsPDF();
  const fonts = await import("./production-font");
  doc.addFileToVFS("Box-Regular.ttf", fonts.regular);
  doc.addFont("Box-Regular.ttf", "Box", "normal");
  doc.addFileToVFS("Box-Bold.ttf", fonts.bold);
  doc.addFont("Box-Bold.ttf", "Box", "bold");
  const units = summary.reduce((s, r) => s + r.quantity, 0);
  doc.setProperties({
    title: options.title,
    author: "Box 004 Santiago",
    subject: "Lote de producción",
  });
  const header = (section: string) => {
    doc.setFillColor(27, 28, 27);
    doc.rect(0, 0, 210, 29, "F");
    doc.setFont("Box", "bold");
    doc.setFontSize(18);
    doc.setTextColor(255, 255, 255);
    doc.text("BOX", 14, 18);
    doc.setTextColor(255, 196, 0);
    doc.text("004", 33, 18);
    doc.setFontSize(9);
    doc.text("SANTIAGO / PRODUCCIÓN", 196, 17, { align: "right" });
    doc.setTextColor(30, 30, 30);
    doc.setFontSize(18);
    doc.text(section, 14, 42);
    doc.setFontSize(9);
    doc.setFont("Box", "normal");
    doc.text(doc.splitTextToSize(options.title, 180).slice(0, 2), 14, 50);
    doc.text(`${stamp(options.createdAt)} · ${options.scope}`, 14, 62);
    doc.setFillColor(255, 196, 0);
    doc.roundedRect(14, 68, 182, 18, 2, 2, "F");
    doc.setFont("Box", "bold");
    doc.setFontSize(12);
    doc.text(
      `${orders.length} pedidos     /     ${units} prendas     /     ${summary.length} combinaciones`,
      20,
      79,
    );
  };
  const tableStyle = {
    font: "Box",
    fontSize: 9,
    cellPadding: 3,
    overflow: "linebreak" as const,
    textColor: [35, 35, 35] as [number, number, number],
    lineColor: [225, 225, 220] as [number, number, number],
    lineWidth: 0.1,
  };
  header("Resumen para fabricar");
  autoTable(doc, {
    startY: 94,
    margin: { top: 20, bottom: 18, left: 14, right: 14 },
    head: [["Prenda", "Modelo", "Color", "Talla", "Unidades"]],
    body: summary.map((r) => [r.product, r.model, r.color, r.size, r.quantity]),
    foot: [["TOTAL", "", "", "", units]],
    showFoot: "lastPage",
    rowPageBreak: "avoid",
    styles: tableStyle,
    headStyles: { fillColor: [27, 28, 27], textColor: [255, 255, 255] },
    footStyles: { fillColor: [255, 196, 0], textColor: [27, 28, 27] },
    alternateRowStyles: { fillColor: [246, 246, 241] },
    columnStyles: {
      0: { cellWidth: 65 },
      3: { cellWidth: 18 },
      4: { cellWidth: 27, halign: "right" },
    },
  });
  doc.addPage();
  header("Desglose por pedido");
  const body = orders.flatMap((o) =>
    o.order_items.map((i) => [
      number(o.sequence),
      ...(options.includeNames ? [`${o.first_name} ${o.last_name}`] : []),
      `${i.product_name}\n${i.model}`,
      i.color,
      i.size,
      String(i.quantity),
      ...(options.includeNames
        ? [[o.notes, o.admin_notes].filter(Boolean).join(" / ")]
        : []),
    ]),
  );
  autoTable(doc, {
    startY: 94,
    margin: { top: 20, bottom: 18, left: 14, right: 14 },
    head: [
      [
        "Pedido",
        ...(options.includeNames ? ["Cliente"] : []),
        "Prenda / modelo",
        "Color",
        "Talla",
        "Ud.",
        ...(options.includeNames ? ["Notas"] : []),
      ],
    ],
    body,
    styles: { ...tableStyle, fontSize: options.includeNames ? 8 : 9 },
    headStyles: { fillColor: [27, 28, 27], textColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: [246, 246, 241] },
    rowPageBreak: "avoid",
  });
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(100);
    doc.text("BOX 004 · Lote de producción", 14, 289);
    doc.text(`${p} / ${pages}`, 196, 289, { align: "right" });
  }
  return doc;
}
export async function productionExcel(input: Order[], options: ExportOptions) {
  const { default: ExcelJS } = await import("exceljs");
  const orders = productionOrders(input),
    summary = productionSummary(orders);
  if (!orders.length)
    throw new Error("Selecciona al menos un pedido no cancelado.");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Box 004 Santiago";
  wb.created = options.createdAt;
  const units = summary.reduce((s, r) => s + r.quantity, 0);
  const makeSheet = (name: string, headers: string[], widths: number[]) => {
    const ws = wb.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 7, showGridLines: false }],
      pageSetup: {
        paperSize: 9,
        orientation: "landscape",
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: "1:7",
      },
    });
    ws.columns = widths.map((width) => ({ width }));
    const last = headers.length;
    for (const [row, text] of [
      [1, "BOX 004 SANTIAGO"],
      [2, options.title],
      [3, `${stamp(options.createdAt)} · ${options.scope}`],
      [
        4,
        `${orders.length} pedidos · ${units} prendas · ${summary.length} combinaciones`,
      ],
    ] as [number, string][]) {
      ws.mergeCells(row, 1, row, last);
      const cell = ws.getCell(row, 1);
      cell.value = text;
      cell.font = {
        name: "Calibri",
        size: row === 1 ? 20 : 11,
        bold: row === 1 || row === 4,
        color: { argb: row === 1 ? "FFFFC400" : "FF222222" },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
      ws.getRow(row).height = row === 1 ? 38 : 32;
      if (row === 1)
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1B1C1B" },
        };
    }
    ws.getRow(7).values = headers;
    ws.getRow(7).height = 26;
    ws.getRow(7).eachCell((c) => {
      c.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1B1C1B" },
      };
      c.font = {
        name: "Calibri",
        size: 11,
        bold: true,
        color: { argb: "FFFFFFFF" },
      };
      c.alignment = { vertical: "middle" };
    });
    ws.headerFooter.oddFooter =
      "&LBox 004 Santiago - Producción&R Página &P de &N";
    return ws;
  };
  const styleData = (
    ws: import("exceljs").Worksheet,
    count: number,
    cols: number,
  ) => {
    for (let r = 8; r < 8 + count; r++) {
      const row = ws.getRow(r);
      row.height = 30;
      let lines = 1;
      for (let c = 1; c <= cols; c++) {
        const value = row.getCell(c).value;
        if (typeof value === "string") {
          const width = Math.max(10, Number(ws.getColumn(c).width || 20) - 3);
          lines = Math.max(
            lines,
            ...value
              .split("\n")
              .map((part) => Math.max(1, Math.ceil(part.length / width))),
          );
        }
      }
      row.height = Math.min(409, Math.max(30, lines * 15 + 12));
      for (let c = 1; c <= cols; c++) {
        const cell = row.getCell(c);
        cell.font = { name: "Calibri", size: 11 };
        cell.alignment = { vertical: "middle", wrapText: true };
        if (r % 2 === 0)
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3F3ED" },
          };
      }
    }
    ws.autoFilter = {
      from: { row: 7, column: 1 },
      to: { row: Math.max(7, 7 + count), column: cols },
    };
  };
  const ws = makeSheet(
    "Resumen producción",
    ["Prenda", "Modelo", "Color", "Talla", "Unidades"],
    [42, 26, 22, 14, 16],
  );
  summary.forEach((r) =>
    ws.addRow([r.product, r.model, r.color, r.size, r.quantity]),
  );
  styleData(ws, summary.length, 5);
  const total = ws.addRow([
    "TOTAL",
    null,
    null,
    null,
    { formula: `SUM(E8:E${7 + summary.length})`, result: units },
  ]);
  total.height = 28;
  total.eachCell({ includeEmpty: true }, (c) => {
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFC400" },
    };
    c.font = { bold: true, name: "Calibri", size: 12 };
  });
  ws.getColumn(5).numFmt = "#,##0";
  const headers = [
    "Pedido",
    "Fecha",
    "Estado",
    ...(options.includeNames ? ["Cliente"] : []),
    "Prenda",
    "Modelo",
    "Color",
    "Talla",
    "Unidades",
    ...(options.includeNames ? ["Notas del cliente", "Notas internas"] : []),
  ];
  const widths = [
    18,
    16,
    23,
    ...(options.includeNames ? [28] : []),
    38,
    24,
    20,
    12,
    14,
    ...(options.includeNames ? [44, 44] : []),
  ];
  const detail = makeSheet("Detalle pedidos", headers, widths);
  for (const o of orders)
    for (const i of o.order_items) {
      const row = detail.addRow([
        number(o.sequence),
        new Date(o.created_at),
        statuses[o.status] || o.status,
        ...(options.includeNames ? [`${o.first_name} ${o.last_name}`] : []),
        i.product_name,
        i.model,
        i.color,
        i.size,
        i.quantity,
        ...(options.includeNames ? [o.notes, o.admin_notes] : []),
      ]);
      row.getCell(2).numFmt = "dd/mm/yyyy";
    }
  styleData(
    detail,
    orders.reduce((s, o) => s + o.order_items.length, 0),
    headers.length,
  );
  return wb;
}
export async function downloadProduction(
  format: "pdf" | "xlsx",
  orders: Order[],
  options: ExportOptions,
) {
  if (format === "pdf") {
    const doc = await productionPdf(orders, options);
    doc.save(`${fileName(options)}.pdf`);
    return;
  }
  const wb = await productionExcel(orders, options);
  const buffer = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer as ArrayBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `${fileName(options)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
