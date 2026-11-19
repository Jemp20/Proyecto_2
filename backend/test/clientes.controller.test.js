const assert = require('node:assert/strict');
const { test } = require('node:test');

const dbPath = require.resolve('../src/config/db');
const controllerPath = require.resolve('../src/controllers/clientes.controller');
const originalModule = require.cache[dbPath];
const llamadas = [];
let pool;

function cargarControlador() {
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
  delete require.cache[controllerPath];
  return require(controllerPath);
}

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

test('el archivado de clientes conserva registros y revoca/restaura el acceso de forma transaccional', async (t) => {
  let perfil = {
    id: 8,
    usuario_id: 20,
    archivado_en: null,
    usuario_activo_previo: null,
    usuario_activo: 1,
  };
  pool = {
    query: async (sql, parametros) => {
      llamadas.push({ sql, parametros });
      return [[], []];
    },
    getConnection: async () => ({
      beginTransaction: async () => llamadas.push({ sql: 'BEGIN' }),
      query: async (sql, parametros) => {
        llamadas.push({ sql, parametros });
        if (sql.includes('SELECT c.id, c.usuario_id')) return [[{ ...perfil }], []];
        if (sql.includes('SELECT id, usuario_id, archivado_en')) {
          return [[{
            id: perfil.id,
            usuario_id: perfil.usuario_id,
            archivado_en: perfil.archivado_en,
            usuario_activo_previo: perfil.usuario_activo_previo,
          }], []];
        }
        if (sql.includes('SET archivado_en = NOW()')) {
          perfil.archivado_en = '2026-10-27 19:00:00';
          perfil.usuario_activo_previo = parametros[0];
        }
        if (sql.includes('UPDATE usuarios SET activo = 0')) perfil.usuario_activo = 0;
        if (sql.includes('SET archivado_en = NULL')) perfil.archivado_en = null;
        if (sql.includes('UPDATE usuarios SET activo = ?')) perfil.usuario_activo = parametros[0];
        return [{ affectedRows: 1 }, []];
      },
      commit: async () => llamadas.push({ sql: 'COMMIT' }),
      rollback: async () => llamadas.push({ sql: 'ROLLBACK' }),
      release: () => llamadas.push({ sql: 'RELEASE' }),
    }),
  };
  const controller = cargarControlador();

  t.after(() => {
    delete require.cache[controllerPath];
    if (originalModule) require.cache[dbPath] = originalModule;
    else delete require.cache[dbPath];
  });

  await t.test('archiva un cliente con cuenta, conserva su historial y bloquea la cuenta', async () => {
    llamadas.length = 0;
    const respuesta = crearRespuesta();
    await controller.eliminar({ params: { id: '8' } }, respuesta);

    assert.equal(respuesta.statusCode, 200);
    assert.deepEqual(respuesta.body, {
      archivado: true,
      mensaje: 'Cliente archivado; se conservó su historial',
    });
    assert.equal(perfil.usuario_activo_previo, 1);
    assert.equal(perfil.usuario_activo, 0);
    assert.ok(llamadas.some(({ sql }) => sql.includes('UPDATE usuarios SET activo = 0')));
    assert.ok(!llamadas.some(({ sql }) => sql.startsWith('DELETE')));
    assert.ok(llamadas.some(({ sql }) => sql === 'COMMIT'));
  });

  await t.test('restaura el cliente y devuelve el estado previo de su cuenta', async () => {
    llamadas.length = 0;
    const respuesta = crearRespuesta();
    await controller.restaurar({ params: { id: '8' } }, respuesta);

    assert.equal(respuesta.statusCode, 200);
    assert.deepEqual(respuesta.body, { archivado: false, mensaje: 'Cliente restaurado' });
    assert.equal(perfil.archivado_en, null);
    assert.equal(perfil.usuario_activo, 1);
    assert.ok(llamadas.some(({ sql, parametros }) =>
      sql.includes('UPDATE usuarios SET activo = ?') && parametros[0] === 1
    ));
    assert.ok(llamadas.some(({ sql }) => sql === 'COMMIT'));
  });

  await t.test('lista por separado clientes activos y archivados', async () => {
    let sqlCapturado = '';
    pool.query = async (sql) => {
      sqlCapturado = sql;
      return [[], []];
    };
    const respuesta = crearRespuesta();
    await controller.listar({ query: { q: '', archivados: 'true' } }, respuesta);
    assert.match(sqlCapturado, /c\.archivado_en IS NOT NULL AND \(c\.nombre LIKE/);
  });
});
