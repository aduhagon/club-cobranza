export function fmtMoney(n: number | string): string {
  const num = Number(n) || 0;
  return '$' + num.toLocaleString('es-AR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

export function fmtDate(d: string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d.length === 10 ? d + 'T00:00:00' : d);
  return dt.toLocaleDateString('es-AR');
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '';
  return new Date(d).toLocaleString('es-AR');
}

export function fmtMesLargo(periodo: string | null | undefined): string {
  if (!periodo) return '';
  const [y, m] = periodo.split('-');
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  return `${meses[parseInt(m) - 1]} ${y}`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function thisMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function formatNumeroRecibo(codigo: string, numero: number): string {
  return `${codigo}-${String(numero).padStart(8, '0')}`;
}

export function simpleHash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(13, '0');
}

export function normalize(s: string): string {
  if (!s) return '';
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

// Convierte HEX a RGB y devuelve un color "oscurecido" para hover
export function darkenHex(hex: string, percent: number = 15): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  const factor = (100 - percent) / 100;
  const newR = Math.max(0, Math.floor(r * factor));
  const newG = Math.max(0, Math.floor(g * factor));
  const newB = Math.max(0, Math.floor(b * factor));
  return '#' + [newR, newG, newB].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Convierte HEX a RGB con un componente alpha bajo (para fondos suaves)
export function hexToBg(hex: string, alpha: number = 0.12): string {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
