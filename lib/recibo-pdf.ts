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

// Carga una imagen y la convierte a base64 dataURL para jsPDF
async function loadImageAsDataUrl(url: string): Promise<{ dataUrl: string; type: 'PNG' | 'JPEG' } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    const type: 'PNG' | 'JPEG' = blob.type.includes('png') ? 'PNG' : 'JPEG';
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve({ dataUrl: reader.result as string, type });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generarReciboPDF(data: ReciboData): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: [80, 220] });
  const ancho = 80;
  let y = 6;

  // Logo del club si existe
  if (data.club.logo_url) {
    const img = await loadImageAsDataUrl(data.club.logo_url);
    if (img) {
      const logoSize = 18;
      try {
        doc.addImage(img.dataUrl, img.type, (ancho - logoSize) / 2, y, logoSize, logoSize);
        y += logoSize + 2;
      } catch {
        // Si falla la carga del logo, sigue sin él
      }
    }
  }

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(data.club.nombre.toUpperCase(), ancho / 2, y, { align: 'center' });
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  if (data.club.direccion) {
    const lines = doc.splitTextToSize(data.club.direccion, ancho - 8);
    doc.text(lines, ancho / 2, y, { align: 'center' });
    y += 4 * lines.length;
  }
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

export async function descargarReciboPDF(data: ReciboData): Promise<void> {
  const doc = await generarReciboPDF(data);
  const numRecibo = formatNumeroRecibo(data.sucursal.codigo, data.pago.numero);
  doc.save(`Recibo-${numRecibo}.pdf`);
}
