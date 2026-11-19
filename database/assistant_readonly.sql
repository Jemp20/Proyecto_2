
-- Ejecutar como administrador en MySQL Workbench.
-- Sustituye el marcador por una contraseña única antes de ejecutar.

CREATE USER IF NOT EXISTS 'climatizacion_asistente'@'localhost'
  IDENTIFIED BY 'REEMPLAZAR_ANTES_DE_EJECUTAR';

GRANT SELECT (estado)
  ON climatizacion.solicitudes
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (id, cliente_id, equipo_id, tipo_servicio, estado, created_at)
  ON climatizacion.solicitudes
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (id, cliente_id, tipo, marca, modelo, capacidad_btu, ubicacion, fecha_instalacion, estado)
  ON climatizacion.equipos
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (id, nombre, ciudad)
  ON climatizacion.clientes
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (equipo_id, activo, proxima_fecha, ultima_fecha, frecuencia_meses)
  ON climatizacion.mantenimientos_preventivos
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (id, codigo, solicitud_id, tecnico_id, equipo_id, estado, fecha_inicio, fecha_fin)
  ON climatizacion.ordenes_servicio
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (id, usuario_id, especialidad, activo)
  ON climatizacion.tecnicos
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (id, nombre)
  ON climatizacion.usuarios
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (id, solicitud_id, tecnico_id, fecha_programada, hora_inicio, hora_fin, estado)
  ON climatizacion.agenda
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (id, solicitud_id, fecha, subtotal, iva, total, estado)
  ON climatizacion.cotizaciones
  TO 'climatizacion_asistente'@'localhost';

GRANT SELECT (id, equipo_id, orden_id, evento, fecha)
  ON climatizacion.historial_equipo
  TO 'climatizacion_asistente'@'localhost';
