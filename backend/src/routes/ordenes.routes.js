const router = require('express').Router();
const ordenes = require('../controllers/ordenes.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

const TODOS = ['administrador', 'tecnico', 'cliente'];
const TRABAJO = ['administrador', 'tecnico'];

router.use(verificarToken);

// Consulta (cada rol ve lo suyo)
router.get('/', permitirRoles(...TODOS), ordenes.listar);
router.get('/historial/:equipoId', permitirRoles(...TODOS), ordenes.historialEquipo);
router.get('/:id', permitirRoles(...TODOS), ordenes.obtener);
router.get('/:id/evidencias/:evId/archivo', permitirRoles(...TODOS), ordenes.archivo);

// Trabajo del técnico (el administrador también puede)
router.post('/', permitirRoles(...TRABAJO), ordenes.crear);
router.put('/:id', permitirRoles(...TRABAJO), ordenes.cargarOrdenEditable, ordenes.actualizar);
router.post('/:id/finalizar', permitirRoles(...TRABAJO), ordenes.cargarOrdenEditable, ordenes.finalizar);
router.post('/:id/evidencias', permitirRoles(...TRABAJO), ordenes.cargarOrdenEditable, ordenes.subirFoto, ordenes.agregarEvidencia);
router.delete('/:id/evidencias/:evId', permitirRoles(...TRABAJO), ordenes.cargarOrdenEditable, ordenes.eliminarEvidencia);

module.exports = router;
