const exportaciones = require('../services/asistente-exportaciones.service');

exports.generar = async (req, res) => {
  try {
    const resultado = await exportaciones.generar({
      modulos: req.body?.modulos,
      formato: req.body?.formato,
    });
    return res.json(resultado);
  } catch (error) {
    if (error.status) return res.status(error.status).json({ mensaje: error.message });
    if (error.code) {
      console.error('Error al generar exportación del asistente:', error);
      return res.status(503).json({ mensaje: 'No se pudieron consultar los datos; verifica la conexión de solo lectura' });
    }
    console.error('Error al generar exportación del asistente:', error);
    return res.status(500).json({ mensaje: 'No se pudo generar el archivo desde los datos del sistema' });
  }
};
