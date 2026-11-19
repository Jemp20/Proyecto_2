const pool = require('../config/db');

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
// Una fecha imposible (2026-13-45) da "Invalid Date" y toISOString() lanzaría un error: se descarta antes
function fechaReal(f) {
  if (typeof f !== 'string' || !FECHA_RE.test(f)) return false;
  const d = new Date(`${f}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === f;
}

function rango(columna, desde, hasta) {
  let sql = '';
  const params = [];
  if (desde) { sql += ` AND ${columna} >= ?`; params.push(desde); }
  if (hasta) { sql += ` AND ${columna} < DATE_ADD(?, INTERVAL 1 DAY)`; params.push(hasta); }
  return { sql, params };
}

const aNumero = (v) => (v === null || v === undefined ? null : Number(v));

exports.resumen = async (req, res) => {
  const { desde, hasta } = req.query;
  for (const [nombre, valor] of [['desde', desde], ['hasta', hasta]]) {
    if (valor && !fechaReal(valor)) return res.status(400).json({ mensaje: `La fecha "${nombre}" debe tener el formato AAAA-MM-DD` });
  }
  if (desde && hasta && desde > hasta) {
    return res.status(400).json({ mensaje: 'La fecha "desde" no puede ser posterior a "hasta"' });
  }

  const sol = rango('s.created_at', desde, hasta);
  const cot = rango('q.fecha', desde, hasta);
  const fin = rango('o.fecha_fin', desde, hasta);

  try {
    const [[totales]] = await pool.query(
      `SELECT (SELECT COUNT(*) FROM clientes) AS clientes,
              (SELECT COUNT(*) FROM equipos) AS equipos,
              (SELECT COUNT(*) FROM tecnicos WHERE activo = 1) AS tecnicos_activos`
    );

    const [porEstado] = await pool.query(
      `SELECT s.estado, COUNT(*) AS total FROM solicitudes s WHERE 1 = 1${sol.sql} GROUP BY s.estado ORDER BY total DESC`,
      sol.params
    );
    const [porTipo] = await pool.query(
      `SELECT s.tipo_servicio, COUNT(*) AS total FROM solicitudes s WHERE 1 = 1${sol.sql} GROUP BY s.tipo_servicio ORDER BY total DESC`,
      sol.params
    );

    const [[{ actual }]] = await pool.query("SELECT DATE_FORMAT(CURDATE(), '%Y-%m') AS actual");
    const [filasMes] = await pool.query(
      `SELECT DATE_FORMAT(fecha_fin, '%Y-%m') AS mes, COUNT(*) AS total
       FROM ordenes_servicio
       WHERE estado = 'finalizada'
         AND fecha_fin >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)
       GROUP BY mes`
    );
    const porMes = new Map(filasMes.map((f) => [f.mes, Number(f.total)]));
    const [anio, mes] = actual.split('-').map(Number);
    const serieMensual = [];
    for (let i = 11; i >= 0; i -= 1) {
      const d = new Date(Date.UTC(anio, mes - 1 - i, 1));
      const clave = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
      serieMensual.push({ mes: clave, total: porMes.get(clave) || 0 });
    }

    const [[atencion]] = await pool.query(
      `SELECT ROUND(AVG(TIMESTAMPDIFF(HOUR, s.created_at, o.fecha_fin)) / 24, 1) AS dias, COUNT(*) AS servicios
       FROM ordenes_servicio o JOIN solicitudes s ON s.id = o.solicitud_id
       WHERE o.estado = 'finalizada'${fin.sql}`,
      fin.params
    );

    const [filasCot] = await pool.query(
      `SELECT q.estado, COUNT(*) AS total FROM cotizaciones q WHERE q.estado <> 'borrador'${cot.sql} GROUP BY q.estado`,
      cot.params
    );
    const cuenta = Object.fromEntries(filasCot.map((f) => [f.estado, Number(f.total)]));
    const aprobadas = cuenta.aprobada || 0;
    const rechazadas = cuenta.rechazada || 0;
    const respondidas = aprobadas + rechazadas;

    const [cargaTecnicos] = await pool.query(
      `SELECT t.id, u.nombre, t.activo,
              (SELECT COUNT(*) FROM agenda a WHERE a.tecnico_id = t.id
                 AND a.estado IN ('programada', 'reprogramada') AND a.fecha_programada >= CURDATE()) AS visitas_pendientes,
              (SELECT COUNT(*) FROM ordenes_servicio o WHERE o.tecnico_id = t.id AND o.estado = 'en_proceso') AS en_proceso,
              (SELECT COUNT(*) FROM ordenes_servicio o WHERE o.tecnico_id = t.id AND o.estado = 'finalizada'${fin.sql}) AS finalizados
       FROM tecnicos t JOIN usuarios u ON u.id = t.usuario_id
       ORDER BY u.nombre`,
      fin.params
    );

    const [mantenimientos] = await pool.query(
      `SELECT m.equipo_id, e.tipo, e.marca, e.ubicacion, c.nombre AS cliente_nombre,
              m.ultima_fecha, m.proxima_fecha, DATEDIFF(m.proxima_fecha, CURDATE()) AS dias_restantes
       FROM mantenimientos_preventivos m
       JOIN equipos e ON e.id = m.equipo_id
       JOIN clientes c ON c.id = e.cliente_id
       WHERE m.activo = 1 AND m.proxima_fecha <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
       ORDER BY m.proxima_fecha LIMIT 100`
    );

    res.json({
      rango: { desde: desde || null, hasta: hasta || null },
      totales: {
        solicitudes: porEstado.reduce((suma, f) => suma + Number(f.total), 0),
        clientes: Number(totales.clientes),
        equipos: Number(totales.equipos),
        tecnicos_activos: Number(totales.tecnicos_activos),
      },
      solicitudes_por_estado: porEstado.map((f) => ({ estado: f.estado, total: Number(f.total) })),
      solicitudes_por_tipo: porTipo.map((f) => ({ tipo_servicio: f.tipo_servicio, total: Number(f.total) })),
      servicios_por_mes: serieMensual,
      atencion: { dias_promedio: aNumero(atencion.dias), servicios: Number(atencion.servicios) },
      cotizaciones: {
        enviadas: cuenta.enviada || 0,
        aprobadas,
        rechazadas,
        tasa_aprobacion: respondidas ? Math.round((aprobadas / respondidas) * 1000) / 10 : null,
      },
      carga_tecnicos: cargaTecnicos.map((f) => ({
        id: f.id, nombre: f.nombre, activo: Boolean(f.activo),
        visitas_pendientes: Number(f.visitas_pendientes), en_proceso: Number(f.en_proceso), finalizados: Number(f.finalizados),
      })),
      mantenimientos_proximos: mantenimientos.map((f) => ({ ...f, dias_restantes: Number(f.dias_restantes) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al generar los reportes' });
  }
};
