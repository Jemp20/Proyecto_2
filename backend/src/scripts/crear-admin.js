// Uso:  node src/scripts/crear-admin.js "Nombre Completo" correo@ejemplo.com ClaveSegura123
// (usa solo letras y números en la clave para evitar problemas con la terminal de Windows)
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

(async () => {
  const [nombre, email, password] = process.argv.slice(2);

  if (!nombre || !email || !password) {
    console.log('Uso: node src/scripts/crear-admin.js "Nombre Completo" correo@ejemplo.com Clave12345');
    process.exit(1);
  }
  if (password.length < 8) {
    console.log('La contraseña debe tener al menos 8 caracteres');
    process.exit(1);
  }

  try {
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      "INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, 'administrador')",
      [nombre.trim(), email.trim().toLowerCase(), hash]
    );
    console.log(`Administrador creado: ${email}`);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') console.log('Ya existe un usuario con ese correo');
    else console.error(err);
  } finally {
    await pool.end();
  }
})();
