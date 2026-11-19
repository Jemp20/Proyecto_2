const pool = require('../config/db');
const { registrarCambio } = require('../utils/seguimiento');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const ESTADOS = ['programada', 'reprogramada', 'cumplida', 'cancelada'];

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const fechaReal = (f) => FECHA_RE.test(f) && new Date(`${f}T00:00:00Z`).toISOString().slice(0, 10) === f;

// Devuelve un texto con el error, o null si la fecha y las horas están bien
function validarVisita({ fecha_programada, hora_inicio, hora_fin }) {
  if (!fechaReal(fecha_programada)) return 'La fecha debe tener el formato AAAA-MM-DD';
  if (!HORA_RE.test(hora_inicio || '')) return 'La hora de inicio debe tener el formato HH:MM';
  if (!HORA_RE.test(hora_fin || '')) return 'La hora de fin debe tener el formato HH:MM';
  if (hora_fin <= hora_inicio) return 'La hora de fin debe ser posterior a la de inicio';
  return null;
}

// Busca una visita del mismo técnico que se cruce con el horario pedido
async function buscarCruce(conn, { tecnicoId, fecha, inicio, fin, excluirId = 0 }) {
  const [filas] = await conn.query(
    `SELECT id, hora_inicio, hora_fin FROM agenda
     WHERE tecnico_id = ? AND fecha_programada = ? AND estado IN ('programada', 'reprogramada')
       AND id <> ? AND hora_inicio < ? AND COALESCE(hora_fin, ADDTIME(hora_inicio, '02:00:00')) > ?`,
    [tecnicoId, fecha, excluirId, fin, inicio]
  );
  return filas[0];
}

// Verifica que el técnico exista y esté activo (y lo bloquea mientras dura la transacción)
async function obtenerTecnico(conn, tecnicoId) {
  const [filas] = await conn.query(
    `SELECT t.id, u.nombre FROM tecnicos t JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.id = ? AND t.activo = 1 FOR UPDATE`,
    [tecnicoId]
  );
  return filas[0];
}

async function fechaPasada(conn, fecha) {
  const [[{ hoy }]] = await conn.query('SELECT CURDATE() AS hoy');
  return fecha < String(hoy).slice(0, 10);
}

// Cada rol ve solo su parte: el técnico, sus visitas; el cliente, las de sus solicitudes
function filtroPorRol(req) {
  if (req.user.rol === 'tecnico') return { sql: ' AND t.usuario_id = ?', params: [req.user.id] };
  if (req.user.rol === 'cliente') return { sql: ' AND c.usuario_id = ?', params: [req.user.id] };
  return { sql: '', params: [] };
}


// Una visita con orden de servicio activa o finalizada ya no se puede cancelar ni reprogramar
async function tieneOrden(conn, agendaId) {
  const [filas] = await conn.query("SELECT id FROM ordenes_servicio WHERE agenda_id = ? AND estado <> 'cancelada' LIMIT 1", [agendaId]);
  return filas.length > 0;
}

// POST /api/agenda  (administrador)
exports.crear = async (req, res) => {
  const { solicitud_id, tecnico_id, fecha_programada, hora_inicio, hora_fin } = req.body;
  if (!idValido(solicitud_id)) return res.status(400).json({ mensaje: 'Debes indicar la solicitud' });
  if (!idValido(tecnico_id)) return res.status(400).json({ mensaje: 'Debes indicar el técnico' });
  const error = validarVisita(req.body);
  if (error) return res.status(400).json({ mensaje: error });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (await fechaPasada(conn, fecha_programada)) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'No se puede programar una visita en una fecha pasada' });
    }

    const [sol] = await conn.query('SELECT id, estado FROM solicitudes WHERE id = ? FOR UPDATE', [solicitud_id]);
    if (!sol[0]) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Solicitud no encontrada' });
    }
    if (sol[0].estado !== 'aprobada') {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Solo se puede programar una solicitud con cotización aprobada' });
    }

    const tecnico = await obtenerTecnico(conn, tecnico_id);
    if (!tecnico) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'El técnico no existe o está inactivo' });
    }

    const cruce = await buscarCruce(conn, { tecnicoId: tecnico.id, fecha: fecha_programada, inicio: hora_inicio, fin: hora_fin });
    if (cruce) {
      await conn.rollback();
      return res.status(409).json({
        mensaje: `${tecnico.nombre} ya tiene una visita de ${String(cruce.hora_inicio).slice(0, 5)} a ${String(cruce.hora_fin).slice(0, 5)} ese día`,
      });
    }

    const [r] = await conn.query(
      `INSERT INTO agenda (solicitud_id, tecnico_id, fecha_programada, hora_inicio, hora_fin)
       VALUES (?, ?, ?, ?, ?)`,
      [solicitud_id, tecnico.id, fecha_programada, hora_inicio, hora_fin]
    );
    await conn.query("UPDATE solicitudes SET estado = 'programada' WHERE id = ?", [solicitud_id]);
    await registrarCambio(conn, {
      solicitudId: Number(solicitud_id), anterior: 'aprobada', nuevo: 'programada', usuarioId: req.user.id,
      comentario: `Visita programada con ${tecnico.nombre}: ${fecha_programada} de ${hora_inicio} a ${hora_fin}`,
    });
    await conn.commit();
    res.status(201).json({ id: r.insertId, mensaje: 'Visita programada' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ mensaje: 'Error al programar la visita' });
  } finally {
    conn.release();
  }
};

// GET /api/agenda?tecnico_id=&estado=&desde=&hasta=
exports.listar = async (req, res) => {
  const { sql, params } = filtroPorRol(req);
  let filtros = '';

  if (req.query.tecnico_id && req.user.rol === 'administrador') {
    if (!idValido(req.query.tecnico_id)) return res.status(400).json({ mensaje: 'Técnico no válido' });
    filtros += ' AND a.tecnico_id = ?';
    params.push(Number(req.query.tecnico_id));
  }
  if (req.query.estado) {
    if (!ESTADOS.includes(req.query.estado)) return res.status(400).json({ mensaje: 'Estado no válido' });
    filtros += ' AND a.estado = ?';
    params.push(req.query.estado);
  }
  for (const [clave, operador] of [['desde', '>='], ['hasta', '<=']]) {
    if (req.query[clave]) {
      if (!fechaReal(req.query[clave])) return res.status(400).json({ mensaje: `La fecha "${clave}" no es válida` });
      filtros += ` AND a.fecha_programada ${operador} ?`;
      params.push(req.query[clave]);
    }
  }

  try {
    const [visitas] = await pool.query(
      `SELECT a.id, a.solicitud_id, a.tecnico_id, a.fecha_programada, a.hora_inicio, a.hora_fin, a.estado,
              s.tipo_servicio, s.descripcion,
              c.nombre AS cliente_nombre, c.direccion AS cliente_direccion,
              c.telefono AS cliente_telefono, c.ciudad AS cliente_ciudad,
              e.tipo AS equipo_tipo, e.marca AS equipo_marca, e.modelo AS equipo_modelo, e.ubicacion AS equipo_ubicacion,
              u.nombre AS tecnico_nombre
       FROM agenda a
       JOIN solicitudes s ON s.id = a.solicitud_id
       JOIN clientes c ON c.id = s.cliente_id
       LEFT JOIN equipos e ON e.id = s.equipo_id
       JOIN tecnicos t ON t.id = a.tecnico_id
       JOIN usuarios u ON u.id = t.usuario_id
       WHERE 1 = 1${sql}${filtros}
       ORDER BY a.fecha_programada, a.hora_inicio
       LIMIT 500`,
      params
    );
    res.json({ visitas });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar la agenda' });
  }
};

// PUT /api/agenda/:id/reprogramar  (administrador; puede cambiar también de técnico)
exports.reprogramar = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  if (req.body.tecnico_id !== undefined && !idValido(req.body.tecnico_id)) {
    return res.status(400).json({ mensaje: 'Técnico no válido' });
  }
  const error = validarVisita(req.body);
  if (error) return res.status(400).json({ mensaje: error });

  const { fecha_programada, hora_inicio, hora_fin } = req.body;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    if (await fechaPasada(conn, fecha_programada)) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'No se puede programar una visita en una fecha pasada' });
    }

    const [filas] = await conn.query(
      'SELECT id, estado, solicitud_id, tecnico_id FROM agenda WHERE id = ? FOR UPDATE',
      [req.params.id]
    );
    const visita = filas[0];
    if (!visita) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Visita no encontrada' });
    }
    if (!['programada', 'reprogramada'].includes(visita.estado)) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Solo se pueden reprogramar visitas pendientes' });
    }
    if (await tieneOrden(conn, visita.id)) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'La visita ya tiene una orden de servicio y no se puede reprogramar' });
    }

    const tecnico = await obtenerTecnico(conn, req.body.tecnico_id || visita.tecnico_id);
    if (!tecnico) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'El técnico no existe o está inactivo' });
    }

    const cruce = await buscarCruce(conn, {
      tecnicoId: tecnico.id, fecha: fecha_programada, inicio: hora_inicio, fin: hora_fin, excluirId: visita.id,
    });
    if (cruce) {
      await conn.rollback();
      return res.status(409).json({
        mensaje: `${tecnico.nombre} ya tiene una visita de ${String(cruce.hora_inicio).slice(0, 5)} a ${String(cruce.hora_fin).slice(0, 5)} ese día`,
      });
    }

    await conn.query(
      `UPDATE agenda SET tecnico_id = ?, fecha_programada = ?, hora_inicio = ?, hora_fin = ?, estado = 'reprogramada'
       WHERE id = ?`,
      [tecnico.id, fecha_programada, hora_inicio, hora_fin, visita.id]
    );
    await registrarCambio(conn, {
      solicitudId: visita.solicitud_id, anterior: 'programada', nuevo: 'programada', usuarioId: req.user.id,
      comentario: `Visita reprogramada con ${tecnico.nombre}: ${fecha_programada} de ${hora_inicio} a ${hora_fin}`,
    });
    await conn.commit();
    res.json({ mensaje: 'Visita reprogramada' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ mensaje: 'Error al reprogramar la visita' });
  } finally {
    conn.release();
  }
};

// POST /api/agenda/:id/cancelar  (administrador) — la solicitud vuelve a "aprobada" para reprogramarla
exports.cancelar = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [filas] = await conn.query('SELECT id, estado, solicitud_id FROM agenda WHERE id = ? FOR UPDATE', [req.params.id]);
    const visita = filas[0];
    if (!visita) {
      await conn.rollback();
      return res.status(404).json({ mensaje: 'Visita no encontrada' });
    }
    if (!['programada', 'reprogramada'].includes(visita.estado)) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'Solo se pueden cancelar visitas pendientes' });
    }
    if (await tieneOrden(conn, visita.id)) {
      await conn.rollback();
      return res.status(409).json({ mensaje: 'La visita ya tiene una orden de servicio y no se puede cancelar' });
    }

    await conn.query("UPDATE agenda SET estado = 'cancelada' WHERE id = ?", [visita.id]);
    await conn.query("UPDATE solicitudes SET estado = 'aprobada' WHERE id = ? AND estado = 'programada'", [visita.solicitud_id]);
    await registrarCambio(conn, {
      solicitudId: visita.solicitud_id, anterior: 'programada', nuevo: 'aprobada', usuarioId: req.user.id,
      comentario: String(req.body.comentario || 'Visita cancelada; pendiente de reprogramar').slice(0, 255),
    });
    await conn.commit();
    res.json({ mensaje: 'Visita cancelada' });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ mensaje: 'Error al cancelar la visita' });
  } finally {
    conn.release();
  }
};
