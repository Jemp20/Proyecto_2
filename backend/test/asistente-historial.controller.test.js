const assert = require('node:assert/strict');
const { test } = require('node:test');

const dbPath = require.resolve('../src/config/db');
const controllerPath = require.resolve('../src/controllers/asistente-historial.controller');

test('el historial sincronizado es privado por usuario y valida los mensajes', async (t) => {
  const consultas = [];
  let respuestaGuardada;
  const pool = {
    query: async (sql, parametros) => {
      consultas.push({ sql, parametros });
      if (sql.startsWith('SELECT')) return [[{ mensajes: respuestaGuardada || [] }], []];
      if (sql.startsWith('INSERT')) {
        respuestaGuardada = JSON.parse(parametros[1]);
        return [{ affectedRows: 1 }, []];
      }
      if (sql.startsWith('DELETE')) {
        respuestaGuardada = undefined;
        return [{ affectedRows: 1 }, []];
      }
      throw new Error('Consulta inesperada');
    },
  };
  const originalModule = require.cache[dbPath];
  require.cache[dbPath] = {
    id: dbPath,
    filename: dbPath,
    loaded: true,
    exports: pool,
  };
  delete require.cache[controllerPath];
  const controller = require(controllerPath);

  t.after(() => {
    delete require.cache[controllerPath];
    if (originalModule) require.cache[dbPath] = originalModule;
    else delete require.cache[dbPath];
  });

  const respuesta = () => ({
    statusCode: 200,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(cuerpo) {
      this.body = cuerpo;
      return this;
    },
  });

  await t.test('guarda y recupera solo el historial asociado al usuario autenticado', async () => {
    const mensajes = [
      { rol: 'user', texto: '¿Cuántas solicitudes hay?' },
      {
        rol: 'assistant',
        texto: 'Encontré 1 solicitud.',
        resultado: { secciones: [{ tipo: 'resumen', titulo: 'Solicitudes', total: 1 }] },
      },
    ];
    const guardado = respuesta();
    await controller.guardar({ user: { id: 7 }, body: { mensajes } }, guardado);
    assert.equal(guardado.statusCode, 200);

    const obtenido = respuesta();
    await controller.obtener({ user: { id: 7 } }, obtenido);
    assert.deepEqual(obtenido.body.mensajes, mensajes);
    assert.deepEqual(consultas[0].parametros, [7, JSON.stringify(mensajes)]);
    assert.deepEqual(consultas[1].parametros, [7]);
  });

  await t.test('rechaza historiales inválidos', async () => {
    const antes = consultas.length;
    const rechazado = respuesta();
    await controller.guardar({
      user: { id: 7 },
      body: { mensajes: [{ rol: 'system', texto: 'No permitido' }] },
    }, rechazado);

    assert.equal(rechazado.statusCode, 400);
    assert.equal(consultas.length, antes);
  });

  await t.test('borra el historial solo para la cuenta autenticada', async () => {
    const borrado = respuesta();
    await controller.borrar({ user: { id: 7 } }, borrado);
    assert.equal(borrado.statusCode, 200);
    assert.deepEqual(consultas.at(-1).parametros, [7]);

    const obtenido = respuesta();
    await controller.obtener({ user: { id: 7 } }, obtenido);
    assert.deepEqual(obtenido.body.mensajes, []);
  });
});
