const jwt = require('jsonwebtoken');

// Exige un token válido en el encabezado:  Authorization: Bearer <token>
const pool = require('../config/db');

exports.verificarToken = async (req, res, next) => {
  const encabezado = req.headers.authorization || '';
  const [tipo, token] = encabezado.split(' ');

  if (tipo !== 'Bearer' || !token) {
    return res.status(401).json({ mensaje: 'Token requerido' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET); // { id, rol, nombre }
  } catch (err) {
    return res.status(401).json({ mensaje: 'Token inválido o expirado' });
  }

  try {
    const [usuarios] = await pool.query(
      'SELECT activo, auth_version FROM usuarios WHERE id = ?',
      [req.user.id]
    );
    if (!usuarios[0] || !usuarios[0].activo) {
      return res.status(401).json({ mensaje: 'La cuenta está inactiva' });
    }
    if ((req.user.auth_version || 0) !== Number(usuarios[0].auth_version || 0)) {
      return res.status(401).json({ mensaje: 'La sesión ya no es válida. Inicia sesión nuevamente.' });
    }
    return next();
  } catch (err) {
    console.error('Error al verificar el estado de la cuenta:', err);
    return res.status(503).json({ mensaje: 'No se pudo verificar el estado de la cuenta' });
  }
};

// Permite el paso solo a los roles indicados. Uso: permitirRoles('administrador', 'tecnico')
exports.permitirRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.rol)) {
    return res.status(403).json({ mensaje: 'No tienes permisos para esta acción' });
  }
  next();
};
