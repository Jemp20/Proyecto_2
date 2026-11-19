const router = require('express').Router();
const reportes = require('../controllers/reportes.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

// Los reportes son solo para el administrador
router.use(verificarToken, permitirRoles('administrador'));

router.get('/resumen', reportes.resumen);

module.exports = router;
