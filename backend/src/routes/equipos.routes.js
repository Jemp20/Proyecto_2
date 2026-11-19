const router = require('express').Router();
const equipos = require('../controllers/equipos.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

router.use(verificarToken);

// Consulta: administrador (todos) y cliente (solo los suyos)
router.get('/', permitirRoles('administrador', 'cliente'), equipos.listar);
router.get('/:id', permitirRoles('administrador', 'cliente'), equipos.obtener);

// Gestión: solo administrador
router.post('/', permitirRoles('administrador'), equipos.crear);
router.put('/:id', permitirRoles('administrador'), equipos.actualizar);
router.delete('/:id', permitirRoles('administrador'), equipos.eliminar);

module.exports = router;
