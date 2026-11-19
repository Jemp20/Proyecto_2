const pool = require('../config/db');
const { registrarCambio } = require('../utils/seguimiento');

const TIPOS = ['instalacion', 'mantenimiento_preventivo', 'mantenimiento_correctivo', 'revision'];
const ESTADOS = ['pendiente', 'cotizada', 'aprobada', 'programada', 'en_proceso', 'finalizada', 'cancelada'];

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;

// Un cliente solo ve sus solicitudes (según la cuenta con la que inició sesión)
function filtroPorRol(req) {
  return req.user.rol === 'cliente'
    ? { sql: ' AND c.usuario_id = ?', params: [req.user.id] }
    : { sql: '', params: [] };
}

// POST /api/solicitudes  (cliente: para sí mismo; administrador: indica cliente_id)
exports.crear = async (req, res) => {
  const { tipo_servicio, descripcion, equipo_id } = req.body;

  if (!TIPOS.includes(tipo_servicio)) {
    return res.status(400).json({ mensaje: `El tipo de servicio debe ser uno de: ${TIPOS.join(', ')}` });
  }
  if (!descripcion || descripcion.trim().length < 10) {
    return res.status(400).json({ mensaje: 'Describe el servicio con al menos 10 caracteres' });
  }

  const conn = await pool.getConnection();
  try {
    let clienteId;
    if (req.user.rol === 'cliente') {
      const [fichas] = await conn.query('SELECT id FROM clientes WHERE usuario_id = ?', [req.user.id]);
      if (!fichas[0]) return res.status(400).json({ mensaje: 'Tu cuenta no tiene una ficha de cliente' });
      clienteId = fichas[0].id;
    } else {
      if (!idValido(req.body.cliente_id)) return res.status(400).json({ mensaje: 'Debes indicar el cliente' });
      clienteId = Number(req.body.cliente_id);
      const [clientes] = await conn.query(
        'SELECT id FROM clientes WHERE id = ? AND archivado_en IS NULL',
        [clienteId]
      );
      if (!clientes[0]) return res.status(400).json({ mensaje: 'El cliente indicado no existe o está archivado' });
    }

    let equipoId = null;
    if (equipo_id !== undefined && equipo_id !== null && equipo_id !== '') {
      if (!idValido(equipo_id)) return res.status(400).json({ mensaje: 'Equipo no válido' });
      const [eq] = await conn.query('SELECT id FROM equipos WHERE id = ? AND cliente_id = ?', [equipo_id, clienteId]);
      if (!eq[0]) return res.status(400).json({ mensaje: 'El equipo no pertenece a este cliente' });
      equipoId = Number(equipo_id);
    }

    await conn.beginTransaction();
    const [r] = await conn.query(
      'INSERT INTO solicitudes (cliente_id, equipo_id, tipo_servicio, descripcion) VALUES (?, ?, ?, ?)',
      [clienteId, equipoId, tipo_servicio, descripcion.trim()]
    );
    await registrarCambio(conn, {
      solicitudId: r.insertId, anterior: null, nuevo: 'pendiente',
      usuarioId: req.user.id, comentario: 'Solicitud creada',
    });
    await conn.commit();
    res.status(201).json({ id: r.insertId, mensaje: 'Solicitud creada' });
  } catch (err) {
    await conn.rollback();
    if (err.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ mensaje: 'El cliente indicado no existe' });
    console.error(err);
    res.status(500).json({ mensaje: 'Error al crear la solicitud' });
  } finally {
    conn.release();
  }
};

// GET /api/solicitudes?estado=
exports.listar = async (req, res) => {
  const { sql, params } = filtroPorRol(req);
  let filtroEstado = '';
  if (req.query.estado) {
    if (!ESTADOS.includes(req.query.estado)) return res.status(400).json({ mensaje: 'Estado no válido' });
    filtroEstado = ' AND s.estado = ?';
    params.push(req.query.estado);
  }

  try {
    const [solicitudes] = await pool.query(
      `SELECT s.id, s.tipo_servicio, s.descripcion, s.estado, s.created_at,
              c.nombre AS cliente_nombre, e.tipo AS equipo_tipo, e.marca AS equipo_marca
       FROM solicitudes s
       JOIN clientes c ON c.id = s.cliente_id
       LEFT JOIN equipos e ON e.id = s.equipo_id
       WHERE 1 = 1${sql}${filtroEstado}
       ORDER BY s.created_at DESC, s.id DESC
       LIMIT 300`,
      params
    );
    res.json({ solicitudes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al listar las solicitudes' });
  }
};

// GET /api/solicitudes/:id  (con cotizaciones e historial de estados)
exports.obtener = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const { sql, params } = filtroPorRol(req);

  try {
    const [filas] = await pool.query(
      `SELECT s.*, c.nombre AS cliente_nombre, e.tipo AS equipo_tipo, e.marca AS equipo_marca, e.modelo AS equipo_modelo
       FROM solicitudes s
       JOIN clientes c ON c.id = s.cliente_id
       LEFT JOIN equipos e ON e.id = s.equipo_id
       WHERE s.id = ?${sql}`,
      [req.params.id, ...params]
    );
    if (!filas[0]) return res.status(404).json({ mensaje: 'Solicitud no encontrada' });

    const [cotizaciones] = await pool.query(
      `SELECT id, fecha, subtotal, iva, total, estado FROM cotizaciones
       WHERE solicitud_id = ? AND estado <> 'borrador' ORDER BY id DESC`,
      [req.params.id]
    );
    const [historial] = await pool.query(
      `SELECT sg.estado_anterior, sg.estado_nuevo, sg.comentario, sg.fecha, u.nombre AS usuario
       FROM seguimiento sg LEFT JOIN usuarios u ON u.id = sg.usuario_id
       WHERE sg.solicitud_id = ? ORDER BY sg.id`,
      [req.params.id]
    );

    res.json({
      solicitud: filas[0],
      cotizaciones: cotizaciones.map((q) => ({ ...q, subtotal: Number(q.subtotal), iva: Number(q.iva), total: Number(q.total) })),
      historial,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar la solicitud' });
  }
};

// POST /api/solicitudes/:id/cancelar  (solo si está pendiente o cotizada)
exports.cancelar = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const { sql, params } = filtroPorRol(req);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [filas] = await conn.query(
      `SELECT s.id, s.estado FROM solicitudes s JOIN clientes c ON c.id = s.cliente_id
       WHERE s.id = ?${sql} FOR UPDATE`,
      [req.params.id, ...params]
    );
    if (!filas[0]) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Solicitud no encontrada' });
    }
    if (!['pendiente', 'cotizada'].includes(filas[0].estado)) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Solo se pueden cancelar solicitudes pendientes o cotizadas' });
    }

    await conn.query("UPDATE solicitudes SET estado = 'cancelada' WHERE id = ?", [req.params.id]);
    await conn.query("UPDATE cotizaciones SET estado = 'rechazada' WHERE solicitud_id = ? AND estado = 'enviada'", [req.params.id]);
    await registrarCambio(conn, {
      solicitudId: Number(req.params.id), anterior: filas[0].estado, nuevo: 'cancelada',
      usuarioId: req.user.id, comentario: String(req.body.comentario || 'Solicitud cancelada').slice(0, 255),
    });
    await conn.commit();
    res.json({ mensaje: 'Solicitud cancelada' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ mensaje: 'Error al cancelar la solicitud' });
  } finally {
    conn.release();
  }
};
