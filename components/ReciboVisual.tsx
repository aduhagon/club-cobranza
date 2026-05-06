'use client';

import { fmtMoney, fmtDate, formatNumeroRecibo, fmtMesLargo } from '@/lib/utils';
import type { Pago, Sucursal, Socio, Club } from '@/lib/types';

interface Props {
  pago: Pago;
  sucursal: Sucursal;
  socio: Socio;
  club: Club;
  periodos: string[];
  tipoCuotaNombre?: string;
}

export default function ReciboVisual({ pago, sucursal, socio, club, periodos, tipoCuotaNombre }: Props) {
  return (
    <div className="recibo-preview">
      <div className="head">
        <div className="nombre">{club.nombre}</div>
        {club.direccion && <div>{club.direccion}</div>}
        {club.contacto && <div>{club.contacto}</div>}
        {club.cuit && <div>CUIT: {club.cuit}</div>}
      </div>
      <div className="num">RECIBO N° {formatNumeroRecibo(sucursal.codigo, pago.numero)}</div>
      <div className="row"><span className="lbl">Fecha:</span><span className="val">{fmtDate(pago.fecha_pago)}</span></div>
      <div className="row"><span className="lbl">Socio:</span><span className="val">{socio.nombre}</span></div>
      <div className="row"><span className="lbl">Socio N°:</span><span className="val">{socio.numero}</span></div>
      {socio.dni && <div className="row"><span className="lbl">DNI:</span><span className="val">{socio.dni}</span></div>}
      {tipoCuotaNombre && <div className="row"><span className="lbl">Concepto:</span><span className="val">{tipoCuotaNombre}</span></div>}
      {periodos.length > 0 && (
        <div className="row"><span className="lbl">Período:</span><span className="val">{periodos.map(fmtMesLargo).join(', ')}</span></div>
      )}
      <div className="row"><span className="lbl">Medio de pago:</span><span className="val">{pago.medio}</span></div>
      {pago.cobrador && <div className="row"><span className="lbl">Cobrador:</span><span className="val">{pago.cobrador}</span></div>}
      <div className="total">
        <span>TOTAL:</span>
        <span>{fmtMoney(pago.importe)}</span>
      </div>
      <div className="pie">Documento no válido como factura</div>
      {pago.anulado && <div className="anulado">ANULADO</div>}
    </div>
  );
}
