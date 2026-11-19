const pool = require('../config/db');
const { registrarCambio } = require('../utils/seguimiento');

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const aNumeros = (q) => ({ ...q, subtotal: Number(q.subtotal), iva: Number(q.iva), total: Number(q.total) });

function filtroPorRol(req) {
  return req.user.rol === 'cliente'
    ? { sql: ' AND c.usuario_id = ?', params: [req.user.id] }
    : { sql: '', params: [] };
}

// Valida los ítems y devuelve un texto de error, o null si están bien
function validarItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) {
    return 'La cotización debe tener entre 1 y 50 ítems';
  }
  for (const it of items) {
    if (!it.descripcion || !String(it.descripcion).trim()) return 'Cada ítem necesita una descripción';
    const cantidad = Number(it.cantidad);
    const valor = Number(it.valor_unitario);
    if (!(cantidad > 0) || cantidad > 100000) return 'La cantidad de cada ítem debe ser mayor que cero';
    if (!(valor >= 0) || valor > 1e9) return 'El valor unitario no es válido';
  }
  return null;
}

// POST /api/cotizaciones  (administrador)
// Los totales se calculan aquí en el servidor; nunca se confía en los que envíe el navegador.
exports.crear = async (req, res) => {
  const { solicitud_id, items, observaciones } = req.body;
  const porcentaje = req.body.iva_porcentaje === undefined || req.body.iva_porcentaje === '' ? 19 : Number(req.body.iva_porcentaje);

  if (!idValido(solicitud_id)) return res.status(400).json({ mensaje: 'Debes indicar la solicitud' });
  const error = validarItems(items);
  if (error) return res.status(400).json({ mensaje: error });
  if (!(porcentaje >= 0 && porcentaje <= 100)) return res.status(400).json({ mensaje: 'El IVA debe estar entre 0 y 100' });

  // Cálculo en centavos para evitar errores de decimales
  const subtotalC = items.reduce((suma, it) => suma + Math.round(Number(it.cantidad) * Number(it.valor_unitario) * 100), 0);
  const ivaC = Math.round((subtotalC * porcentaje) / 100);
  const subtotal = subtotalC / 100;
  const iva = ivaC / 100;
  const total = (subtotalC + ivaC) / 100;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [sol] = await conn.query('SELECT id, estado FROM solicitudes WHERE id = ? FOR UPDATE', [solicitud_id]);
    if (!sol[0]) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Solicitud no encontrada' });
    }
    if (sol[0].estado !== 'pendiente') {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Solo se puede cotizar una solicitud pendiente' });
    }

    const [r] = await conn.query(
      `INSERT INTO cotizaciones (solicitud_id, fecha, subtotal, iva, total, estado, observaciones)
       VALUES (?, CURDATE(), ?, ?, ?, 'enviada', ?)`,
      [solicitud_id, subtotal, iva, total, observaciones ? String(observaciones).trim() : null]
    );
    await conn.query(
      'INSERT INTO cotizacion_items (cotizacion_id, descripcion, cantidad, valor_unitario) VALUES ?',
      [items.map((it) => [r.insertId, String(it.descripcion).trim(), Number(it.cantidad), Number(it.valor_unitario)])]
    );
    await conn.query("UPDATE solicitudes SET estado = 'cotizada' WHERE id = ?", [solicitud_id]);
    await registrarCambio(conn, {
      solicitudId: Number(solicitud_id), anterior: 'pendiente', nuevo: 'cotizada',
      usuarioId: req.user.id, comentario: `Cotización #${r.insertId} enviada`,
    });
    await conn.commit();
    res.status(201).json({ id: r.insertId, subtotal, iva, total, mensaje: 'Cotización enviada' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ mensaje: 'Error al crear la cotización' });
  } finally {
    conn.release();
  }
};

// GET /api/cotizaciones?solicitud_id=
exports.listar = async (req, res) => {
  const { sql, params } = filtroPorRol(req);
  let filtroSolicitud = '';
  if (req.query.solicitud_id) {
    if (!idValido(req.query.solicitud_id)) return res.status(400).json({ mensaje: 'Solicitud no válida' });
    filtroSolicitud = ' AND q.solicitud_id = ?';
    params.push(Number(req.query.solicitud_id));
  }

  try {
    const [filas] = await pool.query(
      `SELECT q.id, q.solicitud_id, q.fecha, q.subtotal, q.iva, q.total, q.estado, c.nombre AS cliente_nombre
       FROM cotizaciones q
       JOIN solicitudes s ON s.id = q.solicitud_id
       JOIN clientes c ON c.id = s.cliente_id
       WHERE q.estado <> 'borrador'${sql}${filtroSolicitud}
       ORDER BY q.id DESC LIMIT 300`,
      params
    );
    res.json({ cotizaciones: filas.map(aNumeros) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al listar las cotizaciones' });
  }
};

// GET /api/cotizaciones/:id  (con sus ítems)
exports.obtener = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const { sql, params } = filtroPorRol(req);

  try {
    const [filas] = await pool.query(
      `SELECT q.*, s.tipo_servicio, s.descripcion AS solicitud_descripcion, c.nombre AS cliente_nombre
       FROM cotizaciones q
       JOIN solicitudes s ON s.id = q.solicitud_id
       JOIN clientes c ON c.id = s.cliente_id
       WHERE q.id = ? AND q.estado <> 'borrador'${sql}`,
      [req.params.id, ...params]
    );
    if (!filas[0]) return res.status(404).json({ mensaje: 'Cotización no encontrada' });

    const [items] = await pool.query(
      'SELECT id, descripcion, cantidad, valor_unitario FROM cotizacion_items WHERE cotizacion_id = ? ORDER BY id',
      [req.params.id]
    );
    res.json({
      cotizacion: aNumeros(filas[0]),
      items: items.map((i) => ({ ...i, cantidad: Number(i.cantidad), valor_unitario: Number(i.valor_unitario) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar la cotización' });
  }
};

// POST /api/cotizaciones/:id/responder  (cliente: { decision: 'aprobar' | 'rechazar', comentario })
exports.responder = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const { decision } = req.body;
  if (!['aprobar', 'rechazar'].includes(decision)) {
    return res.status(400).json({ mensaje: "La decisión debe ser 'aprobar' o 'rechazar'" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Solo el dueño de la solicitud puede responder
    const [filas] = await conn.query(
      `SELECT q.id, q.estado, q.solicitud_id
       FROM cotizaciones q
       JOIN solicitudes s ON s.id = q.solicitud_id
       JOIN clientes c ON c.id = s.cliente_id
       WHERE q.id = ? AND c.usuario_id = ? FOR UPDATE`,
      [req.params.id, req.user.id]
    );
    if (!filas[0]) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Cotización no encontrada' });
    }
    if (filas[0].estado !== 'enviada') {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Esta cotización ya fue respondida' });
    }

    const aprobar = decision === 'aprobar';
    const estadoCotizacion = aprobar ? 'aprobada' : 'rechazada';
    // Si la rechaza, la solicitud vuelve a "pendiente" para que se pueda cotizar de nuevo
    const estadoSolicitud = aprobar ? 'aprobada' : 'pendiente';
    const motivo = req.body.comentario ? `: ${String(req.body.comentario).trim()}` : '';

    await conn.query('UPDATE cotizaciones SET estado = ? WHERE id = ?', [estadoCotizacion, req.params.id]);
    await conn.query('UPDATE solicitudes SET estado = ? WHERE id = ?', [estadoSolicitud, filas[0].solicitud_id]);
    await registrarCambio(conn, {
      solicitudId: filas[0].solicitud_id, anterior: 'cotizada', nuevo: estadoSolicitud, usuarioId: req.user.id,
      comentario: `El cliente ${aprobar ? 'aprobó' : 'rechazó'} la cotización #${req.params.id}${motivo}`.slice(0, 255),
    });
    await conn.commit();
    res.json({ mensaje: aprobar ? 'Cotización aprobada' : 'Cotización rechazada' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ mensaje: 'Error al responder la cotización' });
  } finally {
    conn.release();
  }
};
