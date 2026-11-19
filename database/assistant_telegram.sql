-- Ejecutar una vez en la base climatizacion para habilitar la vinculacion con Telegram.
USE climatizacion;

CREATE TABLE IF NOT EXISTS asistente_telegram_vinculos (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  chat_id VARCHAR(32) NOT NULL UNIQUE,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_asistente_telegram_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS asistente_telegram_codigos (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  codigo_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  expira_en DATETIME NOT NULL,
  CONSTRAINT fk_asistente_telegram_codigo_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;
