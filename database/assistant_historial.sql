-- Ejecutar una vez en la base climatizacion para habilitar historial sincronizado.
USE climatizacion;

CREATE TABLE IF NOT EXISTS asistente_historial (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  mensajes JSON NOT NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_asistente_historial_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
