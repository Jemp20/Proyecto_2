const documentos = require('../services/asistente-documentos.service');
const exportaciones = require('./asistente-exportaciones.controller');

exports.listar = async (req, res) => {
  try {
    return res.json({ documentos: await documentos.listarDocumentos() });
  } catch (error) {
    console.error('Error al listar documentos del asistente:', error);
    return res.status(500).json({ mensaje: 'No se pudieron cargar los documentos' });
  }
};

exports.subir = async (req, res) => {
  try {
    const documento = await documentos.guardarDocumento(req.file);
    return res.status(201).json({ documento });
  } catch (error) {
    if (error instanceof Error && !error.code) {
      return res.status(400).json({ mensaje: error.message });
    }
    console.error('Error al procesar documento del asistente:', error);
    return res.status(500).json({ mensaje: 'No se pudo procesar el documento' });
  }
};

exports.eliminar = async (req, res) => {
  try {
    const eliminado = await documentos.eliminarDocumento(req.params.id);
    if (!eliminado) return res.status(404).json({ mensaje: 'No se encontró el documento' });
    return res.json({ eliminado: true });
  } catch (error) {
    console.error('Error al eliminar documento del asistente:', error);
    return res.status(500).json({ mensaje: 'No se pudo eliminar el documento' });
  }
};

exports.generarDesdeSistema = exportaciones.generar;
