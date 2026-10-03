import { formatCurrency } from "@/lib/currency";
import { orderDiscountOf, orderTotals, round2, totalPaid } from "@/lib/sales/orders";
import { FORMA_DE_PAGO_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/sales/status";
import type { OrderPayment, SaleOrder } from "@/lib/sales/types";

export type PdfLine = { name: string; ref: string | null; qty: number; unit: number; total: number };

const INK: [number, number, number] = [15, 23, 42];
const SOFT: [number, number, number] = [107, 114, 128];
const LINE: [number, number, number] = [229, 231, 235];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric", timeZone: "America/Mexico_City" });
}

// The cart as a PDF statement — buyer, forma de pago, factura, every
// article with units / price per unit / total, then subtotal, discount,
// IVA, total and what's paid. The money comes from the same functions the
// cart screen uses, so the two can't disagree. Built in the browser (the
// PDF library is only loaded when you press the button) and downloaded
// straight away.
export async function downloadOrderPdf(order: SaleOrder, lines: PdfLine[], payments: OrderPayment[]): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;

  const { subtotal, discount, iva, total } = orderTotals(
    lines.map((l) => l.total),
    order.requires_invoice,
    orderDiscountOf(order),
  );
  const paid = totalPaid(payments);
  const saldo = Math.max(0, round2(total - paid));
  const pieces = lines.reduce((n, l) => n + l.qty, 0);

  // Header
  doc.setTextColor(...INK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Amarisa Café", M, 52);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...SOFT);
  doc.text("Venta de liquidación — detalle del pedido", M, 68);

  // Buyer / date / forma de pago / factura
  const metaTop = 80;
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.8);
  doc.roundedRect(M, metaTop, pageW - 2 * M, 46, 4, 4);
  const meta: [string, string][] = [
    ["COMPRADOR", order.name],
    ["FECHA", formatDate(order.closed_at ?? order.created_at)],
    ["FORMA DE PAGO", order.payment_method ? FORMA_DE_PAGO_LABELS[order.payment_method] : "—"],
    ["FACTURA", order.requires_invoice ? "Sí" : "No"],
  ];
  const colW = (pageW - 2 * M - 24) / meta.length;
  meta.forEach(([label, value], i) => {
    const x = M + 12 + i * colW;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...SOFT);
    doc.text(label, x, metaTop + 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(value, x, metaTop + 33, { maxWidth: colW - 8 });
  });

  // Articles
  autoTable(doc, {
    startY: metaTop + 46 + 16,
    margin: { left: M, right: M, bottom: 54 },
    theme: "plain",
    head: [["#", "Artículo", "Ref.", "Cant.", "Precio c/u", "Total"]],
    body: lines.map((l, i) => [String(i + 1), l.name.trim(), l.ref ?? "", String(l.qty), formatCurrency(l.unit), formatCurrency(l.total)]),
    styles: { font: "helvetica", fontSize: 9.5, cellPadding: { top: 5, bottom: 5, left: 5, right: 5 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.6 } },
    headStyles: { fontSize: 7.5, fontStyle: "bold", textColor: SOFT, lineColor: INK, lineWidth: { bottom: 1.2 } },
    columnStyles: {
      0: { cellWidth: 24, textColor: [154, 161, 172] },
      1: { fontStyle: "bold" },
      2: { font: "courier", fontSize: 8, textColor: SOFT, cellWidth: 62 },
      3: { halign: "right", cellWidth: 38 },
      4: { halign: "right", cellWidth: 74 },
      5: { halign: "right", cellWidth: 78 },
    },
    didParseCell: (data) => {
      if (data.section === "head" && [3, 4, 5].includes(data.column.index)) data.cell.styles.halign = "right";
    },
  });

  let y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? metaTop + 80) + 18;

  // Totals — kept together on one page
  const totalRows: { label: string; value: string; bold?: boolean; big?: boolean }[] = [
    { label: `Subtotal · ${lines.length} ${lines.length === 1 ? "artículo" : "artículos"} · ${pieces} ${pieces === 1 ? "pieza" : "piezas"}`, value: formatCurrency(subtotal) },
  ];
  if (discount > 0) {
    totalRows.push({
      label: `Descuento${order.discount_type === "percent" ? ` (${Number(order.discount_value)}%)` : ""}`,
      value: `-${formatCurrency(discount)}`,
    });
  }
  if (order.requires_invoice) totalRows.push({ label: "IVA (16%)", value: formatCurrency(iva) });
  totalRows.push({ label: "Total a pagar", value: formatCurrency(total), bold: true, big: true });
  if (paid !== 0) totalRows.push({ label: "Pagado", value: formatCurrency(paid) });
  totalRows.push({ label: "Saldo pendiente", value: formatCurrency(saldo), bold: true });

  if (y + totalRows.length * 17 + 20 > pageH - 54) {
    doc.addPage();
    y = M + 6;
  }
  for (const row of totalRows) {
    if (row.big) y += 5;
    doc.setFont("helvetica", row.bold ? "bold" : "normal");
    doc.setFontSize(row.big ? 13 : 10);
    doc.setTextColor(...(row.bold ? INK : SOFT));
    doc.text(row.label, pageW - M - 120, y, { align: "right" });
    doc.setTextColor(...INK);
    doc.text(row.value, pageW - M, y, { align: "right" });
    y += row.big ? 21 : 16;
  }

  // Payments, when there are any
  if (payments.length > 0) {
    y += 12;
    if (y + 60 > pageH - 54) {
      doc.addPage();
      y = M + 6;
    }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text("Pagos", M, y);
    autoTable(doc, {
      startY: y + 6,
      margin: { left: M, right: M, bottom: 54 },
      theme: "plain",
      head: [["Fecha", "Forma de pago", "Nota", "Monto"]],
      body: payments.map((p) => [
        new Date(`${p.paid_at}T12:00:00`).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }),
        PAYMENT_METHOD_LABELS[p.method],
        p.note ?? "",
        formatCurrency(p.amount),
      ]),
      styles: { font: "helvetica", fontSize: 9, cellPadding: 4, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.6 } },
      headStyles: { fontSize: 7.5, fontStyle: "bold", textColor: SOFT, lineColor: INK, lineWidth: { bottom: 1.2 } },
      columnStyles: { 3: { halign: "right", cellWidth: 80 } },
      didParseCell: (data) => {
        if (data.section === "head" && data.column.index === 3) data.cell.styles.halign = "right";
      },
    });
    y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 14;
  }

  // Footnote + page numbers
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SOFT);
    doc.text(
      `Importes en pesos mexicanos (MXN).${order.requires_invoice ? ` El IVA se calcula sobre el subtotal${discount > 0 ? " con descuento" : ""}.` : ""}`,
      M,
      pageH - 28,
    );
    if (pages > 1) doc.text(`Página ${p} de ${pages}`, pageW - M, pageH - 28, { align: "right" });
  }

  // Download
  const blob = doc.output("blob");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Pedido ${order.name}.pdf`.replace(/[\\/:*?"<>|]+/g, "-");
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
