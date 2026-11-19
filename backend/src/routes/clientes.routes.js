const router = require('express').Router();
const clientes = require('../controllers/clientes.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

// Todo el módulo de clientes es solo para administradores
router.use(verificarToken, permitirRoles('administrador'));

router.get('/', clientes.listar);
router.get('/:id', clientes.obtener);
router.post('/', clientes.crear);
router.put('/:id', clientes.actualizar);
router.patch('/:id/restaurar', clientes.restaurar);
router.delete('/:id', clientes.eliminar);

module.exports = router;
