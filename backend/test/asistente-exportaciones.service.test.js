const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const ExcelJS = require('exceljs');
const { PDFParse } = require('pdf-parse');

const configPath = require.resolve('../src/config/db-readonly');
const exportacionesPath = require.resolve('../src/services/asistente-exportaciones.service');
const documentos = require('../src/services/asistente-documentos.service');

test('genera PDF y CSV de módulos seleccionados e indexa el contenido', async (t) => {
  const directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'asistente-exportaciones-'));
  const directorioAnterior = process.env.ASSISTANT_DOCUMENTS_DIR;
  process.env.ASSISTANT_DOCUMENTS_DIR = directorio;
  const consultas = [];
  let nombreCliente = 'Cliente de prueba con un nombre lo suficientemente largo para ocupar varias líneas en el reporte';
  const pool = {
    query: async (sql, parametros) => {
      consultas.push({ sql, parametros });
      assert.deepEqual(parametros, [501]);
      const solicitud = {
        id: 7,
        tipo_servicio: 'mantenimiento_preventivo',
        estado: 'pendiente',
        created_at: '2026-10-31 10:00:00',
        cliente: nombreCliente,
      };
      const equipo = {
        id: 7,
        tipo: 'Cassette',
        marca: 'LG',
        modelo: 'Modelo de prueba',
        fecha_instalacion: '2026-10-18',
        cliente: nombreCliente,
      };
      return [sql.includes('FROM equipos') ? [equipo] : [solicitud], []];
    },
  };
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: { configurada: true, pool },
  };
  delete require.cache[exportacionesPath];
  t.after(async () => {
    if (directorioAnterior === undefined) delete process.env.ASSISTANT_DOCUMENTS_DIR;
    else process.env.ASSISTANT_DOCUMENTS_DIR = directorioAnterior;
    delete require.cache[exportacionesPath];
    delete require.cache[configPath];
    await fs.rm(directorio, { recursive: true, force: true });
  });

  const exportaciones = require(exportacionesPath);
  const resultado = await exportaciones.generar({
    modulos: ['solicitudes', 'equipos'],
    formato: 'todos',
  });
  assert.equal(consultas.length, 2);
  assert.equal(resultado.registros, 2);
  assert.equal(resultado.truncado, false);
  assert.deepEqual(resultado.archivos.map(({ nombre }) => path.extname(nombre)), ['.csv', '.csv', '.pdf', '.xlsx']);
  assert.match(resultado.archivos[0].nombre, /solicitudes\.csv$/);
  assert.match(resultado.archivos[1].nombre, /equipos\.csv$/);

  const csv = Buffer.from(resultado.archivos.find(({ nombre }) => nombre.endsWith('-solicitudes.csv')).contenido, 'base64')
    .toString('utf16le').replace(/^\uFEFF/, '');
  const csvEquipo = Buffer.from(resultado.archivos.find(({ nombre }) => nombre.endsWith('-equipos.csv')).contenido, 'base64')
    .toString('utf16le').replace(/^\uFEFF/, '');
  assert.match(csvEquipo, /Modelo de prueba/);
  assert.doesNotMatch(csvEquipo, /Fecha de solicitud/);
  const pdf = Buffer.from(resultado.archivos.find(({ nombre }) => nombre.endsWith('.pdf')).contenido, 'base64');
  const xlsx = Buffer.from(resultado.archivos.find(({ nombre }) => nombre.endsWith('.xlsx')).contenido, 'base64');
  assert.match(csv, /Cliente de prueba/);
  assert.match(csv, /sep=;/);
  assert.match(csv, /Fecha de solicitud/);
  assert.match(csv, /Mantenimiento preventivo/);
  assert.match(csv, /Cliente/);
  assert.equal(csv.split(/\r\n/)[1].split(';').length, csv.split(/\r\n/)[2].split(';').length);
  assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
  const parser = new PDFParse({ data: pdf });
  try {
    const textoPdf = await parser.getText();
    assert.match(textoPdf.text, /Reporte operativo/);
    assert.match(textoPdf.text, /Cliente de prueba/);
    assert.match(textoPdf.text, /Mantenimiento preventivo/);
    assert.ok(textoPdf.pages.length < 5);
  } finally {
    await parser.destroy();
  }
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(xlsx);
  assert.deepEqual(libro.worksheets.map((hoja) => hoja.name), ['Resumen', 'Solicitudes', 'Equipos']);
  assert.equal(libro.getWorksheet('Solicitudes').getCell('A1').value, 'ID');
  assert.ok(libro.getWorksheet('Solicitudes').getCell('D2').value instanceof Date);
  assert.equal(libro.getWorksheet('Solicitudes').getCell('D2').numFmt, 'dd/mm/yyyy hh:mm');
  assert.ok(libro.getWorksheet('Solicitudes').getRow(2).height < 70);
  assert.match(libro.getWorksheet('Solicitudes').getCell('E2').value, /Cliente de prueba/);
  assert.equal(libro.getWorksheet('Solicitudes').getCell('A1').fill.fgColor.argb, '1D3557');
  assert.ok(libro.getWorksheet('Solicitudes').autoFilter);
  assert.ok(libro.getWorksheet('Solicitudes').getRow(2).height > 24);
  const documentosGuardados = await documentos.listarDocumentos();
  assert.equal(documentosGuardados.length, 1);
  assert.equal(documentosGuardados[0].nombre, resultado.documento.nombre);
  const fragmentos = await documentos.buscarFragmentos('solicitudes pendiente');
  assert.equal(fragmentos.length, 1);
  assert.match(fragmentos[0].texto, /Cliente de prueba/);

  nombreCliente = 'Cliente actualizado';
  const resultadoActualizado = await exportaciones.generar({
    modulos: ['solicitudes'],
    formato: 'csv',
  });
  assert.equal((await documentos.listarDocumentos()).length, 1);
  const fragmentosActualizados = await documentos.buscarFragmentos('Cliente actualizado');
  assert.equal(fragmentosActualizados.length, 1);
  assert.match(fragmentosActualizados[0].texto, /Cliente actualizado/);
  assert.deepEqual(await documentos.buscarFragmentos('Cliente prueba'), []);
  assert.equal(resultadoActualizado.documento.nombre, resultado.documento.nombre);
});

test('rechaza módulos no permitidos antes de consultar la base de datos', async (t) => {
  const directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'asistente-exportaciones-'));
  const directorioAnterior = process.env.ASSISTANT_DOCUMENTS_DIR;
  process.env.ASSISTANT_DOCUMENTS_DIR = directorio;
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: { configurada: true, pool: { query: async () => assert.fail('No debe consultar la base') } },
  };
  delete require.cache[exportacionesPath];
  t.after(async () => {
    if (directorioAnterior === undefined) delete process.env.ASSISTANT_DOCUMENTS_DIR;
    else process.env.ASSISTANT_DOCUMENTS_DIR = directorioAnterior;
    delete require.cache[exportacionesPath];
    delete require.cache[configPath];
    await fs.rm(directorio, { recursive: true, force: true });
  });

  const exportaciones = require(exportacionesPath);
  await assert.rejects(
    exportaciones.generar({ modulos: ['usuarios'], formato: 'csv' }),
    /Selecciona al menos un módulo válido/
  );
});

test('limita exportaciones a 500 filas e informa cuando quedan registros fuera', async (t) => {
  const directorio = await fs.mkdtemp(path.join(os.tmpdir(), 'asistente-exportaciones-'));
  const directorioAnterior = process.env.ASSISTANT_DOCUMENTS_DIR;
  process.env.ASSISTANT_DOCUMENTS_DIR = directorio;
  const filas = Array.from({ length: 501 }, (_, indice) => ({ id: indice + 1, estado: 'pendiente' }));
  require.cache[configPath] = {
    id: configPath,
    filename: configPath,
    loaded: true,
    exports: { configurada: true, pool: { query: async () => [filas, []] } },
  };
  delete require.cache[exportacionesPath];
  t.after(async () => {
    if (directorioAnterior === undefined) delete process.env.ASSISTANT_DOCUMENTS_DIR;
    else process.env.ASSISTANT_DOCUMENTS_DIR = directorioAnterior;
    delete require.cache[exportacionesPath];
    delete require.cache[configPath];
    await fs.rm(directorio, { recursive: true, force: true });
  });

  const resultado = await require(exportacionesPath).generar({
    modulos: ['solicitudes'],
    formato: 'csv',
  });
  const csv = Buffer.from(resultado.archivos[0].contenido, 'base64').toString('utf16le').replace(/^\uFEFF/, '');
  assert.equal(resultado.registros, 500);
  assert.equal(resultado.truncado, true);
  assert.match(csv, /máximo de 500 registros/);
});
