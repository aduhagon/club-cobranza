import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import { fmtMoney, fmtDate, fmtMesLargo } from './utils';
import type { Club } from './types';

interface ReporteExcelInput {
  filename: string;
  hojas: Array<{
    nombre: string;
    encabezados: string[];
    filas: (string | number | null)[][];
    anchos?: number[];
  }>;
}

export function exportarExcel(input: ReporteExcelInput) {
  const wb = XLSX.utils.book_new();
  for (const hoja of input.hojas) {
    const ws = XLSX.utils.aoa_to_sheet([hoja.encabezados, ...hoja.filas]);
    if (hoja.anchos) {
      ws['!cols'] = hoja.anchos.map((wch) => ({ wch }));
    }
    XLSX.utils.book_append_sheet(wb, ws, hoja.nombre);
  }
  XLSX.writeFile(wb, input.filename);
}

interface ReportePDFInput {
  filename: string;
  titulo: string;
  subtitulo?: string;
  club: Club | null;
  secciones: Array<{
    titulo: string;
    encabezados: string[];
    filas: (string | number)[][];
    totales?: { label: string; value: string }[];
  }>;
}

export async function exportarPDF(input: ReportePDFInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const ancho = 210;
  const margenIzq = 15;
  const margenDer = 15;
  const usable = ancho - margenIzq - margenDer;
  let y = 15;

  // Header con logo + título
  if (input.club?.logo_url) {
    try {
      const img = await loadImage(input.club.logo_url);
      if (img) {
        doc.addImage(img.dataUrl, img.type, margenIzq, y, 14, 14);
      }
    } catch {}
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  if (input.club?.nombre) {
    doc.text(input.club.nombre, margenIzq + 18, y + 5);
  }

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  if (input.club?.direccion) {
    doc.text(input.club.direccion, margenIzq + 18, y + 10);
  }
  y += 20;

  doc.setLineWidth(0.3);
  doc.line(margenIzq, y, ancho - margenDer, y);
  y += 6;

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text(input.titulo, margenIzq, y);
  y += 5;

  if (input.subtitulo) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(input.subtitulo, margenIzq, y);
    y += 5;
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, margenIzq, y);
  y += 8;

  // Secciones
  for (const seccion of input.secciones) {
    if (y > 260) { doc.addPage(); y = 20; }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(seccion.titulo, margenIzq, y);
    y += 6;

    if (seccion.filas.length > 0) {
      const colCount = seccion.encabezados.length;
      const colWidth = usable / colCount;

      // Encabezados
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(240, 240, 240);
      doc.rect(margenIzq, y - 3, usable, 6, 'F');
      seccion.encabezados.forEach((h, i) => {
        doc.text(h, margenIzq + 1 + i * colWidth, y);
      });
      y += 5;

      // Filas
      doc.setFont('helvetica', 'normal');
      for (const fila of seccion.filas) {
        if (y > 275) {
          doc.addPage();
          y = 20;
          // Re-imprimir encabezados
          doc.setFont('helvetica', 'bold');
          doc.setFillColor(240, 240, 240);
          doc.rect(margenIzq, y - 3, usable, 6, 'F');
          seccion.encabezados.forEach((h, i) => {
            doc.text(h, margenIzq + 1 + i * colWidth, y);
          });
          y += 5;
          doc.setFont('helvetica', 'normal');
        }
        fila.forEach((c, i) => {
          const text = String(c || '');
          const truncated = text.length > 25 ? text.slice(0, 23) + '..' : text;
          doc.text(truncated, margenIzq + 1 + i * colWidth, y);
        });
        y += 4;
      }
      y += 2;
    } else {
      doc.setFont('helvetica', 'italic');
      doc.text('Sin datos', margenIzq, y);
      y += 6;
    }

    // Totales
    if (seccion.totales && seccion.totales.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      for (const t of seccion.totales) {
        doc.text(`${t.label}: ${t.value}`, ancho - margenDer, y, { align: 'right' });
        y += 5;
      }
      y += 4;
    }

    y += 2;
  }

  doc.save(input.filename);
}

async function loadImage(url: string): Promise<{ dataUrl: string; type: 'PNG' | 'JPEG' } | null> {
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

interface EstadoCuentaPDFInput {
  filename: string;
  club: Club | null;
  socio: {
    numero: number;
    nombre: string;
    dni?: string | null;
    telefono?: string | null;
    email?: string | null;
    tipo_cuota?: string;
    cobrador?: string;
    fecha_alta?: string;
  };
  filas: Array<{
    periodo: string; // YYYY-MM
    devengado: number;
    pagado: number;
    fecha_pago: string | null;
    estado: 'pagado' | 'pendiente' | 'parcial';
    recibo: string | null;
  }>;
  totalDevengado: number;
  totalPagado: number;
  saldo: number;
}

export async function exportarEstadoCuentaPDF(input: EstadoCuentaPDFInput) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const ancho = 210;
  const margenIzq = 15;
  const margenDer = 15;
  const usable = ancho - margenIzq - margenDer;
  let y = 15;

  // Logo + datos del club
  if (input.club?.logo_url) {
    try {
      const img = await loadImage(input.club.logo_url);
      if (img) {
        doc.addImage(img.dataUrl, img.type, margenIzq, y, 16, 16);
      }
    } catch {}
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  if (input.club?.nombre) {
    doc.text(input.club.nombre, margenIzq + 20, y + 5);
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  let yC = y + 9;
  if (input.club?.direccion) { doc.text(input.club.direccion, margenIzq + 20, yC); yC += 4; }
  if (input.club?.contacto) { doc.text(input.club.contacto, margenIzq + 20, yC); yC += 4; }
  if (input.club?.cuit) { doc.text('CUIT: ' + input.club.cuit, margenIzq + 20, yC); yC += 4; }
  y = Math.max(y + 18, yC) + 2;

  doc.setLineWidth(0.3);
  doc.line(margenIzq, y, ancho - margenDer, y);
  y += 6;

  // Título
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.text('Estado de cuenta', margenIzq, y);
  y += 5;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(`Generado: ${new Date().toLocaleString('es-AR')}`, margenIzq, y);
  y += 6;

  // Datos del socio
  doc.setFillColor(245, 245, 240);
  doc.rect(margenIzq, y, usable, 22, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Socio N° ${input.socio.numero} - ${input.socio.nombre}`, margenIzq + 2, y + 5);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  let datosLine: string[] = [];
  if (input.socio.dni) datosLine.push(`DNI: ${input.socio.dni}`);
  if (input.socio.telefono) datosLine.push(`Tel: ${input.socio.telefono}`);
  if (input.socio.email) datosLine.push(`Email: ${input.socio.email}`);
  doc.text(datosLine.join('   '), margenIzq + 2, y + 10);

  let datosLine2: string[] = [];
  if (input.socio.tipo_cuota) datosLine2.push(`Tipo de cuota: ${input.socio.tipo_cuota}`);
  if (input.socio.cobrador) datosLine2.push(`Cobrador: ${input.socio.cobrador}`);
  if (input.socio.fecha_alta) datosLine2.push(`Alta: ${input.socio.fecha_alta}`);
  doc.text(datosLine2.join('   '), margenIzq + 2, y + 15);
  y += 26;

  // Encabezados de tabla
  const colWidths = [22, 28, 28, 28, 22, 42]; // Período, Devengado, Pagado, Fecha pago, Estado, Recibo
  const colX = [margenIzq];
  for (let i = 0; i < colWidths.length - 1; i++) {
    colX.push(colX[i] + colWidths[i]);
  }

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(220, 220, 220);
  doc.rect(margenIzq, y - 4, usable, 6, 'F');
  doc.text('Período', colX[0] + 1, y);
  doc.text('Devengado', colX[1] + 1, y);
  doc.text('Pagado', colX[2] + 1, y);
  doc.text('Fecha pago', colX[3] + 1, y);
  doc.text('Estado', colX[4] + 1, y);
  doc.text('Recibo', colX[5] + 1, y);
  y += 5;

  // Filas
  doc.setFont('helvetica', 'normal');
  for (const f of input.filas) {
    if (y > 275) {
      doc.addPage();
      y = 20;
      doc.setFont('helvetica', 'bold');
      doc.setFillColor(220, 220, 220);
      doc.rect(margenIzq, y - 4, usable, 6, 'F');
      doc.text('Período', colX[0] + 1, y);
      doc.text('Devengado', colX[1] + 1, y);
      doc.text('Pagado', colX[2] + 1, y);
      doc.text('Fecha pago', colX[3] + 1, y);
      doc.text('Estado', colX[4] + 1, y);
      doc.text('Recibo', colX[5] + 1, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
    }

    const fmtMes = formatMesLargoCompacto(f.periodo);
    doc.text(fmtMes, colX[0] + 1, y);
    doc.text('$ ' + formatNumberAR(f.devengado), colX[1] + 1, y);
    doc.text(f.pagado > 0 ? '$ ' + formatNumberAR(f.pagado) : '-', colX[2] + 1, y);
    doc.text(f.fecha_pago ? formatFechaAR(f.fecha_pago) : '-', colX[3] + 1, y);

    if (f.estado === 'pagado') {
      doc.setTextColor(40, 120, 40);
      doc.text('Pagado', colX[4] + 1, y);
    } else if (f.estado === 'parcial') {
      doc.setTextColor(180, 100, 0);
      doc.text('Parcial', colX[4] + 1, y);
    } else {
      doc.setTextColor(180, 0, 0);
      doc.text('Pendiente', colX[4] + 1, y);
    }
    doc.setTextColor(0, 0, 0);

    if (f.recibo) {
      doc.text(f.recibo, colX[5] + 1, y);
    }
    y += 4.5;
  }

  // Totales
  y += 2;
  doc.setLineWidth(0.3);
  doc.line(margenIzq, y, ancho - margenDer, y);
  y += 6;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Total devengado:', ancho - margenDer - 60, y);
  doc.text('$ ' + formatNumberAR(input.totalDevengado), ancho - margenDer, y, { align: 'right' });
  y += 6;
  doc.text('Total pagado:', ancho - margenDer - 60, y);
  doc.setTextColor(40, 120, 40);
  doc.text('$ ' + formatNumberAR(input.totalPagado), ancho - margenDer, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  y += 6;
  doc.setFontSize(11);
  doc.text('SALDO:', ancho - margenDer - 60, y);
  if (input.saldo > 0) doc.setTextColor(180, 0, 0);
  else if (input.saldo < 0) doc.setTextColor(40, 120, 40);
  doc.text('$ ' + formatNumberAR(input.saldo), ancho - margenDer, y, { align: 'right' });
  doc.setTextColor(0, 0, 0);

  if (input.saldo > 0) {
    y += 8;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text(`Saldo deudor: $ ${formatNumberAR(input.saldo)} pendiente de pago`, margenIzq, y);
  }

  doc.save(input.filename);
}

function formatNumberAR(n: number): string {
  return Math.abs(n).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatFechaAR(d: string): string {
  if (!d) return '';
  const dt = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  return dt.toLocaleDateString('es-AR');
}

function formatMesLargoCompacto(periodo: string): string {
  if (!periodo) return '';
  const [y, m] = periodo.split('-');
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  return `${meses[parseInt(m) - 1]} ${y}`;
}
