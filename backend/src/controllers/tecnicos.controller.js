const pool = require('../config/db');

const idValido = (v) => Number.isInteger(Number(v)) && Number(v) > 0;
const vacioANull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());

// GET /api/tecnicos?activo=1   (administrador)
exports.listar = async (req, res) => {
  const soloActivos = req.query.activo === '1';
  try {
    const [tecnicos] = await pool.query(
      `SELECT t.id, t.usuario_id, u.nombre, u.email, t.telefono, t.especialidad, t.activo,
              (SELECT COUNT(*) FROM agenda a
               WHERE a.tecnico_id = t.id AND a.estado IN ('programada', 'reprogramada')
                 AND a.fecha_programada >= CURDATE()) AS visitas_pendientes
       FROM tecnicos t JOIN usuarios u ON u.id = t.usuario_id
       ${soloActivos ? 'WHERE t.activo = 1' : ''}
       ORDER BY u.nombre`
    );
    res.json({ tecnicos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al listar los técnicos' });
  }
};

// PUT /api/tecnicos/:id   (administrador: teléfono, especialidad y si está activo)
exports.actualizar = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const activo = req.body.activo === false || req.body.activo === 0 || req.body.activo === '0' ? 0 : 1;

  try {
    const [filas] = await pool.query('SELECT id FROM tecnicos WHERE id = ?', [req.params.id]);
    if (!filas[0]) return res.status(404).json({ mensaje: 'Técnico no encontrado' });

    // No se desactiva a un técnico que todavía tiene visitas por cumplir
    if (!activo) {
      const [[{ pendientes }]] = await pool.query(
        `SELECT COUNT(*) AS pendientes FROM agenda
         WHERE tecnico_id = ? AND estado IN ('programada', 'reprogramada') AND fecha_programada >= CURDATE()`,
        [req.params.id]
      );
      if (pendientes > 0) {
        return res.status(409).json({ mensaje: 'Reasigna o cancela sus visitas pendientes antes de desactivarlo' });
      }
    }

    await pool.query('UPDATE tecnicos SET telefono = ?, especialidad = ?, activo = ? WHERE id = ?', [
      vacioANull(req.body.telefono), vacioANull(req.body.especialidad), activo, req.params.id,
    ]);
    res.json({ mensaje: 'Técnico actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al actualizar el técnico' });
  }
};
