const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { test } = require('node:test');

const dbPath = require.resolve('../src/config/db');
const middlewarePath = require.resolve('../src/middlewares/auth.middleware');
const originalModule = require.cache[dbPath];
const originalSecret = process.env.JWT_SECRET;
process.env.JWT_SECRET = 'test-secret';

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

test('el middleware impide usar tokens existentes de cuentas inactivas', async (t) => {
  const consultas = [];
  let activo = 0;
  let authVersion = 0;
  const pool = {
    query: async (sql, parametros) => {
      consultas.push({ sql, parametros });
      return [activo ? [{ activo, auth_version: authVersion }] : [], []];
    },
  };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
  delete require.cache[middlewarePath];
  const { verificarToken } = require(middlewarePath);
  const token = jwt.sign({ id: 20, rol: 'cliente', nombre: 'Cliente' }, process.env.JWT_SECRET);
  const req = { headers: { authorization: `Bearer ${token}` } };
  let siguiente = false;
  const next = () => { siguiente = true; };

  t.after(() => {
    delete require.cache[middlewarePath];
    if (originalModule) require.cache[dbPath] = originalModule;
    else delete require.cache[dbPath];
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  });

  const respuestaInactiva = crearRespuesta();
  await verificarToken(req, respuestaInactiva, next);
  assert.equal(respuestaInactiva.statusCode, 401);
  assert.deepEqual(respuestaInactiva.body, { mensaje: 'La cuenta está inactiva' });
  assert.equal(siguiente, false);

  activo = 1;
  const respuestaActiva = crearRespuesta();
  await verificarToken(req, respuestaActiva, next);
  assert.equal(respuestaActiva.statusCode, 200);
  assert.equal(siguiente, true);
  assert.deepEqual(consultas.map(({ parametros }) => parametros), [[20], [20]]);

  authVersion = 1;
  const respuestaSesionAnterior = crearRespuesta();
  await verificarToken(req, respuestaSesionAnterior, next);
  assert.equal(respuestaSesionAnterior.statusCode, 401);
  assert.deepEqual(respuestaSesionAnterior.body, {
    mensaje: 'La sesión ya no es válida. Inicia sesión nuevamente.',
  });
});
