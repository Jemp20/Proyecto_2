const router = require('express').Router();
const tecnicos = require('../controllers/tecnicos.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

// Solo el administrador gestiona a los técnicos
router.use(verificarToken, permitirRoles('administrador'));

router.get('/', tecnicos.listar);
router.put('/:id', tecnicos.actualizar);

module.exports = router;
