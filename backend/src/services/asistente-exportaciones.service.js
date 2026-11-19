const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const { pool, configurada } = require('../config/db-readonly');
const documentos = require('./asistente-documentos.service');

const LIMITE_MODULO = 500;
const LIMITE_CONSULTA = LIMITE_MODULO + 1;
const ETIQUETAS_CAMPOS = {
  id: 'ID',
  equipo_id: 'Equipo',
  tipo_servicio: 'Servicio',
  estado: 'Estado',
  created_at: 'Fecha de solicitud',
  cliente: 'Cliente',
  equipo: 'Equipo',
  marca: 'Marca',
  modelo: 'Modelo',
  capacidad_btu: 'Capacidad (BTU)',
  ubicacion: 'Ubicación',
  fecha_instalacion: 'Fecha de instalación',
  codigo: 'Código',
  fecha_inicio: 'Fecha de inicio',
  fecha_fin: 'Fecha de finalización',
  solicitud_id: 'Solicitud',
  tecnico: 'Técnico',
  fecha_programada: 'Fecha programada',
  hora_inicio: 'Hora de inicio',
  hora_fin: 'Hora de finalización',
  estado_solicitud: 'Estado de solicitud',
  fecha: 'Fecha',
  subtotal: 'Subtotal',
  iva: 'IVA',
  total: 'Total',
  frecuencia_meses: 'Frecuencia (meses)',
  ultima_fecha: 'Último mantenimiento',
  proxima_fecha: 'Próximo mantenimiento',
  activo: 'Activo',
  dias_restantes: 'Días restantes',
  nombre: 'Nombre',
  especialidad: 'Especialidad',
  visitas_pendientes: 'Visitas pendientes',
  ordenes_en_proceso: 'Órdenes en proceso',
};
const CLAVES_NUMERICAS = new Set([
  'id', 'equipo_id', 'solicitud_id', 'capacidad_btu', 'subtotal', 'iva', 'total',
  'frecuencia_meses', 'activo', 'dias_restantes', 'visitas_pendientes', 'ordenes_en_proceso',
]);
const CLAVES_FECHA = new Set([
  'created_at', 'fecha_instalacion', 'fecha_inicio', 'fecha_fin', 'fecha_programada',
  'fecha', 'ultima_fecha', 'proxima_fecha',
]);
const CLAVES_FECHA_HORA = new Set(['created_at', 'fecha_inicio', 'fecha_fin']);
const COLOR_AZUL = '1D3557';
const COLOR_AZUL_CLARO = 'EAF1F8';
const COLOR_CELESTE = '2F6FB3';
const COLOR_TEXTO = '263449';
const COLOR_SUAVE = '64748B';
const MODULOS = {
  solicitudes: {
    titulo: 'Solicitudes',
    sql: `SELECT s.id, s.tipo_servicio, s.estado, s.created_at,
                 c.nombre AS cliente, e.tipo AS equipo, e.marca
          FROM solicitudes s
          JOIN clientes c ON c.id = s.cliente_id
          LEFT JOIN equipos e ON e.id = s.equipo_id
          ORDER BY s.created_at DESC, s.id DESC LIMIT ?`,
  },
  equipos: {
    titulo: 'Equipos',
    sql: `SELECT e.id, e.tipo, e.marca, e.modelo, e.capacidad_btu,
                 e.ubicacion, e.fecha_instalacion, e.estado, c.nombre AS cliente
          FROM equipos e
          JOIN clientes c ON c.id = e.cliente_id
          ORDER BY e.id DESC LIMIT ?`,
  },
  ordenes: {
    titulo: 'Órdenes de servicio',
    sql: `SELECT o.id, o.codigo, o.estado, o.fecha_inicio, o.fecha_fin,
                 s.id AS solicitud_id, e.tipo AS equipo, e.marca,
                 u.nombre AS tecnico
          FROM ordenes_servicio o
          JOIN tecnicos t ON t.id = o.tecnico_id
          JOIN usuarios u ON u.id = t.usuario_id
          JOIN solicitudes s ON s.id = o.solicitud_id
          LEFT JOIN equipos e ON e.id = o.equipo_id
          ORDER BY o.id DESC LIMIT ?`,
  },
  agenda: {
    titulo: 'Agenda y visitas',
    sql: `SELECT a.id, a.solicitud_id, a.fecha_programada, a.hora_inicio,
                 a.hora_fin, a.estado, u.nombre AS tecnico,
                 s.estado AS estado_solicitud
          FROM agenda a
          JOIN tecnicos t ON t.id = a.tecnico_id
          JOIN usuarios u ON u.id = t.usuario_id
          JOIN solicitudes s ON s.id = a.solicitud_id
          ORDER BY a.fecha_programada DESC, a.hora_inicio LIMIT ?`,
  },
  cotizaciones: {
    titulo: 'Cotizaciones',
    sql: `SELECT q.id, q.solicitud_id, q.fecha, q.subtotal, q.iva, q.total, q.estado
          FROM cotizaciones q
          ORDER BY q.id DESC LIMIT ?`,
  },
  mantenimientos: {
    titulo: 'Mantenimientos preventivos',
    sql: `SELECT e.id AS equipo_id, e.tipo, e.marca, e.ubicacion,
                 m.frecuencia_meses, m.ultima_fecha, m.proxima_fecha, m.activo,
                 DATEDIFF(m.proxima_fecha, CURDATE()) AS dias_restantes
          FROM mantenimientos_preventivos m
          JOIN equipos e ON e.id = m.equipo_id
          WHERE m.activo = 1
          ORDER BY m.proxima_fecha, e.id LIMIT ?`,
  },
  tecnicos: {
    titulo: 'Técnicos',
    sql: `SELECT t.id, u.nombre, t.especialidad, t.activo,
                 (SELECT COUNT(a.id) FROM agenda a
                  WHERE a.tecnico_id = t.id
                    AND a.estado IN ('programada', 'reprogramada')
                    AND a.fecha_programada >= CURDATE()) AS visitas_pendientes,
                 (SELECT COUNT(o.id) FROM ordenes_servicio o
                  WHERE o.tecnico_id = t.id AND o.estado = 'en_proceso') AS ordenes_en_proceso
          FROM tecnicos t
          JOIN usuarios u ON u.id = t.usuario_id
          ORDER BY u.nombre LIMIT ?`,
  },
};

function validarSolicitud(modulos, formato) {
  if (
    !Array.isArray(modulos)
    || modulos.length < 1
    || modulos.length > Object.keys(MODULOS).length
    || modulos.some((modulo) => typeof modulo !== 'string' || !MODULOS[modulo])
    || new Set(modulos).size !== modulos.length
  ) {
    throw Object.assign(new Error('Selecciona al menos un módulo válido para exportar'), { status: 400 });
  }
  if (!['csv', 'pdf', 'ambos', 'excel', 'excel_pdf', 'todos'].includes(formato)) {
    throw Object.assign(new Error('Selecciona Excel, CSV, PDF o una combinación de formatos'), { status: 400 });
  }
}

function escaparCsv(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor);
  if (typeof valor === 'string' && /^[\s]*[=+\-@]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

function valorLegible(clave, valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (clave === 'activo') return Number(valor) === 1 ? 'Sí' : 'No';
  const etiquetas = {
    aprobada: 'Aprobada',
    aprobado: 'Aprobado',
    asignada: 'Asignada',
    cancelada: 'Cancelada',
    cotizada: 'Cotizada',
    cumplida: 'Cumplida',
    en_mantenimiento: 'En mantenimiento',
    en_proceso: 'En proceso',
    finalizada: 'Finalizada',
    fuera_de_servicio: 'Fuera de servicio',
    instalacion: 'Instalación',
    mantenimiento_correctivo: 'Mantenimiento correctivo',
    mantenimiento_preventivo: 'Mantenimiento preventivo',
    pendiente: 'Pendiente',
    programada: 'Programada',
    reprogramada: 'Reprogramada',
    rechazada: 'Rechazada',
    revision: 'Revisión',
    enviada: 'Enviada',
    borrador: 'Borrador',
  };
  if (typeof valor === 'string' && etiquetas[valor]) return etiquetas[valor];
  if (typeof valor === 'string' && /^[a-z0-9]+(?:_[a-z0-9]+)+$/.test(valor)) {
    return valor.replace(/_/g, ' ');
  }
  return String(valor);
}

function crearCsv({ modulo, registros, truncado }) {
  const campos = registros.length
    ? [...new Set(registros.flatMap((registro) => Object.keys(registro)))]
    : [];
  const lineas = [
    'sep=;',
    (campos.length ? campos : ['informacion'])
      .map((campo) => escaparCsv(
        ETIQUETAS_CAMPOS[campo] || (campo === 'informacion' ? 'Información' : campo.replace(/_/g, ' '))
      ))
      .join(';'),
  ];
  if (!registros.length) {
    lineas.push(escaparCsv('No hay registros para este módulo'));
  } else {
    for (const registro of registros) {
      lineas.push(campos.map((campo) => escaparCsv(valorLegible(campo, registro[campo]))).join(';'));
    }
  }
  if (truncado) {
    lineas.push(escaparCsv(`Se muestra un máximo de ${LIMITE_MODULO} registros para este módulo`));
  }
  const nombreModulo = modulo.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
  return {
    nombre: `datos-sistema-${nombreModulo}.csv`,
    contenido: `\uFEFF${lineas.join('\r\n')}`,
  };
}

function crearPdf(secciones, fecha) {
  return new Promise((resolve, reject) => {
    const pdf = new PDFDocument({
      margin: 46,
      size: 'LETTER',
      bufferPages: true,
      info: {
        Title: 'Reporte de datos del sistema de climatización',
        Author: 'ThermoAssist',
        Subject: 'Reporte operativo',
      },
    });
    const partes = [];
    pdf.on('data', (parte) => partes.push(parte));
    pdf.on('error', reject);
    pdf.on('end', () => resolve(Buffer.concat(partes)));

    const anchoContenido = pdf.page.width - pdf.page.margins.left - pdf.page.margins.right;
    const inicioContenido = pdf.page.margins.left;
    const finContenido = pdf.page.height - pdf.page.margins.bottom - 22;
    let numeroRegistro = 0;
    const dibujarEncabezado = () => {
      pdf.save();
      pdf.rect(0, 0, pdf.page.width, 112).fill(`#${COLOR_AZUL}`);
      pdf.restore();
      pdf.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(19)
        .text('Reporte operativo', inicioContenido, 30, { lineBreak: false });
      pdf.font('Helvetica').fontSize(10).fillColor('#DCE8F5')
        .text('Sistema de gestión de servicios de climatización', inicioContenido, 59, { lineBreak: false });
      pdf.fontSize(9).fillColor('#FFFFFF')
        .text(`Generado: ${fecha}`, inicioContenido, 82, { lineBreak: false });
    };
    const nuevaPagina = () => {
      pdf.addPage();
      return pdf.page.margins.top;
    };
    dibujarEncabezado();
    let y = 132;
    for (const { titulo, registros, truncado } of secciones) {
      if (y + 60 > finContenido) y = nuevaPagina();
      pdf.font('Helvetica-Bold').fontSize(13).fillColor(`#${COLOR_AZUL}`)
        .text(titulo, inicioContenido, y, { width: anchoContenido });
      y += 20;
      pdf.font('Helvetica').fontSize(8).fillColor(`#${COLOR_SUAVE}`)
        .text(`${registros.length} ${registros.length === 1 ? 'registro' : 'registros'}${truncado ? ` · Se muestran máximo ${LIMITE_MODULO}` : ''}`, inicioContenido, y, { width: anchoContenido });
      y += 16;
      if (!registros.length) {
        pdf.font('Helvetica-Oblique').fontSize(9).fillColor(`#${COLOR_SUAVE}`)
          .text('No hay registros para este módulo.', inicioContenido + 8, y, { width: anchoContenido - 16 });
        y += 20;
        continue;
      }
      for (let indice = 0; indice < registros.length; indice += 1) {
        const registro = registros[indice];
        numeroRegistro += 1;
        const encabezado = registro.codigo
          ? registro.codigo
          : `Registro ${registro.id ?? registro.equipo_id ?? indice + 1}`;
        const filas = Object.entries(registro).map(([clave, valor]) => {
          const etiqueta = ETIQUETAS_CAMPOS[clave] || clave.replace(/_/g, ' ');
          const texto = valorLegible(clave, valor) || '—';
          const detalle = `${etiqueta}: ${texto}`;
          pdf.font('Helvetica').fontSize(9);
          const alto = pdf.heightOfString(detalle, {
            width: anchoContenido - 22,
            lineGap: 2,
          }) + 5;
          return { detalle, alto };
        });
        const altoTotal = 23 + filas.reduce((total, fila) => total + fila.alto, 0) + 7;
        if (y + altoTotal > finContenido) y = nuevaPagina();
        pdf.save();
        pdf.roundedRect(inicioContenido, y, anchoContenido, altoTotal, 5)
          .fill(indice % 2 === 0 ? '#F5F8FC' : '#FFFFFF');
        pdf.roundedRect(inicioContenido, y, anchoContenido, altoTotal, 5)
          .strokeColor('#DDE5EF')
          .lineWidth(0.7)
          .stroke();
        pdf.restore();
        pdf.font('Helvetica-Bold').fontSize(9).fillColor(`#${COLOR_CELESTE}`)
          .text(encabezado, inicioContenido + 10, y + 7, { width: anchoContenido - 20 });
        let filaY = y + 22;
        for (const fila of filas) {
          pdf.font('Helvetica').fontSize(9).fillColor(`#${COLOR_TEXTO}`)
            .text(fila.detalle, inicioContenido + 10, filaY, {
              width: anchoContenido - 20,
              lineGap: 2,
            });
          filaY += fila.alto;
        }
        y += altoTotal + 7;
      }
      y += 10;
    }

    const rango = pdf.bufferedPageRange();
    for (let indice = 0; indice < rango.count; indice += 1) {
      pdf.switchToPage(rango.start + indice);
      const yPie = pdf.page.height - 28;
      pdf.moveTo(pdf.page.margins.left, yPie - 8)
        .lineTo(pdf.page.width - pdf.page.margins.right, yPie - 8)
        .strokeColor('#DDE5EF')
        .stroke();
      pdf.font('Helvetica').fontSize(8).fillColor(`#${COLOR_SUAVE}`)
        .text('ThermoAssist · Reporte generado desde datos de solo lectura', pdf.page.margins.left, yPie, {
          width: anchoContenido * 0.75,
          lineBreak: false,
        });
      pdf.text(`Página ${indice + 1} de ${rango.count}`, pdf.page.width - pdf.page.margins.right - 100, yPie, {
        width: 100,
        align: 'right',
        lineBreak: false,
      });
    }
    pdf.end();
  });
}

function valorCelda(clave, valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  if (clave === 'activo') return Number(valor) === 1 ? 'Sí' : 'No';
  if (CLAVES_FECHA.has(clave)) {
    if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor;
    if (typeof valor === 'string') {
      const coincidencia = valor.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
      if (coincidencia) {
        const [, anio, mes, dia, hora = '0', minuto = '0', segundo = '0'] = coincidencia;
        const fecha = new Date(
          Number(anio),
          Number(mes) - 1,
          Number(dia),
          Number(hora),
          Number(minuto),
          Number(segundo)
        );
        if (
          fecha.getFullYear() === Number(anio)
          && fecha.getMonth() === Number(mes) - 1
          && fecha.getDate() === Number(dia)
        ) return fecha;
      }
    }
  }
  if (CLAVES_NUMERICAS.has(clave) && Number.isFinite(Number(valor))) return Number(valor);
  return valorLegible(clave, valor);
}

async function crearExcel(secciones, fecha) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'ThermoAssist';
  libro.subject = 'Reporte operativo de climatización';
  libro.title = 'Reporte de datos del sistema';
  libro.created = fecha;
  libro.modified = fecha;
  libro.views = [{ state: 'frozen', x: 0, y: 0, activeTab: 0 }];

  const resumen = libro.addWorksheet('Resumen', {
    properties: { tabColor: { argb: COLOR_AZUL } },
    views: [{ state: 'frozen', ySplit: 4 }],
  });
  resumen.columns = [
    { header: 'Módulo', key: 'modulo', width: 34 },
    { header: 'Registros exportados', key: 'registros', width: 24 },
    { header: 'Estado', key: 'estado', width: 35 },
  ];
  resumen.mergeCells('A1:C1');
  resumen.getCell('A1').value = 'REPORTE OPERATIVO · CLIMATIZACIÓN';
  resumen.getCell('A1').font = { name: 'Aptos Display', size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
  resumen.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_AZUL } };
  resumen.getRow(1).height = 36;
  resumen.mergeCells('A2:C2');
  resumen.getCell('A2').value = `Generado: ${fecha.toLocaleString('es-CO')}`;
  resumen.getCell('A2').font = { name: 'Aptos', size: 10, color: { argb: COLOR_SUAVE } };
  resumen.mergeCells('A3:C3');
  resumen.getCell('A3').value = 'Datos operativos para análisis. Se omiten teléfonos, correos y direcciones.';
  resumen.getCell('A3').font = { name: 'Aptos', size: 9, italic: true, color: { argb: COLOR_SUAVE } };
  resumen.addRow([]);
  resumen.addRow(['Módulo', 'Registros exportados', 'Estado']);
  const encabezadoResumen = resumen.getRow(5);
  encabezadoResumen.height = 24;
  encabezadoResumen.eachCell((celda) => {
    celda.font = { name: 'Aptos', bold: true, color: { argb: 'FFFFFFFF' } };
    celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_CELESTE } };
    celda.alignment = { vertical: 'middle' };
  });

  for (const seccion of secciones) {
    const nombreHoja = seccion.titulo.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31);
    const filaResumen = resumen.addRow([
      seccion.titulo,
      seccion.registros.length,
      seccion.truncado ? `Limitado a ${LIMITE_MODULO}; hay más registros` : 'Completo',
    ]);
    filaResumen.eachCell((celda) => {
      celda.font = { name: 'Aptos', size: 10, color: { argb: COLOR_TEXTO } };
      if (filaResumen.number % 2 === 0) {
        celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F2F6FA' } };
      }
      celda.border = { bottom: { style: 'hair', color: { argb: 'DDE5EF' } } };
      celda.alignment = { vertical: 'middle', wrapText: true };
    });

    const claves = [...new Set(seccion.registros.flatMap((registro) => Object.keys(registro)))];
    const hoja = libro.addWorksheet(nombreHoja, {
      properties: { tabColor: { argb: COLOR_CELESTE } },
      views: [{ state: 'frozen', ySplit: 1 }],
      pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    const columnas = claves.length ? claves : ['sin_registros'];
    hoja.columns = columnas.map((clave) => {
      const encabezado = clave === 'sin_registros'
        ? 'Información'
        : ETIQUETAS_CAMPOS[clave] || clave.replace(/_/g, ' ');
      if (CLAVES_FECHA.has(clave)) {
        return {
          header: encabezado,
          key: clave,
          width: CLAVES_FECHA_HORA.has(clave) ? 22 : 14,
          style: {
            font: { name: 'Aptos', size: 10, color: { argb: COLOR_TEXTO } },
            alignment: { vertical: 'middle', wrapText: true },
            numFmt: CLAVES_FECHA_HORA.has(clave) ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy',
          },
        };
      }
      const anchoContenidoColumna = seccion.registros.reduce((ancho, registro) => {
        const contenido = valorCelda(clave, registro[clave]);
        return Math.max(ancho, String(contenido ?? '').length);
      }, encabezado.length);
      return {
        header: encabezado,
        key: clave,
        width: Math.min(44, Math.max(clave === 'sin_registros' ? 38 : 14, anchoContenidoColumna + 2)),
        style: {
          font: { name: 'Aptos', size: 10, color: { argb: COLOR_TEXTO } },
          alignment: { vertical: 'top', wrapText: true },
        },
      };
    });
    hoja.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: Math.max(1, seccion.registros.length + 1), column: columnas.length },
    };
    hoja.pageSetup.printTitleRows = '1:1';
    hoja.pageSetup.fitToPage = true;
    hoja.getRow(1).height = 30;
    hoja.getRow(1).eachCell((celda) => {
      celda.font = { name: 'Aptos', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_AZUL } };
      celda.alignment = { vertical: 'middle', wrapText: true };
      celda.border = { bottom: { style: 'medium', color: { argb: COLOR_CELESTE } } };
    });
    if (claves.length === 0) {
      const filaVacia = hoja.addRow({ sin_registros: 'No hay registros para este módulo.' });
      filaVacia.height = 30;
      filaVacia.getCell(1).font = { name: 'Aptos', size: 10, italic: true, color: { argb: COLOR_SUAVE } };
    }
    for (const registro of seccion.registros) {
      const fila = hoja.addRow(Object.fromEntries(claves.map((clave) => [
        clave,
        valorCelda(clave, registro[clave]),
      ])));
      const lineasNecesarias = claves.reduce((lineas, clave, indice) => {
        const valor = valorCelda(clave, registro[clave]);
        const texto = valor instanceof Date ? '' : String(valor ?? '');
        return Math.max(lineas, Math.ceil(texto.length / Math.max(10, hoja.getColumn(indice + 1).width - 2)));
      }, 1);
      fila.height = Math.min(90, Math.max(24, lineasNecesarias * 15 + 8));
      fila.eachCell((celda, numeroColumna) => {
        celda.alignment = { vertical: 'middle', wrapText: !(celda.value instanceof Date) };
        if (fila.number % 2 === 0) {
          celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'F2F6FA' } };
        }
        const clave = claves[numeroColumna - 1];
        if (['subtotal', 'iva', 'total'].includes(clave)) {
          celda.numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
        } else if (CLAVES_FECHA.has(clave)) {
          celda.numFmt = CLAVES_FECHA_HORA.has(clave) ? 'dd/mm/yyyy hh:mm' : 'dd/mm/yyyy';
        } else if (['capacidad_btu', 'frecuencia_meses', 'dias_restantes', 'visitas_pendientes', 'ordenes_en_proceso'].includes(clave)) {
          celda.numFmt = '#,##0';
        }
        if (clave === 'estado') celda.font = { name: 'Aptos', size: 10, bold: true, color: { argb: COLOR_CELESTE } };
        celda.border = { bottom: { style: 'hair', color: { argb: 'DDE5EF' } } };
      });
    }
    if (seccion.truncado) {
      const filaAviso = hoja.addRow([`Reporte limitado a ${LIMITE_MODULO} registros; hay más resultados en el sistema.`]);
      hoja.mergeCells(filaAviso.number, 1, filaAviso.number, Math.max(claves.length, 1));
      filaAviso.getCell(1).font = { name: 'Aptos', italic: true, color: { argb: 'FF9A6700' } };
      filaAviso.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CE' } };
    }
  }
  return Buffer.from(await libro.xlsx.writeBuffer());
}

async function generar({ modulos, formato }) {
  validarSolicitud(modulos, formato);
  if (!configurada || !pool) {
    throw Object.assign(new Error('La conexión de solo lectura no está configurada'), { status: 503 });
  }
  const documentosExistentes = await documentos.listarDocumentos();
  const idsAReemplazar = documentosExistentes
    .filter(({ nombre, origen }) => origen === 'exportacion_sistema' || nombre.startsWith('datos-sistema-'))
    .map(({ id }) => id);
  if (documentosExistentes.length - idsAReemplazar.length >= 20) {
    throw Object.assign(new Error('El asistente ya tiene 20 documentos. Elimina uno antes de generar otro.'), { status: 409 });
  }

  const secciones = [];
  for (const modulo of modulos) {
    const [filas] = await pool.query(MODULOS[modulo].sql, [LIMITE_CONSULTA]);
    secciones.push({
      modulo,
      titulo: MODULOS[modulo].titulo,
      truncado: filas.length > LIMITE_MODULO,
      registros: filas.slice(0, LIMITE_MODULO).map((fila) => (
        Object.fromEntries(Object.entries(fila).map(([clave, valor]) => [
          clave,
          typeof valor === 'bigint' ? valor.toString() : valor,
        ]))
      )),
    });
  }

  const fecha = new Date();
  const sello = fecha.toISOString().slice(0, 10);
  const archivos = [];
  const incluirCsv = ['csv', 'ambos', 'todos'].includes(formato);
  const incluirPdf = ['pdf', 'ambos', 'excel_pdf', 'todos'].includes(formato);
  const incluirExcel = ['excel', 'excel_pdf', 'todos'].includes(formato);
  if (incluirCsv) {
    for (const seccion of secciones) {
      const csv = crearCsv(seccion);
      archivos.push({
        nombre: `datos-sistema-${sello}-${csv.nombre.slice('datos-sistema-'.length)}`,
        tipo: 'text/csv;charset=utf-16le',
        contenido: Buffer.from(csv.contenido, 'utf16le').toString('base64'),
      });
    }
  }
  if (incluirPdf) {
    const pdf = await crearPdf(secciones, fecha.toLocaleString('es-CO'));
    archivos.push({
      nombre: `datos-sistema-${sello}.pdf`,
      tipo: 'application/pdf',
      contenido: pdf.toString('base64'),
    });
  }
  if (incluirExcel) {
    const excel = await crearExcel(secciones, fecha);
    archivos.push({
      nombre: `datos-sistema-${sello}.xlsx`,
      tipo: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      contenido: excel.toString('base64'),
    });
  }

  const textoIndexado = secciones.map(({ titulo, registros }) => (
    `${titulo}\n${registros.length
      ? registros.map((registro) => Object.entries(registro)
        .map(([campo, valor]) => `${ETIQUETAS_CAMPOS[campo] || campo}: ${valorLegible(campo, valor)}`).join(' | ')).join('\n')
      : 'Sin registros.'}`
  )).join('\n\n');
  const nombreDocumento = `datos-sistema-${sello}.csv`;
  const documento = await documentos.guardarDocumento({
    originalname: nombreDocumento,
    buffer: Buffer.from(textoIndexado, 'utf8'),
  }, {
    origen: 'exportacion_sistema',
    reemplazarIds: idsAReemplazar,
  });

  return {
    archivos,
    documento,
    registros: secciones.reduce((total, seccion) => total + seccion.registros.length, 0),
    truncado: secciones.some((seccion) => seccion.truncado),
  };
}

module.exports = { generar };
