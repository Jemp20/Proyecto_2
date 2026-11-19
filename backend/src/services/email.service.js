const nodemailer = require('nodemailer');

function validarConfiguracion() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD } = process.env;
  const puerto = Number(SMTP_PORT || 587);

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASSWORD) {
    throw new Error('Configura SMTP_HOST, SMTP_USER y SMTP_PASSWORD para habilitar la recuperación de contraseña');
  }
  if (!Number.isInteger(puerto) || puerto < 1 || puerto > 65535) {
    throw new Error('SMTP_PORT debe ser un puerto válido');
  }
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  let url;
  try {
    url = new URL(clientUrl);
  } catch {
    throw new Error('CLIENT_URL debe ser una URL válida para generar el enlace de recuperación');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('CLIENT_URL debe usar HTTP o HTTPS');
  }
  return { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, puerto };
}

function crearTransportador() {
  const { SMTP_HOST, SMTP_USER, SMTP_PASSWORD, puerto } = validarConfiguracion();
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: puerto,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
}

exports.validarConfiguracion = validarConfiguracion;

function escaparHtml(texto) {
  return texto.replace(/[&<>"']/g, (caracter) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[caracter]);
}

exports.enviarRecuperacionContrasena = async ({ email, nombre, url }) => {
  const transportador = crearTransportador();
  const nombreSeguro = escaparHtml(nombre || 'usuario');
  await transportador.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Restablece tu contraseña de ThermoAssist',
    text: [
      `Hola ${nombre || 'usuario'},`,
      '',
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta.',
      `Abre este enlace para crear una nueva contraseña (vence en 30 minutos): ${url}`,
      '',
      'Si no solicitaste este cambio, puedes ignorar este mensaje.',
    ].join('\n'),
    html: `<div style="font-family:Arial,sans-serif;color:#1f2a44;line-height:1.6;max-width:560px;margin:0 auto;padding:24px">
      <p>Hola ${nombreSeguro},</p>
      <h1 style="font-size:22px">Restablece tu contraseña</h1>
      <p>Recibimos una solicitud para cambiar la contraseña de tu cuenta ThermoAssist.</p>
      <p><a href="${url}" style="display:inline-block;padding:12px 18px;background:#1f2a44;color:#fff;text-decoration:none;border-radius:8px">Crear nueva contraseña</a></p>
      <p>Este enlace vence en 30 minutos y solo se puede usar una vez.</p>
      <p>Si no solicitaste este cambio, ignora este mensaje. Tu contraseña no cambiará.</p>
    </div>`,
  });
};
