-- Ejecutar una vez en la base climatizacion para habilitar el archivo de clientes.
USE climatizacion;

ALTER TABLE clientes
  ADD COLUMN archivado_en DATETIME NULL AFTER usuario_id,
  ADD COLUMN usuario_activo_previo TINYINT(1) NULL AFTER archivado_en;
