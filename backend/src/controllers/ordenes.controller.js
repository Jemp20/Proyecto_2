const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pool = require('../config/db');
const { registrarCambio } = require('../utils/seguimiento');

// Las fotos se guardan fuera de la carpeta pública y solo se entregan a quien tenga permiso
const DIR_EVIDENCIAS = path.join(__dirname, '..', '..', 'uploads', 'evidencias');
fs.mkdirSync(DIR_EVIDENCIAS, { recursive: true });

const EXTENSIONES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const MAX_EVIDENCIAS = 20;
const ESTADOS = ['asignada', 'en_proceso', 'finalizada', 'cancelada'];
const EVENTO = {
  instalacion: 'Instalación',
  mantenimiento_preventivo: 'Mantenimiento preventivo',
  mantenimiento_correctivo: 'Mantenimiento correctivo',
  revision: 'Revisión',
};

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const textoOpcional = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const largo = (v) => (v ? String(v).trim().length : 0);

// Cada rol ve su parte: el técnico, sus órdenes; el cliente, las de sus solicitudes
function filtroPorRol(req) {
  if (req.user.rol === 'tecnico') return { sql: ' AND t.usuario_id = ?', params: [req.user.id] };
  if (req.user.rol === 'cliente') return { sql: ' AND c.usuario_id = ?', params: [req.user.id] };
  return { sql: '', params: [] };
}

const DESDE = `FROM ordenes_servicio o
  JOIN solicitudes s ON s.id = o.solicitud_id
  JOIN clientes c ON c.id = s.cliente_id
  JOIN tecnicos t ON t.id = o.tecnico_id
  JOIN usuarios u ON u.id = t.usuario_id
  LEFT JOIN equipos e ON e.id = o.equipo_id`;

// ---------------------------------------------------------------------
// Recepción de fotos
// ---------------------------------------------------------------------
const subida = multer({
  storage: multer.diskStorage({
    destination: DIR_EVIDENCIAS,
    // El nombre se genera al azar y la extensión sale del tipo permitido, nunca del nombre original
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXTENSIONES[file.mimetype]),
  }),
  fileFilter: (req, file, cb) => cb(null, Boolean(EXTENSIONES[file.mimetype])),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

exports.subirFoto = (req, res, next) => {
  subida.single('foto')(req, res, (err) => {
    if (!err) return next();
    const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'La foto no puede superar los 5 MB' : 'No se pudo recibir la foto';
    res.status(400).json({ mensaje });
  });
};

// ---------------------------------------------------------------------
// Antes de modificar una orden: debe ser del técnico (o del admin) y seguir en proceso
// ---------------------------------------------------------------------
exports.cargarOrdenEditable = async (req, res, next) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const { sql, params } = filtroPorRol(req);
  try {
    const [filas] = await pool.query(
      `SELECT o.id, o.codigo, o.estado, o.solicitud_id, o.agenda_id, o.equipo_id, s.tipo_servicio ${DESDE}
       WHERE o.id = ?${sql}`,
      [req.params.id, ...params]
    );
    if (!filas[0]) return res.status(404).json({ mensaje: 'Orden no encontrada' });
    if (filas[0].estado !== 'en_proceso') {
      return res.status(409).json({ mensaje: 'Esta orden ya no se puede modificar' });
    }
    req.orden = filas[0];
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar la orden' });
  }
};

// ---------------------------------------------------------------------
// POST /api/ordenes  { agenda_id }  — el técnico inicia el servicio de su visita
// ---------------------------------------------------------------------
exports.crear = async (req, res) => {
  const { agenda_id } = req.body;
  if (!idValido(agenda_id)) return res.status(400).json({ mensaje: 'Debes indicar la visita' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [filas] = await conn.query(
      `SELECT a.id, a.estado, a.solicitud_id, a.tecnico_id, t.usuario_id,
              s.estado AS estado_solicitud, s.equipo_id
       FROM agenda a
       JOIN tecnicos t ON t.id = a.tecnico_id
       JOIN solicitudes s ON s.id = a.solicitud_id
       WHERE a.id = ? FOR UPDATE`,
      [agenda_id]
    );
    const visita = filas[0];
    // Un técnico solo puede iniciar sus propias visitas (a los demás les "no existe")
    if (!visita || (req.user.rol === 'tecnico' && visita.usuario_id !== req.user.id)) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Visita no encontrada' });
    }
    if (!['programada', 'reprogramada'].includes(visita.estado) || visita.estado_solicitud !== 'programada') {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Esta visita no está pendiente de atención' });
    }
    const [previas] = await conn.query(
      "SELECT id FROM ordenes_servicio WHERE agenda_id = ? AND estado <> 'cancelada'",
      [agenda_id]
    );
    if (previas[0]) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Ya existe una orden para esta visita' });
    }

    // El código definitivo (OS-2026-0007) se arma con el año y el número de la orden
    const [r] = await conn.query(
      `INSERT INTO ordenes_servicio (codigo, solicitud_id, agenda_id, tecnico_id, equipo_id, estado, fecha_inicio)
       VALUES (?, ?, ?, ?, ?, 'en_proceso', NOW())`,
      [`TMP-${crypto.randomBytes(6).toString('hex')}`, visita.solicitud_id, agenda_id, visita.tecnico_id, visita.equipo_id]
    );
    await conn.query("UPDATE ordenes_servicio SET codigo = CONCAT('OS-', YEAR(CURDATE()), '-', LPAD(id, 4, '0')) WHERE id = ?", [r.insertId]);
    const [[orden]] = await conn.query('SELECT codigo FROM ordenes_servicio WHERE id = ?', [r.insertId]);

    await conn.query("UPDATE solicitudes SET estado = 'en_proceso' WHERE id = ?", [visita.solicitud_id]);
    await registrarCambio(conn, {
      solicitudId: visita.solicitud_id, ordenId: r.insertId, anterior: 'programada', nuevo: 'en_proceso',
      usuarioId: req.user.id, comentario: `Servicio iniciado (orden ${orden.codigo})`,
    });
    await conn.commit();
    res.status(201).json({ id: r.insertId, codigo: orden.codigo, mensaje: 'Servicio iniciado' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ mensaje: 'Error al iniciar el servicio' });
  } finally {
    conn.release();
  }
};

// ---------------------------------------------------------------------
// GET /api/ordenes?estado=&solicitud_id=
// ---------------------------------------------------------------------
exports.listar = async (req, res) => {
  const { sql, params } = filtroPorRol(req);
  let filtros = '';
  if (req.query.estado) {
    if (!ESTADOS.includes(req.query.estado)) return res.status(400).json({ mensaje: 'Estado no válido' });
    filtros += ' AND o.estado = ?';
    params.push(req.query.estado);
  }
  if (req.query.solicitud_id) {
    if (!idValido(req.query.solicitud_id)) return res.status(400).json({ mensaje: 'Solicitud no válida' });
    filtros += ' AND o.solicitud_id = ?';
    params.push(Number(req.query.solicitud_id));
  }

  try {
    const [ordenes] = await pool.query(
      `SELECT o.id, o.codigo, o.estado, o.agenda_id, o.solicitud_id, o.fecha_inicio, o.fecha_fin,
              s.tipo_servicio, c.nombre AS cliente_nombre, u.nombre AS tecnico_nombre,
              e.id AS equipo_id, e.tipo AS equipo_tipo, e.marca AS equipo_marca
       ${DESDE}
       WHERE 1 = 1${sql}${filtros}
       ORDER BY o.id DESC LIMIT 300`,
      params
    );
    res.json({ ordenes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al listar las órdenes' });
  }
};

// ---------------------------------------------------------------------
// GET /api/ordenes/:id
// El cliente ve el detalle técnico solo cuando la orden está finalizada.
// ---------------------------------------------------------------------
exports.obtener = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const { sql, params } = filtroPorRol(req);
  const esCliente = req.user.rol === 'cliente';

  try {
    const [filas] = await pool.query(
      `SELECT o.*, s.tipo_servicio, s.descripcion AS solicitud_descripcion,
              c.nombre AS cliente_nombre, c.telefono AS cliente_telefono, c.direccion AS cliente_direccion,
              c.ciudad AS cliente_ciudad, u.nombre AS tecnico_nombre,
              e.tipo AS equipo_tipo, e.marca AS equipo_marca, e.modelo AS equipo_modelo,
              e.serial AS equipo_serial, e.ubicacion AS equipo_ubicacion
       ${DESDE}
       WHERE o.id = ?${sql}`,
      [req.params.id, ...params]
    );
    const orden = filas[0];
    if (!orden) return res.status(404).json({ mensaje: 'Orden no encontrada' });

    if (esCliente && orden.estado !== 'finalizada') {
      delete orden.diagnostico;
      delete orden.actividades_realizadas;
      delete orden.observaciones;
      delete orden.cliente_telefono;
      delete orden.cliente_direccion;
      return res.json({ orden, evidencias: [] });
    }

    const [evidencias] = await pool.query(
      'SELECT id, descripcion, created_at FROM evidencias WHERE orden_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json({ orden, evidencias });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar la orden' });
  }
};

// ---------------------------------------------------------------------
// PUT /api/ordenes/:id  — diagnóstico, actividades y observaciones
// ---------------------------------------------------------------------
exports.actualizar = async (req, res) => {
  const { diagnostico, actividades_realizadas, observaciones } = req.body;
  for (const texto of [diagnostico, actividades_realizadas, observaciones]) {
    if (texto !== undefined && texto !== null && String(texto).length > 5000) {
      return res.status(400).json({ mensaje: 'Cada texto puede tener hasta 5000 caracteres' });
    }
  }
  try {
    await pool.query(
      'UPDATE ordenes_servicio SET diagnostico = ?, actividades_realizadas = ?, observaciones = ? WHERE id = ?',
      [textoOpcional(diagnostico), textoOpcional(actividades_realizadas), textoOpcional(observaciones), req.orden.id]
    );
    res.json({ mensaje: 'Orden actualizada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al actualizar la orden' });
  }
};

// ---------------------------------------------------------------------
// POST /api/ordenes/:id/finalizar
// Cierra la orden, la visita y la solicitud, y deja el trabajo en el historial del equipo.
// ---------------------------------------------------------------------
exports.finalizar = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [filas] = await conn.query(
      `SELECT id, codigo, estado, solicitud_id, agenda_id, equipo_id, diagnostico, actividades_realizadas
       FROM ordenes_servicio WHERE id = ? FOR UPDATE`,
      [req.orden.id]
    );
    const o = filas[0];
    if (o.estado !== 'en_proceso') {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Esta orden ya fue finalizada' });
    }
    if (largo(o.diagnostico) < 10 || largo(o.actividades_realizadas) < 10) {
      await conn.rollback();
      return res.status(400).json({
        mensaje: 'Registra el diagnóstico y las actividades realizadas (mínimo 10 caracteres cada uno) antes de finalizar',
      });
    }

    await conn.query("UPDATE ordenes_servicio SET estado = 'finalizada', fecha_fin = NOW() WHERE id = ?", [o.id]);
    if (o.agenda_id) await conn.query("UPDATE agenda SET estado = 'cumplida' WHERE id = ?", [o.agenda_id]);
    await conn.query("UPDATE solicitudes SET estado = 'finalizada' WHERE id = ?", [o.solicitud_id]);
    await registrarCambio(conn, {
      solicitudId: o.solicitud_id, ordenId: o.id, anterior: 'en_proceso', nuevo: 'finalizada',
      usuarioId: req.user.id, comentario: `Servicio finalizado (orden ${o.codigo})`,
    });

    if (o.equipo_id) {
      await conn.query(
        'INSERT INTO historial_equipo (equipo_id, orden_id, evento, detalle) VALUES (?, ?, ?, ?)',
        [o.equipo_id, o.id, EVENTO[req.orden.tipo_servicio], `Diagnóstico: ${o.diagnostico}\nActividades: ${o.actividades_realizadas}`]
      );

      // Instalaciones y mantenimientos preventivos programan el próximo mantenimiento
      if (['instalacion', 'mantenimiento_preventivo'].includes(req.orden.tipo_servicio)) {
        const [mp] = await conn.query(
          'SELECT id, frecuencia_meses FROM mantenimientos_preventivos WHERE equipo_id = ? AND activo = 1 ORDER BY id DESC LIMIT 1',
          [o.equipo_id]
        );
        if (mp[0]) {
          await conn.query(
            'UPDATE mantenimientos_preventivos SET ultima_fecha = CURDATE(), proxima_fecha = DATE_ADD(CURDATE(), INTERVAL ? MONTH) WHERE id = ?',
            [mp[0].frecuencia_meses, mp[0].id]
          );
        } else {
          await conn.query(
            `INSERT INTO mantenimientos_preventivos (equipo_id, frecuencia_meses, ultima_fecha, proxima_fecha)
             VALUES (?, 6, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 6 MONTH))`,
            [o.equipo_id]
          );
        }
      }
    }
    await conn.commit();
    res.json({ mensaje: 'Servicio finalizado' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ mensaje: 'Error al finalizar el servicio' });
  } finally {
    conn.release();
  }
};

// ---------------------------------------------------------------------
// Evidencias fotográficas
// ---------------------------------------------------------------------
// POST /api/ordenes/:id/evidencias  (multipart: foto + descripcion)
exports.agregarEvidencia = async (req, res) => {
  if (!req.file) return res.status(400).json({ mensaje: 'Sube una foto en formato JPG, PNG o WEBP' });

  try {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM evidencias WHERE orden_id = ?', [req.orden.id]);
    if (total >= MAX_EVIDENCIAS) {
      fs.unlink(req.file.path, () => {});
      return res.status(409).json({ mensaje: `Cada orden admite hasta ${MAX_EVIDENCIAS} fotos` });
    }
    const [r] = await pool.query(
      'INSERT INTO evidencias (orden_id, ruta_archivo, descripcion) VALUES (?, ?, ?)',
      [req.orden.id, req.file.filename, textoOpcional(req.body.descripcion)?.slice(0, 200) || null]
    );
    res.status(201).json({ id: r.insertId, mensaje: 'Foto agregada' });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error(err);
    res.status(500).json({ mensaje: 'Error al guardar la foto' });
  }
};

// DELETE /api/ordenes/:id/evidencias/:evId
exports.eliminarEvidencia = async (req, res) => {
  if (!idValido(req.params.evId)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  try {
    const [filas] = await pool.query('SELECT id, ruta_archivo FROM evidencias WHERE id = ? AND orden_id = ?', [req.params.evId, req.orden.id]);
    if (!filas[0]) return res.status(404).json({ mensaje: 'Foto no encontrada' });
    await pool.query('DELETE FROM evidencias WHERE id = ?', [filas[0].id]);
    fs.unlink(path.join(DIR_EVIDENCIAS, path.basename(filas[0].ruta_archivo)), () => {});
    res.json({ mensaje: 'Foto eliminada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al eliminar la foto' });
  }
};

// GET /api/ordenes/:id/evidencias/:evId/archivo  — entrega la imagen solo a quien tiene permiso
exports.archivo = async (req, res) => {
  if (!idValido(req.params.id) || !idValido(req.params.evId)) {
    return res.status(400).json({ mensaje: 'Identificador no válido' });
  }
  const { sql, params } = filtroPorRol(req);
  try {
    const [filas] = await pool.query(
      `SELECT ev.ruta_archivo, o.estado
       FROM evidencias ev JOIN ordenes_servicio o ON o.id = ev.orden_id
       JOIN solicitudes s ON s.id = o.solicitud_id
       JOIN clientes c ON c.id = s.cliente_id
       JOIN tecnicos t ON t.id = o.tecnico_id
       WHERE ev.id = ? AND o.id = ?${sql}`,
      [req.params.evId, req.params.id, ...params]
    );
    const ev = filas[0];
    if (!ev || (req.user.rol === 'cliente' && ev.estado !== 'finalizada')) {
      return res.status(404).json({ mensaje: 'Foto no encontrada' });
    }
    const ruta = path.join(DIR_EVIDENCIAS, path.basename(ev.ruta_archivo));
    if (!fs.existsSync(ruta)) return res.status(404).json({ mensaje: 'Foto no encontrada' });

    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Cache-Control', 'private, max-age=3600');
    res.type(path.extname(ruta));
    res.sendFile(ruta);
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar la foto' });
  }
};

// ---------------------------------------------------------------------
// GET /api/ordenes/historial/:equipoId — historial técnico de un equipo
// ---------------------------------------------------------------------
exports.historialEquipo = async (req, res) => {
  if (!idValido(req.params.equipoId)) return res.status(400).json({ mensaje: 'Identificador no válido' });

  try {
    const [equipos] = await pool.query(
      `SELECT e.id, e.tipo, e.marca, e.modelo, e.serial, e.ubicacion, e.estado, e.fecha_instalacion,
              c.nombre AS cliente_nombre, c.usuario_id AS cliente_usuario
       FROM equipos e JOIN clientes c ON c.id = e.cliente_id WHERE e.id = ?`,
      [req.params.equipoId]
    );
    const equipo = equipos[0];
    let permitido = !!equipo && req.user.rol === 'administrador';
    if (equipo && req.user.rol === 'cliente') permitido = equipo.cliente_usuario === req.user.id;
    if (equipo && req.user.rol === 'tecnico') {
      // El técnico ve el historial de los equipos que tiene (o tuvo) en su agenda
      const [vinculo] = await pool.query(
        `SELECT 1 FROM agenda a JOIN tecnicos t ON t.id = a.tecnico_id JOIN solicitudes s ON s.id = a.solicitud_id
         WHERE t.usuario_id = ? AND s.equipo_id = ? LIMIT 1`,
        [req.user.id, equipo.id]
      );
      permitido = vinculo.length > 0;
    }
    if (!permitido) return res.status(404).json({ mensaje: 'Equipo no encontrado' });
    delete equipo.cliente_usuario;

    const [historial] = await pool.query(
      `SELECT h.id, h.evento, h.detalle, h.fecha, o.id AS orden_id, o.codigo, u.nombre AS tecnico_nombre
       FROM historial_equipo h
       LEFT JOIN ordenes_servicio o ON o.id = h.orden_id
       LEFT JOIN tecnicos t ON t.id = o.tecnico_id
       LEFT JOIN usuarios u ON u.id = t.usuario_id
       WHERE h.equipo_id = ? ORDER BY h.fecha DESC, h.id DESC`,
      [equipo.id]
    );
    const [prox] = await pool.query(
      `SELECT ultima_fecha, proxima_fecha, frecuencia_meses FROM mantenimientos_preventivos
       WHERE equipo_id = ? AND activo = 1 ORDER BY id DESC LIMIT 1`,
      [equipo.id]
    );
    res.json({ equipo, historial, proximo_mantenimiento: prox[0] || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar el historial' });
  }
};
