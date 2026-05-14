'use client';

import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import type { Socio, TipoCuota } from '@/lib/types';

interface CarnetSocioProps {
  socio: Socio;
  tipoCuota: string;
  logoUrl?: string | null;
  nombreClub?: string;
  onClose: () => void;
}

export default function CarnetSocio({ socio, tipoCuota, logoUrl, nombreClub, onClose }: CarnetSocioProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState('');

  const urlVerificacion = `${window.location.origin}/verificar/${socio.id}`;

  useEffect(() => {
    QRCode.toDataURL(urlVerificacion, {
      width: 200,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    }).then(setQrDataUrl);
  }, [socio.id]);

  function handleImprimir() {
    window.print();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>Carnet de {socio.nombre}</h3>

        {/* Carnet visual */}
        <div id="carnet-imprimible" style={styles.carnet}>
          {/* Encabezado del club */}
          <div style={styles.header}>
            {logoUrl && (
              <img src={logoUrl} alt="Logo" style={{ width: 48, height: 48, objectFit: 'contain', borderRadius: 6 }} />
            )}
            <div>
              <div style={styles.clubNombre}>{nombreClub || 'Club'}</div>
              <div style={styles.carnetTitulo}>CARNET DE SOCIO</div>
            </div>
          </div>

          <div style={styles.divider} />

          {/* Datos + QR */}
          <div style={styles.body}>
            <div style={styles.datos}>
              <div style={styles.numero}>N° {socio.numero}</div>
              <div style={styles.nombre}>{socio.nombre}</div>
              {socio.dni && <div style={styles.campo}><span style={styles.label}>DNI:</span> {socio.dni}</div>}
              <div style={styles.campo}><span style={styles.label}>Categoría:</span> {tipoCuota}</div>
              {socio.fecha_alta && (
                <div style={styles.campo}>
                  <span style={styles.label}>Alta:</span>{' '}
                  {new Date(socio.fecha_alta + 'T12:00:00').toLocaleDateString('es-AR')}
                </div>
              )}
            </div>
            <div style={styles.qrWrap}>
              {qrDataUrl && <img src={qrDataUrl} alt="QR" style={{ width: 110, height: 110 }} />}
              <div style={styles.qrLabel}>Escanear para verificar</div>
            </div>
          </div>

          <div style={styles.footer}>
            Verificá el estado en: <span style={{ fontWeight: 600 }}>{window.location.host}/verificar</span>
          </div>
        </div>

        {/* URL de verificación */}
        <div style={{ marginTop: 12, background: '#f8fafc', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#64748b', wordBreak: 'break-all' }}>
          <strong>URL de verificación:</strong><br />
          <a href={urlVerificacion} target="_blank" rel="noreferrer" style={{ color: '#3b82f6' }}>{urlVerificacion}</a>
        </div>

        <div className="actions" style={{ justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose}>Cerrar</button>
          <button className="primary" onClick={handleImprimir}>🖨️ Imprimir carnet</button>
        </div>
      </div>

      {/* Estilos de impresión */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #carnet-imprimible, #carnet-imprimible * { visibility: visible !important; }
          #carnet-imprimible {
            position: fixed !important;
            top: 20mm !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            width: 85mm !important;
            box-shadow: none !important;
          }
        }
      `}</style>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  carnet: {
    border: '2px solid #e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    background: 'white',
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  header: {
    background: 'linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)',
    padding: '14px 18px',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  clubNombre: {
    color: 'white',
    fontWeight: 700,
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  carnetTitulo: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  divider: {
    height: 3,
    background: 'linear-gradient(90deg, #2563eb, #60a5fa, #2563eb)',
  },
  body: {
    padding: '14px 18px',
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
  },
  datos: {
    flex: 1,
  },
  numero: {
    fontSize: 13,
    fontWeight: 700,
    color: '#2563eb',
    letterSpacing: 1,
    marginBottom: 4,
  },
  nombre: {
    fontSize: 17,
    fontWeight: 700,
    color: '#0f172a',
    marginBottom: 8,
    lineHeight: 1.2,
  },
  campo: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 3,
  },
  label: {
    color: '#94a3b8',
    fontWeight: 600,
  },
  qrWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  qrLabel: {
    fontSize: 9,
    color: '#94a3b8',
    textAlign: 'center',
    maxWidth: 100,
    lineHeight: 1.3,
  },
  footer: {
    background: '#f8fafc',
    borderTop: '1px solid #e2e8f0',
    padding: '8px 18px',
    fontSize: 10,
    color: '#94a3b8',
    textAlign: 'center',
  },
};
