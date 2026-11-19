const router = require('express').Router();
const asistente = require('../controllers/asistente.controller');
const documentos = require('../controllers/asistente-documentos.controller');
const historial = require('../controllers/asistente-historial.controller');
const telegram = require('../controllers/asistente-telegram.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');
const multer = require('multer');

const subirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
}).single('archivo');

router.use(verificarToken, permitirRoles('administrador'));
router.get('/documentos', documentos.listar);
router.post('/documentos/generar', documentos.generarDesdeSistema);
router.post('/documentos', (req, res, next) => {
  subirArchivo(req, res, (error) => {
    if (!error) return next();
    const mensaje = error.code === 'LIMIT_FILE_SIZE'
      ? 'El archivo no puede superar 15 MB'
      : 'No se pudo recibir el archivo';
    return res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ mensaje });
  });
}, documentos.subir);
router.delete('/documentos/:id', documentos.eliminar);
router.get('/telegram', telegram.estado);
router.post('/telegram/codigo', telegram.generarCodigo);
router.delete('/telegram', telegram.desvincular);
router.get('/historial', historial.obtener);
router.put('/historial', historial.guardar);
router.delete('/historial', historial.borrar);
router.post('/', asistente.consultar);

module.exports = router;
