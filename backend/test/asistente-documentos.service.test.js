const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const documentos = require('../src/services/asistente-documentos.service');

function crearPdf(texto) {
  const contenido = `BT /F1 16 Tf 20 100 Td (${texto}) Tj ET`;
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(contenido)} >>\nstream\n${contenido}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let cuerpo = '%PDF-1.4\n';
  const offsets = [0];
  for (const [indice, objeto] of objetos.entries()) {
    offsets.push(Buffer.byteLength(cuerpo));
    cuerpo += `${indice + 1} 0 obj\n${objeto}\nendobj\n`;
  }
  const inicioXref = Buffer.byteLength(cuerpo);
  cuerpo += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  cuerpo += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  cuerpo += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${inicioXref}\n%%EOF`;
  return Buffer.from(cuerpo);
}

test('almacena, busca, lista y elimina documentos CSV', async (t) => {
  const directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'asistente-documentos-'));
  const directorioAnterior = process.env.ASSISTANT_DOCUMENTS_DIR;
  process.env.ASSISTANT_DOCUMENTS_DIR = directorio;
  t.after(async () => {
    if (directorioAnterior === undefined) delete process.env.ASSISTANT_DOCUMENTS_DIR;
    else process.env.ASSISTANT_DOCUMENTS_DIR = directorioAnterior;
    await fs.rm(directorio, { recursive: true, force: true });
  });

  const documento = await documentos.guardarDocumento({
    originalname: 'normativa.csv',
    buffer: Buffer.from('tema,detalle\ninstalacion,La eficiencia energética debe cumplir la resolución ambiental vigente\n'),
  });
  assert.equal(documento.tipo, 'csv');
  assert.equal((await documentos.listarDocumentos()).length, 1);

  const fragmentos = await documentos.buscarFragmentos('¿Qué dice la resolución sobre eficiencia energética?');
  assert.equal(fragmentos.length, 1);
  assert.match(fragmentos[0].texto, /eficiencia energética/);

  assert.deepEqual(await documentos.buscarFragmentos('capital de otro país'), []);
  assert.equal(await documentos.eliminarDocumento(documento.id), true);
  assert.deepEqual(await documentos.listarDocumentos(), []);
  assert.equal(await documentos.eliminarDocumento(documento.id), false);
});

test('extrae y recupera texto de un PDF', async (t) => {
  const directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'asistente-documentos-'));
  const directorioAnterior = process.env.ASSISTANT_DOCUMENTS_DIR;
  process.env.ASSISTANT_DOCUMENTS_DIR = directorio;
  t.after(async () => {
    if (directorioAnterior === undefined) delete process.env.ASSISTANT_DOCUMENTS_DIR;
    else process.env.ASSISTANT_DOCUMENTS_DIR = directorioAnterior;
    await fs.rm(directorio, { recursive: true, force: true });
  });

  const documento = await documentos.guardarDocumento({
    originalname: 'manual.pdf',
    buffer: crearPdf('Instalacion eficiente de equipos'),
  });
  assert.equal(documento.tipo, 'pdf');
  const fragmentos = await documentos.buscarFragmentos('instalacion eficiente de equipos');
  assert.equal(fragmentos.length, 1);
  assert.match(fragmentos[0].texto, /Instalacion eficiente de equipos/);
});

test('rechaza CSV vacíos y archivos con extensión no permitida', async (t) => {
  const directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'asistente-documentos-'));
  const directorioAnterior = process.env.ASSISTANT_DOCUMENTS_DIR;
  process.env.ASSISTANT_DOCUMENTS_DIR = directorio;
  t.after(async () => {
    if (directorioAnterior === undefined) delete process.env.ASSISTANT_DOCUMENTS_DIR;
    else process.env.ASSISTANT_DOCUMENTS_DIR = directorioAnterior;
    await fs.rm(directorio, { recursive: true, force: true });
  });

  await assert.rejects(
    documentos.guardarDocumento({ originalname: 'vacio.csv', buffer: Buffer.alloc(0) }),
    /No se encontró texto legible/
  );
  await assert.rejects(
    documentos.guardarDocumento({ originalname: 'imagen.jpg', buffer: Buffer.from('contenido') }),
    /Solo se permiten/
  );
  await assert.rejects(
    documentos.guardarDocumento({ originalname: 'datos-sistema-2026-10-31.csv', buffer: Buffer.from('contenido') }),
    /copia CSV ya se indexa automáticamente/
  );
});

test('importa CSV UTF-16LE compatible con Excel y conserva los acentos', async (t) => {
  const directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'asistente-documentos-'));
  const directorioAnterior = process.env.ASSISTANT_DOCUMENTS_DIR;
  process.env.ASSISTANT_DOCUMENTS_DIR = directorio;
  t.after(async () => {
    if (directorioAnterior === undefined) delete process.env.ASSISTANT_DOCUMENTS_DIR;
    else process.env.ASSISTANT_DOCUMENTS_DIR = directorioAnterior;
    await fs.rm(directorio, { recursive: true, force: true });
  });

  const documento = await documentos.guardarDocumento({
    originalname: 'reporte.csv',
    buffer: Buffer.from('\uFEFFsep=;\r\n"Módulo";"Servicio"\r\n"Solicitudes";"Instalación"', 'utf16le'),
  });
  const fragmentos = await documentos.buscarFragmentos('solicitudes instalación');
  assert.equal(fragmentos.length, 1);
  assert.match(fragmentos[0].texto, /Instalación/);
  assert.equal(documento.tipo, 'csv');
});
