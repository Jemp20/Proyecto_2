const router = require('express').Router();
const agenda = require('../controllers/agenda.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

router.use(verificarToken);

// Consulta: cada rol ve lo suyo (el administrador, todo)
router.get('/', permitirRoles('administrador', 'tecnico', 'cliente'), agenda.listar);

// Programar, reprogramar y cancelar: solo el administrador
router.post('/', permitirRoles('administrador'), agenda.crear);
router.put('/:id/reprogramar', permitirRoles('administrador'), agenda.reprogramar);
router.post('/:id/cancelar', permitirRoles('administrador'), agenda.cancelar);

module.exports = router;
