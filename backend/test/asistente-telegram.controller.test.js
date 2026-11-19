const assert = require('node:assert/strict');
const { test } = require('node:test');

const dbPath = require.resolve('../src/config/db');
const controllerPath = require.resolve('../src/controllers/asistente-telegram.controller');
const originalToken = process.env.TELEGRAM_BOT_TOKEN;

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

test('la configuración de vinculación de Telegram usa identidad autenticada', async (t) => {
  const consultas = [];
  const pool = {
    query: async (sql, parametros) => {
      consultas.push({ sql, parametros });
      if (sql.startsWith('SELECT 1')) return [[{ 1: 1 }], []];
      return [{ affectedRows: 1 }, []];
    },
    getConnection: async () => ({
      beginTransaction: async () => {},
      query: async (sql, parametros) => {
        consultas.push({ sql, parametros });
        return [{ affectedRows: 1 }, []];
      },
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  };
  const originalModule = require.cache[dbPath];
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
  delete require.cache[controllerPath];
  process.env.TELEGRAM_BOT_TOKEN = 'token-de-prueba';
  const controller = require(controllerPath);

  t.after(() => {
    delete require.cache[controllerPath];
    if (originalModule) require.cache[dbPath] = originalModule;
    else delete require.cache[dbPath];
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });

  await t.test('indica si el bot está configurado y vinculado', async () => {
    const respuesta = crearRespuesta();
    await controller.estado({ user: { id: 12 } }, respuesta);
    assert.deepEqual(respuesta.body, {
      habilitado: true,
      vinculado: true,
      estadoBot: 'detenido',
      ultimaComprobacion: null,
    });
    assert.deepEqual(consultas[0].parametros, [12]);
  });

  await t.test('crea un código temporal y solo persiste su hash', async () => {
    const respuesta = crearRespuesta();
    await controller.generarCodigo({ user: { id: 12 } }, respuesta);
    assert.match(respuesta.body.codigo, /^[a-f0-9]{16}$/);
    assert.ok(Date.parse(respuesta.body.expiraEn) > Date.now());
    const consulta = consultas.find(({ sql }) => sql.startsWith('INSERT INTO asistente_telegram_codigos'));
    assert.equal(consulta.parametros[0], 12);
    assert.match(consulta.parametros[1], /^[a-f0-9]{64}$/);
    assert.notEqual(consulta.parametros[1], respuesta.body.codigo);
  });

  await t.test('desvincula y revoca códigos de la cuenta autenticada', async () => {
    const respuesta = crearRespuesta();
    await controller.desvincular({ user: { id: 12 } }, respuesta);
    assert.deepEqual(respuesta.body, { desvinculado: true });
    assert.deepEqual(
      consultas.slice(-2).map(({ parametros }) => parametros),
      [[12], [12]]
    );
  });
});

test('no emite códigos si Telegram no está configurado', async () => {
  const originalModule = require.cache[dbPath];
  const consulta = { query: async () => { throw new Error('No debe consultar MySQL'); } };
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: consulta };
  delete require.cache[controllerPath];
  const tokenAnterior = process.env.TELEGRAM_BOT_TOKEN;
  delete process.env.TELEGRAM_BOT_TOKEN;
  const controller = require(controllerPath);
  const respuesta = crearRespuesta();

  try {
    await controller.generarCodigo({ user: { id: 12 } }, respuesta);
    assert.equal(respuesta.statusCode, 503);
  } finally {
    delete require.cache[controllerPath];
    if (originalModule) require.cache[dbPath] = originalModule;
    else delete require.cache[dbPath];
    if (tokenAnterior === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = tokenAnterior;
  }
});
