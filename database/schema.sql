-- =====================================================================
-- Sistema de información para la gestión y trazabilidad de servicios
-- de climatización  |  Base de datos MySQL 8+
-- =====================================================================

CREATE DATABASE IF NOT EXISTS climatizacion
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE climatizacion;

-- ---------------------------------------------------------------------
-- 1. USUARIOS Y AUTENTICACIÓN (Sprint 1)
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre        VARCHAR(120) NOT NULL,
  email         VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  auth_version  INT UNSIGNED NOT NULL DEFAULT 0,
  rol           ENUM('administrador','tecnico','cliente') NOT NULL DEFAULT 'cliente',
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE recuperacion_contrasena (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  expira_en DATETIME NOT NULL,
  creado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_recuperacion_contrasena_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS asistente_historial (
  usuario_id INT UNSIGNED NOT NULL PRIMARY KEY,
  mensajes JSON NOT NULL,
  actualizado_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_asistente_historial_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

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

-- ---------------------------------------------------------------------
-- 2. CLIENTES Y EQUIPOS (Sprint 2)
-- ---------------------------------------------------------------------
CREATE TABLE clientes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED NULL UNIQUE,          -- si el cliente tiene acceso al sistema
  archivado_en DATETIME NULL,
  usuario_activo_previo TINYINT(1) NULL,
  nombre      VARCHAR(150) NOT NULL,
  documento   VARCHAR(30)  NULL UNIQUE,          -- cédula o NIT
  telefono    VARCHAR(30)  NULL,
  email       VARCHAR(150) NULL,
  direccion   VARCHAR(200) NULL,
  ciudad      VARCHAR(80)  NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_clientes_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE equipos (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id         INT UNSIGNED NOT NULL,
  tipo               VARCHAR(60)  NOT NULL,       -- split, cassette, piso-techo, chiller...
  marca              VARCHAR(60)  NULL,
  modelo             VARCHAR(80)  NULL,
  serial             VARCHAR(80)  NULL,
  capacidad_btu      INT UNSIGNED NULL,
  ubicacion          VARCHAR(150) NULL,           -- sala, oficina, piso...
  fecha_instalacion  DATE NULL,
  estado             ENUM('activo','en_mantenimiento','fuera_de_servicio') NOT NULL DEFAULT 'activo',
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_equipos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  INDEX idx_equipos_cliente (cliente_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 3. SOLICITUDES Y COTIZACIONES (Sprint 3)
-- ---------------------------------------------------------------------
CREATE TABLE solicitudes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cliente_id    INT UNSIGNED NOT NULL,
  equipo_id     INT UNSIGNED NULL,               -- puede ser NULL en una instalación nueva
  tipo_servicio ENUM('instalacion','mantenimiento_preventivo','mantenimiento_correctivo','revision') NOT NULL,
  descripcion   TEXT NOT NULL,
  estado        ENUM('pendiente','cotizada','aprobada','programada','en_proceso','finalizada','cancelada')
                NOT NULL DEFAULT 'pendiente',
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_solicitudes_cliente FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  CONSTRAINT fk_solicitudes_equipo  FOREIGN KEY (equipo_id)  REFERENCES equipos(id) ON DELETE SET NULL,
  INDEX idx_solicitudes_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE cotizaciones (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  solicitud_id   INT UNSIGNED NOT NULL,
  fecha          DATE NOT NULL,
  subtotal       DECIMAL(12,2) NOT NULL DEFAULT 0,
  iva            DECIMAL(12,2) NOT NULL DEFAULT 0,
  total          DECIMAL(12,2) NOT NULL DEFAULT 0,
  estado         ENUM('borrador','enviada','aprobada','rechazada') NOT NULL DEFAULT 'borrador',
  observaciones  TEXT NULL,
  created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_cotizaciones_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE cotizacion_items (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cotizacion_id   INT UNSIGNED NOT NULL,
  descripcion     VARCHAR(200) NOT NULL,
  cantidad        DECIMAL(10,2) NOT NULL DEFAULT 1,
  valor_unitario  DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT fk_items_cotizacion FOREIGN KEY (cotizacion_id) REFERENCES cotizaciones(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 4. TÉCNICOS Y AGENDA (Sprint 4)
-- ---------------------------------------------------------------------
CREATE TABLE tecnicos (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NOT NULL UNIQUE,
  telefono      VARCHAR(30) NULL,
  especialidad  VARCHAR(100) NULL,
  activo        TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_tecnicos_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE agenda (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  solicitud_id      INT UNSIGNED NOT NULL,
  tecnico_id        INT UNSIGNED NOT NULL,
  fecha_programada  DATE NOT NULL,
  hora_inicio       TIME NOT NULL,
  hora_fin          TIME NULL,
  estado            ENUM('programada','reprogramada','cumplida','cancelada') NOT NULL DEFAULT 'programada',
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_agenda_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE,
  CONSTRAINT fk_agenda_tecnico   FOREIGN KEY (tecnico_id)   REFERENCES tecnicos(id),
  INDEX idx_agenda_fecha (fecha_programada, tecnico_id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- 5. ÓRDENES, EVIDENCIAS, HISTORIAL Y SEGUIMIENTO (Sprint 5)
-- ---------------------------------------------------------------------
CREATE TABLE ordenes_servicio (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo                  VARCHAR(20) NOT NULL UNIQUE,     -- ej. OS-2026-0001
  solicitud_id            INT UNSIGNED NOT NULL,
  agenda_id               INT UNSIGNED NULL,
  tecnico_id              INT UNSIGNED NOT NULL,
  equipo_id               INT UNSIGNED NULL,
  estado                  ENUM('asignada','en_proceso','finalizada','cancelada') NOT NULL DEFAULT 'asignada',
  diagnostico             TEXT NULL,
  actividades_realizadas  TEXT NULL,
  observaciones           TEXT NULL,
  fecha_inicio            DATETIME NULL,
  fecha_fin               DATETIME NULL,
  created_at              TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ordenes_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id),
  CONSTRAINT fk_ordenes_agenda    FOREIGN KEY (agenda_id)    REFERENCES agenda(id) ON DELETE SET NULL,
  CONSTRAINT fk_ordenes_tecnico   FOREIGN KEY (tecnico_id)   REFERENCES tecnicos(id),
  CONSTRAINT fk_ordenes_equipo    FOREIGN KEY (equipo_id)    REFERENCES equipos(id) ON DELETE SET NULL,
  INDEX idx_ordenes_estado (estado)
) ENGINE=InnoDB;

CREATE TABLE evidencias (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  orden_id      INT UNSIGNED NOT NULL,
  ruta_archivo  VARCHAR(255) NOT NULL,
  descripcion   VARCHAR(200) NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_evidencias_orden FOREIGN KEY (orden_id) REFERENCES ordenes_servicio(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Historial técnico: qué se le hizo a cada equipo y cuándo
CREATE TABLE historial_equipo (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  equipo_id   INT UNSIGNED NOT NULL,
  orden_id    INT UNSIGNED NULL,
  evento      VARCHAR(100) NOT NULL,              -- instalación, mantenimiento, reparación...
  detalle     TEXT NULL,
  fecha       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_historial_equipo FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE,
  CONSTRAINT fk_historial_orden  FOREIGN KEY (orden_id)  REFERENCES ordenes_servicio(id) ON DELETE SET NULL,
  INDEX idx_historial_equipo (equipo_id, fecha)
) ENGINE=InnoDB;

-- Seguimiento / trazabilidad: cada cambio de estado de una solicitud u orden
CREATE TABLE seguimiento (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  solicitud_id     INT UNSIGNED NOT NULL,
  orden_id         INT UNSIGNED NULL,
  estado_anterior  VARCHAR(30) NULL,
  estado_nuevo     VARCHAR(30) NOT NULL,
  usuario_id       INT UNSIGNED NULL,
  comentario       VARCHAR(255) NULL,
  fecha            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_seg_solicitud FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id) ON DELETE CASCADE,
  CONSTRAINT fk_seg_orden     FOREIGN KEY (orden_id)     REFERENCES ordenes_servicio(id) ON DELETE SET NULL,
  CONSTRAINT fk_seg_usuario   FOREIGN KEY (usuario_id)   REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_seg_solicitud (solicitud_id, fecha)
) ENGINE=InnoDB;

-- Mantenimiento preventivo: recordatorio de próximas visitas por equipo
CREATE TABLE mantenimientos_preventivos (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  equipo_id         INT UNSIGNED NOT NULL,
  frecuencia_meses  TINYINT UNSIGNED NOT NULL DEFAULT 6,
  ultima_fecha      DATE NULL,
  proxima_fecha     DATE NOT NULL,
  activo            TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_preventivo_equipo FOREIGN KEY (equipo_id) REFERENCES equipos(id) ON DELETE CASCADE,
  INDEX idx_preventivo_proxima (proxima_fecha)
) ENGINE=InnoDB;
