const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_DOCUMENTOS = 20;
const MAX_CARACTERES = 1_000_000;
const TAMANO_FRAGMENTO = 1200;
const SOLAPAMIENTO_FRAGMENTO = 180;
const STOP_WORDS = new Set([
  'acerca', 'ademas', 'al', 'algo', 'algun', 'alguna', 'algunas', 'algunos',
  'como', 'con', 'cual', 'cuando', 'de', 'del', 'desde', 'donde', 'el', 'ella',
  'ellas', 'ellos', 'en', 'entre', 'es', 'esa', 'esas', 'ese', 'eso', 'esos',
  'esta', 'estan', 'este', 'esto', 'estos', 'fue', 'ha', 'hay', 'la', 'las',
  'lo', 'los', 'mas', 'me', 'mi', 'muy', 'no', 'o', 'para', 'pero', 'por',
  'que', 'se', 'segun', 'ser', 'sobre', 'su', 'sus', 'tambien', 'tiene', 'un',
  'una', 'unas', 'uno', 'unos', 'y',
]);

function obtenerDirectorio() {
  return path.resolve(
    process.env.ASSISTANT_DOCUMENTS_DIR
      || path.join(__dirname, '..', '..', 'uploads', 'asistente')
  );
}

function normalizar(texto) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function tokenizar(texto) {
  return [...new Set(
    normalizar(texto)
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token))
  )];
}

function fragmentar(texto) {
  const fragmentos = [];
  let inicio = 0;
  while (inicio < texto.length) {
    let fin = Math.min(inicio + TAMANO_FRAGMENTO, texto.length);
    if (fin < texto.length) {
      const limiteParrafo = texto.lastIndexOf('\n', fin);
      if (limiteParrafo > inicio + TAMANO_FRAGMENTO / 2) fin = limiteParrafo;
    }
    const contenido = texto.slice(inicio, fin).trim();
    if (contenido) fragmentos.push(contenido);
    if (fin === texto.length) break;
    inicio = Math.max(fin - SOLAPAMIENTO_FRAGMENTO, inicio + 1);
  }
  return fragmentos;
}

async function extraerTextoPdf(buffer) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const resultado = await parser.getText();
    return resultado.text || '';
  } finally {
    await parser.destroy();
  }
}

function extraerTextoCsv(buffer) {
  if (buffer.subarray(0, 2).equals(Buffer.from([0xff, 0xfe]))) {
    return new TextDecoder('utf-16le', { fatal: true }).decode(buffer.subarray(2));
  }
  if (buffer.subarray(0, 2).equals(Buffer.from([0xfe, 0xff]))) {
    return new TextDecoder('utf-16be', { fatal: true }).decode(buffer.subarray(2));
  }
  if (buffer.includes(0)) throw new Error('El archivo CSV contiene datos binarios');
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1252').decode(buffer);
  }
}

async function leerDocumentos() {
  const directorio = obtenerDirectorio();
  await fs.mkdir(directorio, { recursive: true });
  const archivos = (await fs.readdir(directorio))
    .filter((archivo) => /^[0-9a-f-]{36}\.json$/i.test(archivo));
  const documentos = [];
  for (const archivo of archivos) {
    const contenido = await fs.readFile(path.join(directorio, archivo), 'utf8');
    documentos.push(JSON.parse(contenido));
  }
  return documentos;
}

async function listarDocumentos() {
  const documentos = await leerDocumentos();
  return documentos
    .map(({ id, nombre, tipo, bytes, creadoEn, origen }) => ({
      id,
      nombre,
      tipo,
      bytes,
      creadoEn,
      ...(origen ? { origen } : {}),
    }))
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));
}

async function guardarDocumento(archivo, opciones = {}) {
  if (!archivo || !Buffer.isBuffer(archivo.buffer)) {
    throw new Error('Selecciona un archivo PDF o CSV');
  }
  const extension = path.extname(archivo.originalname || '').toLowerCase();
  if (!['.pdf', '.csv'].includes(extension)) {
    throw new Error('Solo se permiten archivos PDF o CSV');
  }
  if (
    path.basename(archivo.originalname).toLowerCase().startsWith('datos-sistema-')
    && opciones.origen !== 'exportacion_sistema'
  ) {
    throw new Error('Este reporte se genera desde el sistema y su copia CSV ya se indexa automáticamente; no es necesario importarlo.');
  }
  if (extension === '.pdf' && !archivo.buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('El archivo no tiene un encabezado PDF válido');
  }

  const documentos = await leerDocumentos();
  const idsAReemplazar = new Set(
    Array.isArray(opciones.reemplazarIds)
      ? opciones.reemplazarIds.filter((id) => documentos.some((documento) => documento.id === id))
      : []
  );
  if (documentos.length - idsAReemplazar.size >= MAX_DOCUMENTOS) {
    throw new Error(`Puedes cargar hasta ${MAX_DOCUMENTOS} documentos`);
  }

  let texto = extension === '.pdf'
    ? await extraerTextoPdf(archivo.buffer)
    : extraerTextoCsv(archivo.buffer);
  texto = texto.replace(/\u0000/g, '').trim();
  if (!texto) throw new Error('No se encontró texto legible en el archivo');
  if (texto.length > MAX_CARACTERES) {
    throw new Error(`El documento supera el límite de ${MAX_CARACTERES.toLocaleString('es-CO')} caracteres extraídos`);
  }

  const id = randomUUID();
  const nombreOriginal = path.basename(archivo.originalname)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .slice(0, 180);
  const documento = {
    id,
    nombre: nombreOriginal || `documento${extension}`,
    tipo: extension.slice(1),
    bytes: archivo.buffer.length,
    creadoEn: new Date().toISOString(),
    ...(opciones.origen === 'exportacion_sistema' ? { origen: opciones.origen } : {}),
    texto,
  };
  const directorio = obtenerDirectorio();
  await fs.mkdir(directorio, { recursive: true });
  const destino = path.join(directorio, `${id}.json`);
  const temporal = `${destino}.tmp`;
  try {
    await fs.writeFile(temporal, JSON.stringify(documento), { flag: 'wx' });
    await fs.rename(temporal, destino);
  } catch (error) {
    await fs.rm(temporal, { force: true });
    throw error;
  }
  for (const id of idsAReemplazar) {
    await fs.unlink(path.join(directorio, `${id}.json`));
  }
  return {
    id: documento.id,
    nombre: documento.nombre,
    tipo: documento.tipo,
    bytes: documento.bytes,
    creadoEn: documento.creadoEn,
  };
}

async function eliminarDocumento(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return false;
  const destino = path.join(obtenerDirectorio(), `${id}.json`);
  try {
    await fs.unlink(destino);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function buscarFragmentos(pregunta) {
  const terminos = tokenizar(pregunta);
  if (!terminos.length) return [];
  const documentos = await leerDocumentos();
  const candidatos = [];

  for (const documento of documentos) {
    const palabrasNombre = new Set(tokenizar(documento.nombre));
    fragmentar(documento.texto).forEach((texto, indice) => {
      const palabrasFragmento = new Set(tokenizar(texto));
      const coincidencias = terminos.filter((termino) =>
        palabrasFragmento.has(termino) || palabrasNombre.has(termino)
      );
      if (coincidencias.length < Math.min(2, terminos.length)) return;
      const puntaje = coincidencias.length / terminos.length;
      if (puntaje < 0.2) return;
      candidatos.push({
        nombre: documento.nombre,
        fragmento: indice + 1,
        texto,
        puntaje,
      });
    });
  }

  return candidatos
    .sort((a, b) => b.puntaje - a.puntaje)
    .slice(0, 5);
}

module.exports = {
  buscarFragmentos,
  eliminarDocumento,
  guardarDocumento,
  listarDocumentos,
};
