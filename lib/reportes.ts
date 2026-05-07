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
