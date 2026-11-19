const router = require('express').Router();
const solicitudes = require('../controllers/solicitudes.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

router.use(verificarToken, permitirRoles('administrador', 'cliente'));

router.post('/', solicitudes.crear);
router.get('/', solicitudes.listar);
router.get('/:id', solicitudes.obtener);
router.post('/:id/cancelar', solicitudes.cancelar);

module.exports = router;
