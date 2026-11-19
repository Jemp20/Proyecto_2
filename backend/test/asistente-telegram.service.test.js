const assert = require('node:assert/strict');
const { test } = require('node:test');

const dbPath = require.resolve('../src/config/db');
const servicePath = require.resolve('../src/services/asistente-telegram.service');
const assistantPath = require.resolve('../src/controllers/asistente.controller');
const originalFetch = global.fetch;
const originalToken = process.env.TELEGRAM_BOT_TOKEN;

test('el bot de Telegram restringe los chats privados y no vinculados', async (t) => {
  const consultas = [];
  let vinculado = false;
  let historial = [];
  const pool = {
    query: async (sql, parametros) => {
      consultas.push({ sql, parametros });
      if (sql.includes('FROM asistente_telegram_vinculos')) {
        return [vinculado ? [{ usuario_id: 5 }] : [], []];
      }
      return [[], []];
    },
    getConnection: async () => ({
      beginTransaction: async () => {},
      query: async (sql, parametros) => {
        consultas.push({ sql, parametros });
        if (sql.includes('SELECT usuario_id FROM asistente_telegram_codigos')) {
          return [[{ usuario_id: 5 }], []];
        }
        if (sql.includes('SELECT id FROM usuarios')) return [[{ id: 5 }], []];
        if (sql.includes('SELECT mensajes FROM asistente_historial')) {
          return [[{ mensajes: historial }], []];
        }
        if (sql.includes('INSERT INTO asistente_telegram_vinculos')) vinculado = true;
        if (sql.includes('INSERT INTO asistente_historial')) {
          historial = JSON.parse(parametros[1]);
        }
        return [{ affectedRows: 1 }, []];
      },
      commit: async () => {},
      rollback: async () => {},
      release: () => {},
    }),
  };
  const originalModule = require.cache[dbPath];
  const originalAssistant = require.cache[assistantPath];
  const llamadasTelegram = [];
  let provocarConflictoSondeo = false;
  require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: pool };
  require.cache[assistantPath] = {
    id: assistantPath,
    filename: assistantPath,
    loaded: true,
    exports: {
      consultar: async (req, res) => {
          if (req.body.pregunta.includes('cotizaciones')) {
            res.json({
              respuesta: 'Respuesta estructurada de cotizaciones',
              resultado: {
                secciones: [{
                  tipo: 'registros',
                  modulo: 'cotizaciones',
                  total: 1,
                  registros: [{
                    id: 5,
                    solicitud_id: 12,
                    fecha: '2026-10-16',
                    subtotal: '310000.00',
                    iva: '58900.00',
                    total: '368900.00',
                    estado: 'aprobada',
                  }],
                }],
              },
            });
          } else if (req.body.pregunta.includes('equipos página')) {
            res.json({
              respuesta: 'Respuesta estructurada de equipos',
              resultado: {
                secciones: [{
                  tipo: 'registros',
                  modulo: 'equipos',
                  total: 5,
                  registros: [1, 2, 3, 4, 5].map((id) => ({
                    id,
                    tipo: 'Mini split',
                    marca: 'Samsung',
                    cliente: `Cliente ${id}`,
                  })),
                }],
              },
            });
          } else if (req.body.pregunta.includes('mantenimiento preventivo vencido')) {
            res.json({
              respuesta: 'Encontré 0 equipos con mantenimiento preventivo vencido.',
              resultado: {
                secciones: [{
                  tipo: 'registros',
                  modulo: 'mantenimientos',
                  titulo: 'Mantenimiento preventivo vencido',
                  periodo: 'vencidos',
                  total: 0,
                  registros: [],
                }],
              },
            });
          } else {
            res.json({ respuesta: `Respuesta para: ${req.body.pregunta}` });
          }
        },
    },
  };
  delete require.cache[servicePath];
  process.env.TELEGRAM_BOT_TOKEN = 'token-de-prueba';
  const mensajesTelegram = [];
  global.fetch = async (url, opciones) => {
    const metodo = url.split('/').pop();
    const payload = JSON.parse(opciones.body);
    llamadasTelegram.push({ metodo, payload });
    if (metodo === 'sendMessage') mensajesTelegram.push(payload);
    if (metodo === 'getUpdates' && provocarConflictoSondeo) {
      return {
        ok: false,
        json: async () => ({ ok: false, error_code: 409 }),
      };
    }
    return {
      ok: true,
      json: async () => ({
        ok: true,
        result: metodo === 'sendMessage' ? { message_id: 101 } : true,
      }),
    };
  };
  const service = require(servicePath);

  t.after(() => {
    global.fetch = originalFetch;
    delete require.cache[servicePath];
    if (originalAssistant) require.cache[assistantPath] = originalAssistant;
    else delete require.cache[assistantPath];
    if (originalModule) require.cache[dbPath] = originalModule;
    else delete require.cache[dbPath];
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
  });

  await t.test('rechaza grupos incluso si envían una pregunta', async () => {
    await service.procesarActualizacion({
      message: { chat: { id: -10, type: 'group' }, text: '¿Qué órdenes están en proceso?' },
    });
    assert.match(mensajesTelegram.at(-1).text, /chats privados/);
    assert.equal(consultas.length, 0);
  });

  await t.test('no ejecuta preguntas de un chat privado que no está vinculado', async () => {
    const consultasAntes = consultas.length;
    await service.procesarActualizacion({
      message: { chat: { id: 42, type: 'private' }, text: '¿Qué órdenes están en proceso?' },
    });
    assert.match(mensajesTelegram.at(-1).text, /no está vinculado/);
    assert.equal(consultas.length, consultasAntes + 1);
    assert.deepEqual(consultas.at(-1).parametros, ['42']);
  });

  await t.test('consume el código una vez y solo entonces contesta como administrador vinculado', async () => {
    const codigo = 'a1b2c3d4e5f60718';
    await service.procesarActualizacion({
      message: { chat: { id: 42, type: 'private' }, text: `/start ${codigo}` },
    });
    assert.match(mensajesTelegram.at(-1).text, /Cuenta de administrador vinculada/);
    assert.ok(consultas.some(({ sql, parametros }) =>
      sql.includes('SELECT usuario_id FROM asistente_telegram_codigos')
      && parametros[0] === require('node:crypto').createHash('sha256').update(codigo).digest('hex')
    ));

    await service.procesarActualizacion({
      message: { chat: { id: 42, type: 'private' }, text: '¿Qué órdenes están en proceso?' },
    });
    assert.match(mensajesTelegram.at(-1).text, /Respuesta para: ¿Qué órdenes están en proceso\?/);
    assert.deepEqual(historial.map((mensaje) => mensaje.rol), ['user', 'assistant']);
    assert.ok(consultas.some(({ sql, parametros }) =>
      sql.includes('INSERT INTO asistente_historial') && parametros[0] === 5
    ));

    await service.procesarActualizacion({
      message: { chat: { id: 42, type: 'private' }, text: '¿Qué cotizaciones fueron aprobadas?' },
    });
    const textoTelegram = mensajesTelegram.at(-1).text;
    assert.match(textoTelegram, /Encontré 1 cotización/);
    assert.match(textoTelegram, /Estado: Aprobada/);
    assert.match(textoTelegram, /Total: \$ 368\.900/);
    assert.doesNotMatch(textoTelegram, /respuesta estructurada|368900\.00/);
    assert.equal(historial.at(-1).texto, 'Respuesta estructurada de cotizaciones');

    await service.procesarActualizacion({
      message: { chat: { id: 42, type: 'private' }, text: '¿Qué equipos tienen mantenimiento preventivo vencido?' },
    });
    assert.equal(
      mensajesTelegram.at(-1).text,
      'Encontré 0 equipos con mantenimiento preventivo vencido.'
    );

    await service.procesarActualizacion({
      message: { chat: { id: 42, type: 'private' }, text: 'Muéstrame los equipos página de prueba' },
    });
    const mensajePaginado = mensajesTelegram.at(-1);
    assert.match(mensajePaginado.text, /Equipo #1/);
    assert.match(mensajePaginado.text, /Equipo #2/);
    assert.doesNotMatch(mensajePaginado.text, /Equipo #3/);
    const botones = mensajePaginado.reply_markup.inline_keyboard[0];
    assert.equal(botones[0].text, '1/3');
    assert.equal(botones[1].text, 'Siguiente ▶');

    await service.procesarActualizacion({
      callback_query: {
        id: 'callback-1',
        from: { id: 42 },
        data: botones[1].callback_data,
        message: { message_id: 101, chat: { id: 42, type: 'private' } },
      },
    });
    const edicion = llamadasTelegram.findLast(({ metodo }) => metodo === 'editMessageText');
    assert.ok(edicion);
    assert.match(edicion.payload.text, /Equipo #3/);
    assert.match(edicion.payload.text, /Equipo #4/);
    assert.doesNotMatch(edicion.payload.text, /Equipo #5/);
    assert.equal(edicion.payload.reply_markup.inline_keyboard[0][0].text, '◀ Anterior');
    assert.equal(edicion.payload.reply_markup.inline_keyboard[0][1].text, '2/3');
    assert.ok(llamadasTelegram.some(({ metodo, payload }) =>
      metodo === 'answerCallbackQuery' && payload.callback_query_id === 'callback-1'
    ));
  });

  await t.test('identifica cuando otra instancia ya está sondeando Telegram', async () => {
    const errorAnterior = console.error;
    console.error = () => {};
    provocarConflictoSondeo = true;
    try {
      service.iniciar();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(service.obtenerEstadoSondeo().estado, 'conflicto');
      const sondeo = llamadasTelegram.find(({ metodo }) => metodo === 'getUpdates');
      assert.deepEqual(sondeo.payload.allowed_updates, ['message', 'callback_query']);
    } finally {
      console.error = errorAnterior;
    }
  });
});
