const pool = require('../config/db');

const MAX_MENSAJES = 100;
const MAX_PREGUNTA = 1000;
const MAX_RESPUESTA = 8000;
const MAX_HISTORIAL_JSON = 100000;
const MAX_RESULTADO_JSON = 20000;

function validarMensajes(mensajes) {
  if (!Array.isArray(mensajes) || mensajes.length > MAX_MENSAJES) {
    return 'El historial debe contener como máximo 100 mensajes';
  }

  for (const mensaje of mensajes) {
    if (
      !mensaje ||
      !['user', 'assistant'].includes(mensaje.rol) ||
      typeof mensaje.texto !== 'string' ||
      mensaje.texto.length > (mensaje.rol === 'user' ? MAX_PREGUNTA : MAX_RESPUESTA)
    ) {
      return 'El formato del historial no es válido';
    }
    if (mensaje.resultado !== undefined) {
      if (
        mensaje.rol !== 'assistant' ||
        !mensaje.resultado ||
        !Array.isArray(mensaje.resultado.secciones) ||
        mensaje.resultado.secciones.length > 4
      ) {
        return 'El formato de los resultados guardados no es válido';
      }
      if (JSON.stringify(mensaje.resultado).length > MAX_RESULTADO_JSON) {
        return 'Un resultado guardado es demasiado extenso';
      }
    }
  }

  if (JSON.stringify(mensajes).length > MAX_HISTORIAL_JSON) {
    return 'El historial guardado es demasiado extenso';
  }
  return null;
}

exports.obtener = async (req, res) => {
  try {
    const [filas] = await pool.query(
      'SELECT mensajes FROM asistente_historial WHERE usuario_id = ?',
      [req.user.id]
    );
    res.json({ mensajes: filas[0]?.mensajes || [] });
  } catch (err) {
    console.error('Error al obtener el historial del asistente:', err);
    res.status(500).json({ mensaje: 'No se pudo cargar el historial del asistente' });
  }
};

exports.guardar = async (req, res) => {
  const { mensajes } = req.body || {};
  const error = validarMensajes(mensajes);
  if (error) return res.status(400).json({ mensaje: error });

  try {
    await pool.query(
      `INSERT INTO asistente_historial (usuario_id, mensajes)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE mensajes = VALUES(mensajes)`,
      [req.user.id, JSON.stringify(mensajes)]
    );
    return res.json({ guardado: true });
  } catch (err) {
    console.error('Error al guardar el historial del asistente:', err);
    return res.status(500).json({ mensaje: 'No se pudo guardar el historial del asistente' });
  }
};

exports.borrar = async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM asistente_historial WHERE usuario_id = ?',
      [req.user.id]
    );
    return res.json({ borrado: true });
  } catch (err) {
    console.error('Error al borrar el historial del asistente:', err);
    return res.status(500).json({ mensaje: 'No se pudo borrar el historial del asistente' });
  }
};
