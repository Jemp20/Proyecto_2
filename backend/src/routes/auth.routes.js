const router = require('express').Router();
const { rateLimit } = require('express-rate-limit');
const auth = require('../controllers/auth.controller');
const { verificarToken, permitirRoles } = require('../middlewares/auth.middleware');

const limiteRecuperacion = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { mensaje: 'Demasiadas solicitudes de recuperación. Inténtalo de nuevo más tarde.' },
});

router.post('/register', auth.register);
router.post('/login', auth.login);
router.post('/forgot-password', limiteRecuperacion, auth.solicitarRecuperacionContrasena);
router.post('/reset-password', auth.restablecerContrasena);
router.get('/me', verificarToken, auth.me);
router.post('/usuarios', verificarToken, permitirRoles('administrador'), auth.crearUsuario);

module.exports = router;
