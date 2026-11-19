const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { test } = require('node:test');
const bcrypt = require('bcryptjs');

const dbPath = require.resolve('../src/config/db');
const emailPath = require.resolve('../src/services/email.service');
const controllerPath = require.resolve('../src/controllers/auth.controller');
const originalDb = require.cache[dbPath];
const originalEmail = require.cache[emailPath];
const originalController = require.cache[controllerPath];
const originalEnvironment = {
  CLIENT_URL: process.env.CLIENT_URL,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASSWORD: process.env.SMTP_PASSWORD,
};

process.env.CLIENT_URL = 'http://localhost:5173';
process.env.SMTP_HOST = 'smtp.example.com';
process.env.SMTP_USER = 'thermo@example.com';
process.env.SMTP_PASSWORD = 'test-password';

function crearRespuesta() {
  return {
    statusCode: 200,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(cuerpo) {
      this.body = cuerpo;
      return this;
    },
  };
}

function prepararControlador({ cuentaExiste = true } = {}) {
  const consultas = [];
  let tokenHashGuardado;
  let hashContrasenaGuardado;
  let tokenConsumido = false;
  const mensajes = [];
  const pool = {
    query: async (sql, parametros) => {
      consultas.push({ sql, parametros });
      if (sql.includes('SELECT id, nombre, email FROM usuarios')) {
        return [cuentaExiste ? [{ id: 8, nombre: 'Cliente de prueba', email: 'cliente@example.com' }] : [], []];
      }
      if (sql.includes('INSERT INTO recuperacion_contrasena')) {
        tokenHashGuardado = parametros[1];
        return [{ affectedRows: 1 }, []];
      }
      if (sql.includes('DELETE FROM recuperacion_contrasena')) {
        tokenConsumido = true;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error(`Consulta no esperada: ${sql}`);
    },
    getConnection: async () => ({
      beginTransaction: async () => {},
      commit: async () => { tokenConsumido = true; },
      rollback: async () => {},
      release: () => {},
      query: async (sql, parametros) => {
        consultas.push({ sql, parametros });
        if (sql.includes('SELECT usuario_id FROM recuperacion_contrasena')) {
          const existe = !tokenConsumido && parametros[0] === tokenHashGuardado;
          return [existe ? [{ usuario_id: 8 }] : [], []];
        }
        if (sql.includes('UPDATE usuarios SET password_hash')) {
          hashContrasenaGuardado = parametros[0];
          return [{ affectedRows: 1 }, []];
        }
        if (sql.includes('DELETE FROM recuperacion_contrasena')) {
          tokenConsumido = true;
          return [{ affectedRows: 1 }, []];
        }
        throw new Error(`Consulta transaccional no esperada: ${sql}`);
      },
    }),
  };
  const emailService = {
    validarConfiguracion: () => {},
    enviarRecuperacionContrasena: async (mensaje) => { mensajes.push(mensaje); },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
  require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: emailService };
  delete require.cache[controllerPath];
  return {
    controller: require(controllerPath),
    consultas,
    mensajes,
    obtenerHashToken: () => tokenHashGuardado,
    obtenerHashContrasena: () => hashContrasenaGuardado,
  };
}

test('recuperación segura de contraseña', async (t) => {
  t.after(() => {
    for (const [clave, valor] of Object.entries(originalEnvironment)) {
      if (valor === undefined) delete process.env[clave];
      else process.env[clave] = valor;
    }
    if (originalDb) require.cache[dbPath] = originalDb;
    else delete require.cache[dbPath];
    if (originalEmail) require.cache[emailPath] = originalEmail;
    else delete require.cache[emailPath];
    if (originalController) require.cache[controllerPath] = originalController;
    else delete require.cache[controllerPath];
  });

  await t.test('envía un enlace con token aleatorio y conserva solo su hash', async () => {
    const { controller, mensajes, obtenerHashToken } = prepararControlador();
    const respuesta = crearRespuesta();
    await controller.solicitarRecuperacionContrasena({ body: { email: 'CLIENTE@example.com' } }, respuesta);

    assert.equal(respuesta.statusCode, 200);
    assert.match(respuesta.body.mensaje, /Si existe una cuenta activa/);
    assert.equal(mensajes.length, 1);
    const url = new URL(mensajes[0].url);
    assert.equal(url.origin, 'http://localhost:5173');
    assert.equal(url.pathname, '/restablecer-contrasena');
    const token = url.searchParams.get('token');
    assert.match(token, /^[a-f0-9]{64}$/);
    assert.equal(obtenerHashToken(), crypto.createHash('sha256').update(token).digest('hex'));
    assert.notEqual(obtenerHashToken(), token);
  });

  await t.test('responde igual si el correo no corresponde a una cuenta activa', async () => {
    const { controller, mensajes } = prepararControlador({ cuentaExiste: false });
    const respuesta = crearRespuesta();
    await controller.solicitarRecuperacionContrasena({ body: { email: 'desconocido@example.com' } }, respuesta);

    assert.equal(respuesta.statusCode, 200);
    assert.match(respuesta.body.mensaje, /Si existe una cuenta activa/);
    assert.equal(mensajes.length, 0);
  });

  await t.test('valida contraseña, consume el token y guarda el hash nuevo', async () => {
    const { controller, mensajes, obtenerHashContrasena } = prepararControlador();
    const solicitud = crearRespuesta();
    await controller.solicitarRecuperacionContrasena({ body: { email: 'cliente@example.com' } }, solicitud);
    const token = new URL(mensajes[0].url).searchParams.get('token');

    const respuesta = crearRespuesta();
    await controller.restablecerContrasena({ body: { token, password: 'nueva-clave-segura' } }, respuesta);
    assert.equal(respuesta.statusCode, 200);
    assert.match(respuesta.body.mensaje, /Contraseña restablecida/);
    assert.ok(await bcrypt.compare('nueva-clave-segura', obtenerHashContrasena()));

    const tokenReutilizado = crearRespuesta();
    await controller.restablecerContrasena({ body: { token, password: 'otra-clave-segura' } }, tokenReutilizado);
    assert.equal(tokenReutilizado.statusCode, 400);
    assert.match(tokenReutilizado.body.mensaje, /no es válido o venció/);
  });

  await t.test('rechaza tokens inválidos y contraseñas cortas', async () => {
    const { controller } = prepararControlador();
    const tokenInvalido = crearRespuesta();
    await controller.restablecerContrasena({ body: { token: 'invalido', password: 'clave-segura' } }, tokenInvalido);
    assert.equal(tokenInvalido.statusCode, 400);

    const passwordCorta = crearRespuesta();
    await controller.restablecerContrasena({
      body: { token: 'a'.repeat(64), password: 'corta' },
    }, passwordCorta);
    assert.equal(passwordCorta.statusCode, 400);
  });
});
