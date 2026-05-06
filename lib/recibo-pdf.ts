import jsPDF from 'jspdf';
import { fmtMoney, fmtDate, formatNumeroRecibo, fmtMesLargo } from './utils';
import type { Pago, Sucursal, Socio, Club } from './types';

interface ReciboData {
  pago: Pago;
  sucursal: Sucursal;
  socio: Socio;
  club: Club;
  periodos: string[];
  tipoCuotaNombre?: string;
}

export function generarReciboPDF(data: ReciboData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: [80, 200] });
  const ancho = 80;
  let y = 8;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(data.club.nombre.toUpperCase(), ancho / 2, y, { align: 'center' });
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (data.club.direccion) { doc.text(data.club.direccion, ancho / 2, y, { align: 'center' }); y += 4; }
  if (data.club.contacto) { doc.text(data.club.contacto, ancho / 2, y, { align: 'center' }); y += 4; }
  if (data.club.cuit) { doc.text('CUIT: ' + data.club.cuit, ancho / 2, y, { align: 'center' }); y += 4; }

  y += 2;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(4, y, ancho - 4, y);
  y += 5;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  const numRecibo = formatNumeroRecibo(data.sucursal.codigo, data.pago.numero);
  doc.text('RECIBO N° ' + numRecibo, ancho / 2, y, { align: 'center' });
  y += 7;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const filas: [string, string][] = [
    ['Fecha:', fmtDate(data.pago.fecha_pago)],
    ['Socio:', data.socio.nombre],
    ['Socio N°:', String(data.socio.numero)],
  ];
  if (data.socio.dni) filas.push(['DNI:', data.socio.dni]);
  if (data.tipoCuotaNombre) filas.push(['Concepto:', data.tipoCuotaNombre]);
  if (data.periodos.length > 0) {
    const periodosStr = data.periodos.map(fmtMesLargo).join(', ');
    filas.push(['Período:', periodosStr]);
  }
  filas.push(['Medio de pago:', data.pago.medio]);
  if (data.pago.cobrador) filas.push(['Cobrador:', data.pago.cobrador]);

  for (const [label, value] of filas) {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 6, y);
    doc.setFont('helvetica', 'normal');
    const valueLines = doc.splitTextToSize(value, ancho - 30);
    doc.text(valueLines, 30, y);
    y += 4 * valueLines.length;
  }

  y += 2;
  doc.setLineDashPattern([1, 1], 0);
  doc.line(4, y, ancho - 4, y);
  y += 5;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('TOTAL:', 6, y);
  doc.text(fmtMoney(data.pago.importe), ancho - 6, y, { align: 'right' });
  y += 8;

  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text('Documento no válido como factura', ancho / 2, y, { align: 'center' });
  y += 4;

  if (data.pago.anulado) {
    y += 3;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 0, 0);
    doc.text('ANULADO', ancho / 2, y, { align: 'center' });
  }

  return doc;
}

export function descargarReciboPDF(data: ReciboData): void {
  const doc = generarReciboPDF(data);
  const numRecibo = formatNumeroRecibo(data.sucursal.codigo, data.pago.numero);
  doc.save(`Recibo-${numRecibo}.pdf`);
}
