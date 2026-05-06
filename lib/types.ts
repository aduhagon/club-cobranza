export type Rol = 'admin' | 'cobrador' | 'consulta';

export interface Usuario {
  id: string;
  auth_id: string | null;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
}

export interface Club {
  id: string;
  nombre: string;
  direccion: string | null;
  cuit: string | null;
  contacto: string | null;
  logo_url: string | null;
  color_primario: string | null;
}

export interface Sucursal {
  id: string;
  codigo: string;
  nombre: string;
  numero_desde: number;
  numero_hasta: number | null;
  activa: boolean;
}

export interface TipoCuota {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
}

export interface ValorCuota {
  id: string;
  tipo_id: string;
  desde: string;
  importe: number;
}

export interface Socio {
  id: string;
  numero: number;
  nombre: string;
  dni: string | null;
  telefono: string | null;
  email: string | null;
  tipo_cuota_id: string | null;
  cobrador_id: string | null;
  fecha_alta: string;
  fecha_baja: string | null;
  motivo_baja: string | null;
  motivo_baja_otro: string | null;
  debito_automatico: boolean;
}

export interface Devengamiento {
  id: string;
  socio_id: string;
  tipo_id: string;
  periodo: string;
  importe: number;
  estado: 'pendiente' | 'pagado';
  origen: string;
  fecha_deveng: string;
  pago_id: string | null;
}

export interface Pago {
  id: string;
  sucursal_id: string;
  numero: number;
  socio_id: string;
  fecha_pago: string;
  fecha_emision: string;
  medio: string;
  importe: number;
  cobrador: string | null;
  cobrador_id: string | null;
  anulado: boolean;
  anulado_por: string | null;
  fecha_anulacion: string | null;
  motivo_anulacion: string | null;
  motivo_anulacion_otro: string | null;
  comentario_anulacion: string | null;
  prev_hash: string | null;
  hash: string | null;
}

export interface Rendicion {
  id: string;
  cobrador: string;
  cobrador_id: string;
  semana_inicio: string;
  semana_fin: string;
  fecha_cierre: string;
  estado: 'cerrada' | 'aprobada' | 'rechazada';
  total_cerrado: number;
  aprobada_por: string | null;
  fecha_aprobacion: string | null;
  rechazada_por: string | null;
  fecha_rechazo: string | null;
  motivo_rechazo: string | null;
  creado_en: string;
}
