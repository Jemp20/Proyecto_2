const router = require('express').Router();
const cotizaciones = require('../controllers/cotizaciones.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

router.use(verificarToken);

// Consulta: administrador y cliente (cada cliente, solo las suyas)
router.get('/', permitirRoles('administrador', 'cliente'), cotizaciones.listar);
router.get('/:id', permitirRoles('administrador', 'cliente'), cotizaciones.obtener);

// El administrador cotiza; el cliente aprueba o rechaza
router.post('/', permitirRoles('administrador'), cotizaciones.crear);
router.post('/:id/responder', permitirRoles('cliente'), cotizaciones.responder);

module.exports = router;
