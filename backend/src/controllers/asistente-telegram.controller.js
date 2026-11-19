const { createHash, randomBytes } = require('node:crypto');
const pool = require('../config/db');
const telegramService = require('../services/asistente-telegram.service');

exports.estado = async (req, res) => {
  try {
    const [filas] = await pool.query(
      'SELECT 1 FROM asistente_telegram_vinculos WHERE usuario_id = ?',
      [req.user.id]
    );
    const sondeo = telegramService.obtenerEstadoSondeo();
    return res.json({
      habilitado: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      vinculado: filas.length > 0,
      estadoBot: sondeo.estado,
      ultimaComprobacion: sondeo.ultimaComprobacion,
    });
  } catch (err) {
    console.error('Error al consultar el vínculo de Telegram:', err);
    return res.status(500).json({ mensaje: 'No se pudo consultar la vinculación de Telegram' });
  }
};

exports.generarCodigo = async (req, res) => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return res.status(503).json({ mensaje: 'La integración de Telegram no está configurada en el servidor' });
  }

  const codigo = randomBytes(8).toString('hex');
  const codigoHash = createHash('sha256').update(codigo).digest('hex');
  try {
    await pool.query(
      `INSERT INTO asistente_telegram_codigos (usuario_id, codigo_hash, expira_en)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE))
       ON DUPLICATE KEY UPDATE
         codigo_hash = VALUES(codigo_hash),
         expira_en = VALUES(expira_en)`,
      [req.user.id, codigoHash]
    );
    return res.json({ codigo, expiraEn: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  } catch (err) {
    console.error('Error al generar el código de vinculación de Telegram:', err);
    return res.status(500).json({ mensaje: 'No se pudo generar el código de vinculación' });
  }
};

exports.desvincular = async (req, res) => {
  let conexion;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    await conexion.query(
      'DELETE FROM asistente_telegram_vinculos WHERE usuario_id = ?',
      [req.user.id]
    );
    await conexion.query(
      'DELETE FROM asistente_telegram_codigos WHERE usuario_id = ?',
      [req.user.id]
    );
    await conexion.commit();
    return res.json({ desvinculado: true });
  } catch (err) {
    if (conexion) await conexion.rollback();
    console.error('Error al desvincular Telegram:', err);
    return res.status(500).json({ mensaje: 'No se pudo desvincular Telegram' });
  } finally {
    conexion?.release();
  }
};
