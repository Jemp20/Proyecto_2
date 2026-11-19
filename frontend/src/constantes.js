export const ESTADO_EQUIPO = {
  activo: 'Activo',
  en_mantenimiento: 'En mantenimiento',
  fuera_de_servicio: 'Fuera de servicio',
};

export const ROL = { administrador: 'Administrador', tecnico: 'Técnico', cliente: 'Cliente' };

export const ESTADO_SOLICITUD = {
  pendiente: 'Pendiente',
  cotizada: 'Cotizada',
  aprobada: 'Aprobada',
  programada: 'Programada',
  en_proceso: 'En proceso',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

export const TIPO_SERVICIO = {
  instalacion: 'Instalación',
  mantenimiento_preventivo: 'Mantenimiento preventivo',
  mantenimiento_correctivo: 'Mantenimiento correctivo',
  revision: 'Revisión',
};

export const ESTADO_COTIZACION = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

// Pesos colombianos, con decimales solo cuando hacen falta
export const moneda = (n) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(n);

// Las fechas llegan como 'AAAA-MM-DD HH:MM:SS'; se muestra solo el día
export const fecha = (texto) => (texto ? String(texto).slice(0, 10) : '—');


export const ESTADO_VISITA = {
  programada: 'Programada',
  reprogramada: 'Reprogramada',
  cumplida: 'Cumplida',
  cancelada: 'Cancelada',
};

export const ESTADO_ORDEN = {
  asignada: 'Asignada',
  en_proceso: 'En proceso',
  finalizada: 'Finalizada',
  cancelada: 'Cancelada',
};

export function fechaHora(valor) {
  if (!valor) return '—';

  const fecha = new Date(String(valor).replace(' ', 'T'));

  if (Number.isNaN(fecha.getTime())) return '—';

  return fecha.toLocaleString('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

// Las horas llegan como 'HH:MM:SS'; se muestran como 'HH:MM'
export const hora = (texto) => (texto ? String(texto).slice(0, 5) : '');