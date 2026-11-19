const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../config/db');
const emailService = require('../services/email.service');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLES = ['administrador', 'tecnico', 'cliente'];

function firmarToken(usuario) {
  return jwt.sign(
    { id: usuario.id, rol: usuario.rol, nombre: usuario.nombre, auth_version: usuario.auth_version || 0 },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// Devuelve un texto con el error de validación, o null si todo está bien
function validarDatos({ nombre, email, password }) {
  if (!nombre || nombre.trim().length < 3) return 'El nombre debe tener al menos 3 caracteres';
  if (!email || !EMAIL_RE.test(email)) return 'El correo no es válido';
  if (!password || password.length < 8) return 'La contraseña debe tener al menos 8 caracteres';
  return null;
}

// Crea el usuario y su perfil (cliente o técnico) en una sola transacción
async function crearUsuarioConPerfil({ nombre, email, password, rol, telefono, especialidad }) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const hash = await bcrypt.hash(password, 10);
    const [resultado] = await conn.query(
      'INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)',
      [nombre.trim(), email.trim().toLowerCase(), hash, rol]
    );
    const usuarioId = resultado.insertId;

        if (rol === 'cliente') {
      // Si el administrador ya había creado una ficha con este correo y sin cuenta,
      // se vincula a la cuenta nueva en vez de crear una ficha duplicada
      const [fichas] = await conn.query(
        `SELECT id FROM clientes
         WHERE email = ? AND usuario_id IS NULL AND archivado_en IS NULL
         ORDER BY id LIMIT 1 FOR UPDATE`,
        [email.trim().toLowerCase()]
      );

      if (fichas[0]) {
        await conn.query(
          'UPDATE clientes SET usuario_id = ?, telefono = COALESCE(telefono, ?) WHERE id = ?',
          [usuarioId, telefono || null, fichas[0].id]
        );
      } else {
        await conn.query(
          'INSERT INTO clientes (usuario_id, nombre, email, telefono) VALUES (?, ?, ?, ?)',
          [usuarioId, nombre.trim(), email.trim().toLowerCase(), telefono || null]
        );
      }
    } else if (rol === 'tecnico') {
      await conn.query(
        'INSERT INTO tecnicos (usuario_id, telefono, especialidad) VALUES (?, ?, ?)',
        [usuarioId, telefono || null, especialidad || null]
      );
    }

    await conn.commit();
    return { id: usuarioId, nombre: nombre.trim(), email: email.trim().toLowerCase(), rol };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// POST /api/auth/register  (público: siempre crea un usuario con rol "cliente")
exports.register = async (req, res) => {
  const { nombre, email, password, telefono } = req.body;

  const error = validarDatos({ nombre, email, password });
  if (error) return res.status(400).json({ mensaje: error });

  try {
    // El rol NUNCA se toma del body: quien se registra solo puede ser cliente
    const usuario = await crearUsuarioConPerfil({ nombre, email, password, rol: 'cliente', telefono });
    res.status(201).json({ token: firmarToken(usuario), usuario });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe una cuenta con ese correo' });
    }
    console.error(err);
    res.status(500).json({ mensaje: 'Error al registrar el usuario' });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ mensaje: 'Correo y contraseña son obligatorios' });
  }

  try {
    const [filas] = await pool.query(
      'SELECT id, nombre, email, password_hash, rol, activo, auth_version FROM usuarios WHERE email = ?',
      [email.trim().toLowerCase()]
    );
    const usuario = filas[0];

    // Mismo mensaje si el correo no existe o la clave está mal (no revela cuál falló)
    const credencialesOk = usuario && usuario.activo && (await bcrypt.compare(password, usuario.password_hash));
    if (!credencialesOk) {
      return res.status(401).json({ mensaje: 'Credenciales inválidas' });
    }

    const datos = {
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
      auth_version: usuario.auth_version || 0,
    };
    res.json({ token: firmarToken(datos), usuario: datos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al iniciar sesión' });
  }
};

// POST /api/auth/forgot-password
exports.solicitarRecuperacionContrasena = async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!EMAIL_RE.test(email) || email.length > 150) {
    return res.status(400).json({ mensaje: 'Escribe un correo válido' });
  }

  try {
    emailService.validarConfiguracion();
    const [usuarios] = await pool.query(
      'SELECT id, nombre, email FROM usuarios WHERE email = ? AND activo = 1',
      [email]
    );
    const usuario = usuarios[0];
    if (usuario) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const baseUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const url = new URL('/restablecer-contrasena', baseUrl);
      url.searchParams.set('token', token);

      await pool.query(
        `INSERT INTO recuperacion_contrasena (usuario_id, token_hash, expira_en)
         VALUES (?, ?, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 MINUTE))
         ON DUPLICATE KEY UPDATE token_hash = VALUES(token_hash), expira_en = VALUES(expira_en)`,
        [usuario.id, tokenHash]
      );
      try {
        await emailService.enviarRecuperacionContrasena({
          email: usuario.email,
          nombre: usuario.nombre,
          url: url.toString(),
        });
      } catch (errorCorreo) {
        await pool.query('DELETE FROM recuperacion_contrasena WHERE usuario_id = ?', [usuario.id]);
        console.error('No se pudo enviar el correo de recuperación:', errorCorreo.message);
      }
    }

    return res.json({
      mensaje: 'Si existe una cuenta activa con ese correo, recibirás un enlace para restablecer la contraseña.',
    });
  } catch (err) {
    console.error('Error al solicitar recuperación de contraseña:', err);
    return res.status(500).json({ mensaje: 'No se pudo procesar la solicitud de recuperación' });
  }
};

// POST /api/auth/reset-password
exports.restablecerContrasena = async (req, res) => {
  const { token, password } = req.body || {};
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({ mensaje: 'El enlace de recuperación no es válido o venció' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ mensaje: 'La contraseña debe tener al menos 8 caracteres' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const [tokens] = await conn.query(
      `SELECT usuario_id FROM recuperacion_contrasena
       WHERE token_hash = ? AND expira_en > UTC_TIMESTAMP() FOR UPDATE`,
      [tokenHash]
    );
    if (!tokens[0]) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'El enlace de recuperación no es válido o venció' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [actualizacion] = await conn.query(
      'UPDATE usuarios SET password_hash = ?, auth_version = auth_version + 1 WHERE id = ? AND activo = 1',
      [passwordHash, tokens[0].usuario_id]
    );
    if (actualizacion.affectedRows !== 1) {
      await conn.rollback();
      return res.status(400).json({ mensaje: 'El enlace de recuperación no es válido o venció' });
    }
    await conn.query('DELETE FROM recuperacion_contrasena WHERE usuario_id = ?', [tokens[0].usuario_id]);
    await conn.commit();
    return res.json({ mensaje: 'Contraseña restablecida. Ya puedes iniciar sesión con tu nueva contraseña.' });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Error al restablecer la contraseña:', err);
    return res.status(500).json({ mensaje: 'No se pudo restablecer la contraseña' });
  } finally {
    if (conn) conn.release();
  }
};

// GET /api/auth/me  (requiere token)
exports.me = async (req, res) => {
  try {
    const [filas] = await pool.query(
      'SELECT id, nombre, email, rol FROM usuarios WHERE id = ? AND activo = 1',
      [req.user.id]
    );
    if (!filas[0]) return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    res.json({ usuario: filas[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar el usuario' });
  }
};

// POST /api/auth/usuarios  (solo administrador: crea técnicos u otros administradores)
exports.crearUsuario = async (req, res) => {
  const { nombre, email, password, rol, telefono, especialidad } = req.body;

  const error = validarDatos({ nombre, email, password });
  if (error) return res.status(400).json({ mensaje: error });
  if (!ROLES.includes(rol)) {
    return res.status(400).json({ mensaje: `El rol debe ser uno de: ${ROLES.join(', ')}` });
  }

  try {
    const usuario = await crearUsuarioConPerfil({ nombre, email, password, rol, telefono, especialidad });
    res.status(201).json({ usuario });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe una cuenta con ese correo' });
    }
    console.error(err);
    res.status(500).json({ mensaje: 'Error al crear el usuario' });
  }
};
