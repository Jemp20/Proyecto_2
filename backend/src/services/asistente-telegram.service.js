const { createHash, randomBytes } = require('node:crypto');
const pool = require('../config/db');
const asistente = require('../controllers/asistente.controller');

const TELEGRAM_TIMEOUT_MS = 35000;
const MAX_TEXTO_TELEGRAM = 4000;
const MAX_MENSAJES_HISTORIAL = 100;
const REGISTROS_POR_PAGINA = 2;
const MAX_PAGINACIONES_ACTIVAS = 100;
const DURACION_PAGINACION_MS = 30 * 60 * 1000;
const paginaciones = new Map();
const ETIQUETAS_CAMPOS = {
  activo: 'Activo',
  capacidad_btu: 'Capacidad (BTU)',
  ciudad: 'Ciudad',
  cliente: 'Cliente',
  codigo: 'Código',
  dias_restantes: 'Días restantes',
  estado: 'Estado',
  estado_solicitud: 'Estado de solicitud',
  especialidad: 'Especialidad',
  equipos: 'Equipos',
  fecha: 'Fecha',
  fecha_fin: 'Fecha de finalización',
  fecha_inicio: 'Fecha de inicio',
  fecha_instalacion: 'Fecha de instalación',
  fecha_programada: 'Fecha programada',
  hora_fin: 'Hora de finalización',
  hora_inicio: 'Hora de inicio',
  iva: 'IVA',
  marca: 'Marca',
  modelo: 'Modelo',
  nombre: 'Nombre',
  orden_id: 'Orden',
  ordenes_en_proceso: 'Órdenes en proceso',
  proxima_fecha: 'Próximo mantenimiento',
  solicitudes: 'Solicitudes',
  solicitud_id: 'Solicitud',
  subtotal: 'Subtotal',
  tecnico: 'Técnico',
  tipo: 'Tipo',
  tipo_servicio: 'Tipo de servicio',
  total: 'Total',
  ubicacion: 'Ubicación',
  usuario_id: 'Usuario',
  visitas_pendientes: 'Visitas pendientes',
};
const ESTADOS_LEGIBLES = {
  aprobado: 'Aprobada',
  aprobada: 'Aprobada',
  asignada: 'Asignada',
  borrador: 'Borrador',
  cancelada: 'Cancelada',
  cumplida: 'Cumplida',
  en_mantenimiento: 'En mantenimiento',
  en_proceso: 'En proceso',
  enviada: 'Enviada',
  finalizada: 'Finalizada',
  fuera_de_servicio: 'Fuera de servicio',
  pendiente: 'Pendiente',
  programada: 'Programada',
  reprogramada: 'Reprogramada',
  rechazada: 'Rechazada',
};
let iniciado = false;
let estadoSondeo = 'detenido';
let ultimaComprobacion = null;

class TelegramApiError extends Error {
  constructor(mensaje, codigo) {
    super(mensaje);
    this.codigo = codigo;
  }
}

async function llamarTelegram(metodo, payload, timeoutMs = TELEGRAM_TIMEOUT_MS) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${metodo}`;
  let respuesta;
  try {
    respuesta = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new TelegramApiError(`No se pudo conectar con Telegram (${metodo})`);
  }

  let datos;
  try {
    datos = await respuesta.json();
  } catch {
    throw new TelegramApiError(`Telegram devolvió una respuesta inválida (${metodo})`);
  }
  if (!respuesta.ok || !datos.ok) {
    throw new TelegramApiError(`Telegram rechazó la operación (${metodo})`, datos.error_code);
  }
  return datos.result;
}

async function enviarMensaje(chatId, texto, replyMarkup) {
  const partes = texto.match(new RegExp(`[\\s\\S]{1,${MAX_TEXTO_TELEGRAM}}`, 'g')) || [''];
  let ultimaRespuesta;
  for (let indice = 0; indice < partes.length; indice += 1) {
    ultimaRespuesta = await llamarTelegram('sendMessage', {
      chat_id: chatId,
      text: partes[indice],
      ...(indice === partes.length - 1 && replyMarkup ? { reply_markup: replyMarkup } : {}),
    });
  }
  return ultimaRespuesta;
}

function formatearValorTelegram(clave, valor) {
  if (typeof valor === 'boolean' || clave === 'activo') return valor ? 'Sí' : 'No';
  if (clave === 'estado') return ESTADOS_LEGIBLES[valor] || String(valor).replace(/_/g, ' ');
  if (['subtotal', 'iva', 'total'].includes(clave)) {
    const cantidad = Number(valor);
    if (Number.isFinite(cantidad)) return `$ ${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(cantidad)}`;
  }
  if (typeof valor === 'number') return new Intl.NumberFormat('es-CO').format(valor);
  return String(valor);
}

function formatearSeccionTelegram(seccion, opciones = {}) {
  const numero = new Intl.NumberFormat('es-CO');
  if (seccion.tipo === 'conteo_estados') {
    const lineas = [`${seccion.titulo}:`];
    if (seccion.total !== undefined) lineas.push(`Total: ${numero.format(seccion.total)} solicitudes`);
    for (const fila of seccion.estados || []) {
      lineas.push(`• ${fila.estado}: ${numero.format(fila.cantidad)}`);
    }
    return lineas.join('\n');
  }
  if (seccion.tipo === 'ordenes_por_tecnico') {
    const filas = seccion.tecnicos || [];
    if (!filas.length) return 'Ningún técnico tiene órdenes en proceso.';
    return [
      `${seccion.titulo}:`,
      ...filas.map((fila) => `• ${fila.tecnico}: ${numero.format(fila.ordenes_en_proceso)} ${fila.ordenes_en_proceso === 1 ? 'orden' : 'órdenes'}`),
    ].join('\n');
  }
  if (seccion.tipo === 'resumen') {
    return `${seccion.titulo}: ${numero.format(seccion.total)}`;
  }
  if (seccion.tipo !== 'registros' || !Array.isArray(seccion.registros)) return '';

  const nombres = {
    agenda: ['visita', 'visitas'],
    clientes: ['cliente', 'clientes'],
    cotizaciones: ['cotización', 'cotizaciones'],
    equipos: ['equipo', 'equipos'],
    historial: ['evento de historial técnico', 'eventos de historial técnico'],
    mantenimientos: ['equipo con mantenimiento', 'equipos con mantenimiento'],
    ordenes: ['orden de servicio', 'órdenes de servicio'],
    solicitudes: ['solicitud', 'solicitudes'],
    tecnicos: ['técnico', 'técnicos'],
  };
  const resumenMantenimientos = {
    vencidos: 'con mantenimiento preventivo vencido',
    proximos: 'con mantenimiento preventivo próximo a vencer',
    todos: 'con mantenimiento preventivo vencido o próximo a vencer',
  };
  const [singular, plural] = nombres[seccion.modulo] || [seccion.modulo, seccion.modulo];
  const resumen = seccion.modulo === 'mantenimientos'
    ? `Encontré ${numero.format(seccion.total)} ${seccion.total === 1 ? 'equipo' : 'equipos'} ${resumenMantenimientos[seccion.periodo] || 'con mantenimiento preventivo'}.`
    : `Encontré ${numero.format(seccion.total)} ${seccion.total === 1 ? singular : plural}.`;
  const lineas = [resumen];
  const tituloRegistro = nombres[seccion.modulo]
    ? singular.charAt(0).toUpperCase() + singular.slice(1)
    : seccion.modulo;
  for (const registro of seccion.registros) {
    const id = registro.codigo
      ? registro.codigo
      : registro.id ?? registro.equipo_id;
    lineas.push('', id !== undefined ? `${tituloRegistro} #${id}` : tituloRegistro);
    for (const [clave, valor] of Object.entries(registro)) {
      if (['id', 'codigo'].includes(clave) || valor === null || valor === '') continue;
      lineas.push(`${ETIQUETAS_CAMPOS[clave] || clave.replace(/_/g, ' ')}: ${formatearValorTelegram(clave, valor)}`);
    }
  }
  if (opciones.total > seccion.registros.length) {
    const desde = opciones.offset + 1;
    const hasta = opciones.offset + seccion.registros.length;
    lineas.push('', `Mostrando ${numero.format(desde)}-${numero.format(hasta)} de ${numero.format(opciones.total)}.`);
  }
  return lineas.join('\n');
}

function formatearRespuestaTelegramPaginas(respuesta, resultado) {
  const secciones = resultado?.secciones;
  if (!Array.isArray(secciones) || secciones.length === 0) return [respuesta];
  if (secciones.length === 1 && secciones[0].tipo === 'registros') {
    const seccion = secciones[0];
    if (seccion.registros.length > REGISTROS_POR_PAGINA) {
      const paginas = [];
      for (let offset = 0; offset < seccion.registros.length; offset += REGISTROS_POR_PAGINA) {
        const registros = seccion.registros.slice(offset, offset + REGISTROS_POR_PAGINA);
        paginas.push(formatearSeccionTelegram(
          { ...seccion, registros },
          { total: seccion.total, offset }
        ));
      }
      return paginas;
    }
  }
  const formateadas = secciones.map(formatearSeccionTelegram).filter(Boolean);
  return [formateadas.length ? formateadas.join('\n\n') : respuesta];
}

function crearTecladoPaginacion(token, pagina, totalPaginas) {
  const botones = [];
  if (pagina > 0) {
    botones.push({ text: '◀ Anterior', callback_data: `p:${token}:${pagina - 1}` });
  }
  botones.push({ text: `${pagina + 1}/${totalPaginas}`, callback_data: `p:${token}:${pagina}` });
  if (pagina < totalPaginas - 1) {
    botones.push({ text: 'Siguiente ▶', callback_data: `p:${token}:${pagina + 1}` });
  }
  return { inline_keyboard: [botones] };
}

function limpiarPaginacionesVencidas(ahora = Date.now()) {
  for (const [token, paginacion] of paginaciones) {
    if (paginacion.expiraEn <= ahora) paginaciones.delete(token);
  }
  while (paginaciones.size >= MAX_PAGINACIONES_ACTIVAS) {
    paginaciones.delete(paginaciones.keys().next().value);
  }
}

async function enviarRespuestaPaginada(chatId, usuarioId, respuesta, resultado) {
  const paginas = formatearRespuestaTelegramPaginas(respuesta, resultado);
  if (paginas.length <= 1) {
    await enviarMensaje(chatId, paginas[0]);
    return;
  }

  limpiarPaginacionesVencidas();
  const token = randomBytes(8).toString('hex');
  const mensaje = await llamarTelegram('sendMessage', {
    chat_id: chatId,
    text: paginas[0],
    reply_markup: crearTecladoPaginacion(token, 0, paginas.length),
  });
  paginaciones.set(token, {
    chatId: String(chatId),
    usuarioId: Number(usuarioId),
    messageId: mensaje.message_id,
    paginas,
    expiraEn: Date.now() + DURACION_PAGINACION_MS,
  });
}

async function procesarCallback(callback) {
  const match = /^p:([a-f\d]{16}):(\d{1,3})$/i.exec(callback.data || '');
  if (!match || callback.message?.chat?.type !== 'private') {
    await llamarTelegram('answerCallbackQuery', {
      callback_query_id: callback.id,
      text: 'Este botón no es válido.',
      show_alert: true,
    });
    return;
  }

  const [, token, paginaTexto] = match;
  const paginacion = paginaciones.get(token);
  const chatId = String(callback.message.chat.id);
  const usuarioId = await obtenerUsuarioVinculado(chatId);
  const pagina = Number(paginaTexto);
  if (
    !paginacion ||
    paginacion.expiraEn <= Date.now() ||
    paginacion.chatId !== chatId ||
    paginacion.usuarioId !== Number(usuarioId) ||
    !Number.isInteger(pagina) ||
    pagina < 0 ||
    pagina >= paginacion.paginas.length
  ) {
    paginaciones.delete(token);
    await llamarTelegram('answerCallbackQuery', {
      callback_query_id: callback.id,
      text: 'Esta paginación venció. Envía la pregunta de nuevo.',
      show_alert: true,
    });
    return;
  }

  paginacion.expiraEn = Date.now() + DURACION_PAGINACION_MS;
  await llamarTelegram('answerCallbackQuery', { callback_query_id: callback.id });
  await llamarTelegram('editMessageText', {
    chat_id: chatId,
    message_id: paginacion.messageId,
    text: paginacion.paginas[pagina],
    reply_markup: crearTecladoPaginacion(token, pagina, paginacion.paginas.length),
  });
}

async function vincularChat(chatId, codigo) {
  const codigoHash = createHash('sha256').update(codigo).digest('hex');
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const [codigos] = await conexion.query(
      `SELECT usuario_id FROM asistente_telegram_codigos
       WHERE codigo_hash = ? AND expira_en > NOW()
       FOR UPDATE`,
      [codigoHash]
    );
    if (codigos.length === 0) {
      await conexion.rollback();
      return 'invalido';
    }

    const usuarioId = codigos[0].usuario_id;
    const [usuarios] = await conexion.query(
      `SELECT id FROM usuarios
       WHERE id = ? AND rol = 'administrador' AND activo = 1`,
      [usuarioId]
    );
    if (usuarios.length === 0) {
      await conexion.query('DELETE FROM asistente_telegram_codigos WHERE usuario_id = ?', [usuarioId]);
      await conexion.commit();
      return 'no_autorizado';
    }

    await conexion.query(
      `INSERT INTO asistente_telegram_vinculos (usuario_id, chat_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE chat_id = VALUES(chat_id)`,
      [usuarioId, chatId]
    );
    await conexion.query('DELETE FROM asistente_telegram_codigos WHERE usuario_id = ?', [usuarioId]);
    await conexion.commit();
    return 'vinculado';
  } catch (err) {
    await conexion.rollback();
    if (err.code === 'ER_DUP_ENTRY') return 'chat_en_uso';
    throw err;
  } finally {
    conexion.release();
  }
}

async function obtenerUsuarioVinculado(chatId) {
  const [filas] = await pool.query(
    `SELECT v.usuario_id
     FROM asistente_telegram_vinculos v
     JOIN usuarios u ON u.id = v.usuario_id
     WHERE v.chat_id = ? AND u.rol = 'administrador' AND u.activo = 1`,
    [chatId]
  );
  return filas[0]?.usuario_id || null;
}

async function cargarHistorial(conexion, usuarioId) {
  await conexion.query(
    `INSERT IGNORE INTO asistente_historial (usuario_id, mensajes)
     VALUES (?, JSON_ARRAY())`,
    [usuarioId]
  );
  const [filas] = await conexion.query(
    'SELECT mensajes FROM asistente_historial WHERE usuario_id = ? FOR UPDATE',
    [usuarioId]
  );
  const mensajes = typeof filas[0].mensajes === 'string'
    ? JSON.parse(filas[0].mensajes)
    : filas[0].mensajes;
  return Array.isArray(mensajes) ? mensajes : [];
}

async function consultarComoAdministrador(usuarioId, pregunta) {
  const conexion = await pool.getConnection();
  let mensajesAnteriores;
  try {
    await conexion.beginTransaction();
    mensajesAnteriores = await cargarHistorial(conexion, usuarioId);
    await conexion.commit();
  } catch (err) {
    await conexion.rollback();
    conexion.release();
    throw err;
  }

  const historial = mensajesAnteriores.slice(-6).map((mensaje) => ({
      role: mensaje.rol,
      content: mensaje.texto,
  }));
  conexion.release();

  const respuesta = {
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
  await asistente.consultar({ body: { pregunta, historial } }, respuesta);
  const textoRespuesta = respuesta.body?.respuesta || respuesta.body?.mensaje;
  if (respuesta.statusCode < 200 || respuesta.statusCode >= 300 || !textoRespuesta) {
    return textoRespuesta || 'No se pudo procesar la consulta. Inténtalo más tarde.';
  }

  const nuevaConexion = await pool.getConnection();
  try {
    await nuevaConexion.beginTransaction();
    const historialActual = await cargarHistorial(nuevaConexion, usuarioId);
    const mensajes = [
      ...historialActual,
      { rol: 'user', texto: pregunta },
      {
        rol: 'assistant',
        texto: textoRespuesta,
        ...(respuesta.body.resultado ? { resultado: respuesta.body.resultado } : {}),
      },
    ].slice(-MAX_MENSAJES_HISTORIAL);
    await nuevaConexion.query(
      `INSERT INTO asistente_historial (usuario_id, mensajes)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE mensajes = VALUES(mensajes)`,
      [usuarioId, JSON.stringify(mensajes)]
    );
    await nuevaConexion.commit();
    return {
      texto: textoRespuesta,
      resultado: respuesta.body.resultado,
    };
  } catch (err) {
    await nuevaConexion.rollback();
    throw err;
  } finally {
    nuevaConexion.release();
  }
}

async function procesarMensaje(message) {
  const chatId = String(message.chat.id);
  const texto = typeof message.text === 'string' ? message.text.trim() : '';
  if (!texto) return;

  if (message.chat.type !== 'private') {
    await enviarMensaje(chatId, 'Por seguridad, este asistente solo funciona en chats privados.');
    return;
  }

  const inicio = texto.match(/^\/start(?:@\w+)?(?:\s+([a-f\d]{16}))?$/i);
  if (inicio) {
    if (!inicio[1]) {
      await enviarMensaje(chatId, 'Para vincular tu cuenta, genera un código en el asistente web y envía /start seguido del código.');
      return;
    }
    const resultado = await vincularChat(chatId, inicio[1].toLowerCase());
    const mensajes = {
      vinculado: 'Cuenta de administrador vinculada. Ya puedes enviarme preguntas sobre el sistema.',
      invalido: 'El código no es válido o ya venció. Genera uno nuevo desde el asistente web.',
      no_autorizado: 'No se pudo autorizar esa cuenta. Verifica que siga activa y tenga rol de administrador.',
      chat_en_uso: 'Este chat de Telegram ya está vinculado a otra cuenta.',
    };
    await enviarMensaje(chatId, mensajes[resultado]);
    return;
  }

  if (/^\/(?:help|ayuda)(?:@\w+)?$/i.test(texto)) {
    await enviarMensaje(chatId, 'Pregunta sobre solicitudes, equipos, mantenimientos, órdenes, agenda, cotizaciones, técnicos, clientes o historial. Ejemplo: ¿Qué órdenes están en proceso?');
    return;
  }

  const usuarioId = await obtenerUsuarioVinculado(chatId);
  if (/^\/(?:desvincular|unlink)(?:@\w+)?$/i.test(texto)) {
    await pool.query('DELETE FROM asistente_telegram_vinculos WHERE chat_id = ?', [chatId]);
    await enviarMensaje(chatId, usuarioId
      ? 'Telegram quedó desvinculado de tu cuenta.'
      : 'Este chat no estaba vinculado.');
    return;
  }

  if (!usuarioId) {
    await enviarMensaje(chatId, 'Este chat no está vinculado. Inicia sesión como administrador en el asistente web y genera un código de Telegram.');
    return;
  }

  if (texto.startsWith('/')) {
    await enviarMensaje(chatId, 'Comando no reconocido. Usa /ayuda para ver ejemplos.');
    return;
  }
  if (texto.length > 1000) {
    await enviarMensaje(chatId, 'La pregunta es demasiado larga. Envíala en 1000 caracteres o menos.');
    return;
  }

  try {
    const respuesta = await consultarComoAdministrador(usuarioId, texto);
    if (typeof respuesta === 'string') {
      await enviarMensaje(chatId, respuesta);
    } else {
      await enviarRespuestaPaginada(chatId, usuarioId, respuesta.texto, respuesta.resultado);
    }
  } catch (err) {
    console.error('Error al responder una consulta de Telegram:', err.message);
    await enviarMensaje(chatId, 'No pude consultar el sistema en este momento. Inténtalo de nuevo más tarde.');
  }
}

async function procesarActualizacion(update) {
  try {
    if (update.message) await procesarMensaje(update.message);
    else if (update.callback_query) await procesarCallback(update.callback_query);
  } catch (err) {
    console.error('Error al procesar una actualización de Telegram:', err.message);
  }
}

async function ejecutarSondeo() {
  let offset = 0;

  while (true) {
    try {
      const actualizaciones = await llamarTelegram('getUpdates', {
        offset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
      });
      estadoSondeo = 'activo';
      ultimaComprobacion = new Date().toISOString();
      for (const actualizacion of actualizaciones) {
        offset = Math.max(offset, actualizacion.update_id + 1);
        await procesarActualizacion(actualizacion);
      }
    } catch (err) {
      console.error('Error en el sondeo de Telegram:', err.message);
      if (err.codigo === 409) {
        estadoSondeo = 'conflicto';
        iniciado = false;
        console.error('Se detuvo el bot: Telegram ya tiene otra instancia usando este token.');
        return;
      }
      estadoSondeo = 'reintentando';
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  }
}

exports.iniciar = () => {
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    estadoSondeo = 'no_configurado';
    return;
  }
  if (iniciado) return;
  iniciado = true;
  estadoSondeo = 'conectando';
  ejecutarSondeo().catch((err) => {
    console.error('El bot de Telegram se detuvo por un error inesperado:', err.message);
    iniciado = false;
    estadoSondeo = 'error';
  });
  console.log('Bot de Telegram iniciado con long polling.');
};

exports.obtenerEstadoSondeo = () => ({
  estado: process.env.TELEGRAM_BOT_TOKEN ? estadoSondeo : 'no_configurado',
  ultimaComprobacion,
});
exports.procesarActualizacion = procesarActualizacion;
