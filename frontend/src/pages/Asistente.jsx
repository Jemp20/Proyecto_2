import { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../components/Layout';
import api, { mensajeDeError } from '../api';
import { useAuth } from '../context/AuthContext';

const MAX_MENSAJES_GUARDADOS = 100;
const MAX_TAMANO_DOCUMENTO = 15 * 1024 * 1024;
const MODULOS_EXPORTACION = [
  ['solicitudes', 'Solicitudes'],
  ['equipos', 'Equipos'],
  ['ordenes', 'Órdenes de servicio'],
  ['agenda', 'Agenda y visitas'],
  ['cotizaciones', 'Cotizaciones'],
  ['mantenimientos', 'Mantenimientos preventivos'],
  ['tecnicos', 'Técnicos'],
];
const SUGERENCIAS = [
  { categoria: 'Solicitudes', pregunta: '¿Cuántas solicitudes están pendientes?' },
  { categoria: 'Actividad', pregunta: '¿Cómo se distribuyen las solicitudes por estado?' },
  { categoria: 'Mantenimiento', pregunta: '¿Qué equipos tienen el mantenimiento vencido?' },
];
const ETIQUETAS_CAMPOS = {
  tipo_servicio: 'Servicio',
  estado: 'Estado',
  created_at: 'Fecha de solicitud',
  cliente: 'Cliente',
  equipo: 'Equipo',
  marca: 'Marca',
  solicitud_id: 'Solicitud',
  fecha_programada: 'Fecha',
  hora_inicio: 'Hora de inicio',
  hora_fin: 'Hora de fin',
  tecnico: 'Técnico asignado',
  estado_solicitud: 'Estado de solicitud',
  equipo_id: 'Equipo',
  orden_id: 'Orden',
  evento: 'Evento',
  fecha: 'Fecha',
  tipo: 'Tipo',
  nombre: 'Nombre',
  ciudad: 'Ciudad',
  equipos: 'Equipos',
  solicitudes: 'Solicitudes',
  codigo: 'Código',
  fecha_inicio: 'Fecha de inicio',
  fecha_fin: 'Fecha de finalización',
  especialidad: 'Especialidad',
  activo: 'Activo',
  visitas_pendientes: 'Visitas pendientes',
  ordenes_en_proceso: 'Órdenes en proceso',
  subtotal: 'Subtotal',
  iva: 'IVA',
  total: 'Total',
  proxima_fecha: 'Próximo mantenimiento',
  dias_restantes: 'Días restantes',
  ubicacion: 'Ubicación',
  modelo: 'Modelo',
  capacidad_btu: 'Capacidad (BTU)',
  fecha_instalacion: 'Fecha de instalación',
};

function interpretarValor(valor, clave) {
  const etiquetas = {
    en_proceso: 'En proceso',
    mantenimiento_correctivo: 'Mantenimiento correctivo',
    mantenimiento_preventivo: 'Mantenimiento preventivo',
    finalizada: 'Finalizada',
    cotizada: 'Cotizada',
    programada: 'Programada',
    reprogramada: 'Reprogramada',
    cumplida: 'Cumplida',
    cancelada: 'Cancelada',
    en_mantenimiento: 'En mantenimiento',
    fuera_de_servicio: 'Fuera de servicio',
    revision: 'Revisión',
    instalacion: 'Instalación',
  };
  if (etiquetas[valor]) return etiquetas[valor];
  if (clave === 'activo' && valor === '1') return 'Sí';
  if (clave === 'activo' && valor === '0') return 'No';
  if (['subtotal', 'iva', 'total'].includes(clave) && Number.isFinite(Number(valor))) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 2,
    }).format(Number(valor));
  }
  return valor.replace(/_/g, ' ');
}

function interpretarRegistro(linea) {
  const campos = linea.split(' · ').map((campo) => {
    const separador = campo.indexOf(':');
    if (separador < 0) return null;
    return {
      clave: campo.slice(0, separador).trim(),
      valor: campo.slice(separador + 1).trim(),
    };
  }).filter((campo) => campo && campo.valor);

  if (campos.length < 2) return null;
  const valores = Object.fromEntries(campos.map(({ clave, valor }) => [clave, valor]));
  const titulo = valores.tipo_servicio
    ? `Solicitud #${valores.id || ''}`
    : valores.subtotal !== undefined || valores.iva !== undefined
      ? `Cotización #${valores.id || ''}`
    : valores.fecha_programada
      ? `Visita #${valores.id || ''}`
      : valores.evento
        ? 'Evento técnico'
        : valores.codigo
          ? `Orden ${valores.codigo}`
          : valores.tipo && valores.marca && valores.cliente
            ? `Equipo #${valores.id || ''}`
          : valores.equipo_id
            ? `Equipo #${valores.equipo_id}`
            : valores.id
              ? `Registro #${valores.id}`
              : 'Detalle';

  return {
    titulo,
    estado: valores.estado,
    campos: campos.filter(({ clave }) => !['id', 'estado'].includes(clave)),
  };
}

function nombreRegistro(registro, modulo) {
  if (modulo === 'solicitudes') return `Solicitud #${registro.id}`;
  if (modulo === 'equipos') return `Equipo #${registro.id}`;
  if (modulo === 'ordenes') return `Orden ${registro.codigo || `#${registro.id}`}`;
  if (modulo === 'agenda') return `Visita #${registro.id}`;
  if (modulo === 'cotizaciones') return `Cotización #${registro.id}`;
  if (modulo === 'tecnicos') return registro.nombre || `Técnico #${registro.id}`;
  if (modulo === 'clientes') return registro.nombre || `Cliente #${registro.id}`;
  if (modulo === 'historial') return registro.evento || 'Evento técnico';
  if (modulo === 'mantenimientos') return `Equipo #${registro.equipo_id}`;
  return `Registro #${registro.id ?? ''}`;
}

function RegistroEstructurado({ registro, modulo }) {
  const estado = registro.estado;
  const campos = Object.entries(registro)
    .filter(([clave, valor]) =>
      !['id', 'estado', 'codigo', 'nombre', 'evento'].includes(clave)
      && valor !== null
      && valor !== ''
    );

  return (
    <li className="asistente-registro">
      <div className="asistente-registro-cabecera">
        <h3>{nombreRegistro(registro, modulo)}</h3>
        {estado && <span className="asistente-etiqueta-estado">{interpretarValor(String(estado), 'estado')}</span>}
      </div>
      <dl>
        {campos.map(([clave, valor]) => (
          <div key={clave}>
            <dt>{ETIQUETAS_CAMPOS[clave] || clave.replace(/_/g, ' ')}</dt>
            <dd>{interpretarValor(String(valor), clave)}</dd>
          </div>
        ))}
      </dl>
    </li>
  );
}

function SeccionEstructurada({ seccion }) {
  if (seccion.tipo === 'conteo_estados') {
    return (
      <section className="asistente-seccion">
        <h3>{seccion.titulo}</h3>
        {seccion.total !== undefined && <p className="asistente-resumen">{new Intl.NumberFormat('es-CO').format(seccion.total)} solicitudes en total</p>}
        {seccion.estados?.length ? (
          <ul className="asistente-resumen-estados">
            {seccion.estados.map((fila) => (
              <li key={fila.estado}>
                <span>{fila.estado}</span>
                <strong>{new Intl.NumberFormat('es-CO').format(fila.cantidad)}</strong>
              </li>
            ))}
          </ul>
        ) : <p>Sin solicitudes en los estados consultados.</p>}
      </section>
    );
  }

  if (seccion.tipo === 'resumen') {
    return (
      <section className="asistente-seccion asistente-conteo">
        <span>{seccion.titulo}</span>
        <strong>{new Intl.NumberFormat('es-CO').format(seccion.total)}</strong>
      </section>
    );
  }

  if (seccion.tipo === 'ordenes_por_tecnico') {
    const tecnicos = seccion.tecnicos || [];
    return (
      <section className="asistente-seccion">
        <h3>{seccion.titulo}</h3>
        {tecnicos.length ? (
          <ul className="asistente-resumen-estados">
            {tecnicos.map((tecnico) => (
              <li key={tecnico.id}>
                <span>{tecnico.tecnico}</span>
                <strong>{new Intl.NumberFormat('es-CO').format(tecnico.ordenes_en_proceso)} {tecnico.ordenes_en_proceso === 1 ? 'orden' : 'órdenes'}</strong>
              </li>
            ))}
          </ul>
        ) : <p>Ningún técnico tiene órdenes de servicio en proceso.</p>}
      </section>
    );
  }

  if (seccion.tipo === 'registros') {
    const registros = seccion.registros || [];
    const total = Number(seccion.total) || 0;
    const moduloNombre = {
      solicitudes: total === 1 ? 'solicitud' : 'solicitudes',
      equipos: total === 1 ? 'equipo' : 'equipos',
      ordenes: total === 1 ? 'orden de servicio' : 'órdenes de servicio',
      agenda: total === 1 ? 'visita de agenda' : 'visitas de agenda',
      cotizaciones: total === 1 ? 'cotización' : 'cotizaciones',
      tecnicos: total === 1 ? 'técnico' : 'técnicos',
      clientes: total === 1 ? 'cliente' : 'clientes',
      historial: total === 1 ? 'evento de historial técnico' : 'eventos de historial técnico',
      mantenimientos: total === 1 ? 'equipo' : 'equipos',
    }[seccion.modulo] || 'registros';
    const periodo = {
      esta_semana: ' de esta semana',
      proxima_semana: ' de la próxima semana',
      proximos_7_dias: ' de los próximos 7 días',
    }[seccion.periodo] || '';
    const criterioMantenimiento = {
      vencidos: ' con mantenimiento preventivo vencido',
      proximos: ' con mantenimiento preventivo próximo a vencer',
      todos: ' con mantenimiento preventivo vencido o próximo a vencer',
    }[seccion.periodo] || ' con mantenimiento preventivo';
    const resumen = seccion.modulo === 'mantenimientos'
      ? `Encontré ${new Intl.NumberFormat('es-CO').format(total)} ${moduloNombre}${criterioMantenimiento}.`
      : `Encontré ${new Intl.NumberFormat('es-CO').format(total)} ${moduloNombre}${periodo}.`;

    return (
      <section className="asistente-seccion">
        <p className="asistente-resumen">
          {resumen}
          {total > registros.length && ` Se muestran ${registros.length} de ${new Intl.NumberFormat('es-CO').format(total)}.`}
        </p>
        {registros.length ? (
          <ol className="asistente-resultados">
            {registros.map((registro, indice) => (
              <RegistroEstructurado
                key={`${seccion.modulo}-${registro.id ?? registro.equipo_id ?? indice}`}
                modulo={seccion.modulo}
                registro={registro}
              />
            ))}
          </ol>
        ) : <p>No hay registros para mostrar.</p>}
      </section>
    );
  }

  return null;
}

function RespuestaAsistente({ texto, resultado }) {
  if (Array.isArray(resultado?.secciones)) {
    return (
      <div className="asistente-respuesta">
        {resultado.secciones.map((seccion, indice) => (
          <SeccionEstructurada key={`${seccion.tipo}-${indice}`} seccion={seccion} />
        ))}
      </div>
    );
  }

  const [resumen = '', ...lineas] = texto.split('\n');
  const registros = lineas.map(interpretarRegistro);
  const tieneRegistros = registros.some(Boolean);

  return (
    <div className="asistente-respuesta">
      <p className="asistente-resumen">{resumen}</p>
      {tieneRegistros ? (
        <ol className="asistente-resultados">
          {lineas.map((linea, indice) => {
            const registro = registros[indice];
            if (!registro) return <li className="asistente-detalle-texto" key={`detalle-${indice}`}>{linea}</li>;
            return (
              <li className="asistente-registro" key={`${registro.titulo}-${indice}`}>
                <div className="asistente-registro-cabecera">
                  <h3>{registro.titulo}</h3>
                  {registro.estado && <span className="asistente-etiqueta-estado">{interpretarValor(registro.estado, 'estado')}</span>}
                </div>
                <dl>
                  {registro.campos.map(({ clave, valor }) => (
                    <div key={clave}>
                      <dt>{ETIQUETAS_CAMPOS[clave] || clave.replace(/_/g, ' ')}</dt>
                      <dd>{interpretarValor(valor, clave)}</dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ol>
      ) : lineas.length > 0 ? (
        <ul className="asistente-detalles">
          {lineas.map((linea, indice) => <li key={`detalle-${indice}`}>{linea}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

function leerConversacion(usuarioId) {
  try {
    const guardado = localStorage.getItem(`asistente-conversacion-${usuarioId}`);
    if (!guardado) return { mensajes: [], error: '' };

    const mensajes = JSON.parse(guardado);
    if (
      !Array.isArray(mensajes) ||
      mensajes.length > MAX_MENSAJES_GUARDADOS ||
      mensajes.some((mensaje) =>
        !mensaje ||
        !['user', 'assistant'].includes(mensaje.rol) ||
        typeof mensaje.texto !== 'string' ||
        (mensaje.resultado !== undefined &&
          (!mensaje.resultado || !Array.isArray(mensaje.resultado.secciones)))
      )
    ) {
      return { mensajes: [], error: 'No se pudo restaurar el historial guardado.' };
    }

    return { mensajes, error: '' };
  } catch {
    return { mensajes: [], error: 'No se pudo leer el historial guardado en este navegador.' };
  }
}

function limitarMensajes(mensajes) {
  return mensajes.slice(-MAX_MENSAJES_GUARDADOS);
}

function TelegramVinculo() {
  const [estado, setEstado] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [consultado, setConsultado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [copiado, setCopiado] = useState(false);

  const cargarEstado = useCallback(async () => {
    setConsultado(true);
    setCargando(true);
    setError('');
    try {
      const respuesta = await api.get('/asistente/telegram');
      setEstado(respuesta.data);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  }, []);

  const generarCodigo = async () => {
    setError('');
    setCodigo('');
    setCopiado(false);
    try {
      const respuesta = await api.post('/asistente/telegram/codigo');
      setCodigo(respuesta.data.codigo);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const desvincular = async () => {
    setError('');
    try {
      await api.delete('/asistente/telegram');
      setEstado((actual) => ({ ...actual, vinculado: false }));
      setCodigo('');
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const copiarCodigo = async () => {
    try {
      await navigator.clipboard.writeText(`/start ${codigo}`);
      setCopiado(true);
    } catch {
      setError('No se pudo copiar. Selecciona y copia el comando manualmente.');
    }
  };

  const estadoBot = {
    activo: 'Bot activo y recibiendo actualizaciones.',
    conectando: 'El backend está conectando con Telegram.',
    conflicto: 'Telegram detectó otra instancia o un webhook usando este token. Detén la otra instancia y reinicia el backend.',
    detenido: 'El bot está configurado, pero el sondeo todavía no ha iniciado.',
    error: 'El sondeo del bot se detuvo por un error. Revisa la consola del backend y reinícialo.',
    no_configurado: 'Telegram no está configurado en el backend.',
    reintentando: 'El backend perdió conexión con Telegram y está intentando reconectarse.',
  }[estado?.estadoBot] || 'No se pudo determinar el estado del bot.';
  const estadoVisual = estado?.estadoBot || (consultado ? 'error' : 'sin-comprobar');
  const etiquetaEstado = {
    activo: 'Conectado',
    conectando: 'Conectando',
    conflicto: 'Conflicto',
    detenido: 'Detenido',
    error: 'Revisar',
    no_configurado: 'No configurado',
    reintentando: 'Reconectando',
    'sin-comprobar': 'Sin comprobar',
  }[estadoVisual];

  return (
    <section className="asistente-telegram" aria-labelledby="telegram-titulo">
      <header className="asistente-telegram-cabecera">
        <span className="asistente-telegram-icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21 3-7.2 18-3.9-7.9L2 9.2 21 3Z" />
            <path d="M21 3 9.9 13.1" />
          </svg>
        </span>
        <span className="asistente-telegram-titulos">
          <h2 id="telegram-titulo">ThermoAssist en Telegram</h2>
          <small>Continúa tus consultas desde un chat privado.</small>
        </span>
        <span className={`asistente-telegram-estado estado-${estadoVisual}`} role="status">
          <i aria-hidden="true" />
          {cargando ? 'Comprobando' : etiquetaEstado}
        </span>
      </header>
      {!consultado ? (
        <div className="asistente-telegram-cuerpo">
          <p>Comprueba el estado del bot y la vinculación de tu cuenta.</p>
          <button className="secundario asistente-telegram-boton" onClick={cargarEstado} type="button">Comprobar estado</button>
        </div>
      ) : cargando ? (
        <p className="asistente-telegram-mensaje" role="status">Conectando con el servicio de Telegram…</p>
      ) : !estado && error ? (
        <div className="asistente-telegram-cuerpo">
          <p>No se pudo comprobar el estado. Actualiza el diagnóstico para volver a intentarlo.</p>
          <button className="secundario asistente-telegram-boton" onClick={cargarEstado} type="button">Reintentar</button>
        </div>
      ) : !estado?.habilitado ? (
        <p className="asistente-telegram-mensaje">Telegram no está configurado en el backend. El asistente web sigue disponible.</p>
      ) : (
        <>
          <div className="asistente-telegram-diagnostico" aria-live="polite">
            <div className="asistente-telegram-dato">
              <span className="asistente-telegram-punto" aria-hidden="true" />
              <span><strong>Bot</strong><small>{estadoBot}</small></span>
            </div>
            <div className="asistente-telegram-dato">
              <span className={`asistente-telegram-punto ${estado.vinculado ? 'vinculado' : ''}`} aria-hidden="true" />
              <span><strong>Cuenta</strong><small>{estado.vinculado ? 'Chat privado vinculado' : 'Sin cuenta vinculada'}</small></span>
            </div>
            {estado.ultimaComprobacion && (
              <p className="asistente-telegram-ultima">Última respuesta: {new Date(estado.ultimaComprobacion).toLocaleString()}</p>
            )}
          </div>
          <div className="asistente-telegram-acciones">
            {estado.vinculado ? (
              <button className="secundario asistente-telegram-boton" onClick={desvincular} type="button">Desvincular</button>
            ) : (
              <>
                {!codigo && <button className="secundario asistente-telegram-boton" onClick={generarCodigo} type="button">Vincular cuenta</button>}
                {codigo && (
                  <div className="asistente-telegram-codigo">
                    <span><small>Envía este comando al bot:</small><code>/start {codigo}</code></span>
                    <button className="secundario" onClick={copiarCodigo} type="button">
                      {copiado ? 'Copiado' : 'Copiar comando'}
                    </button>
                    <button className="secundario" onClick={() => { setError(''); cargarEstado(); }} type="button">
                      Ya lo vinculé
                    </button>
                  </div>
                )}
              </>
            )}
            <button className="secundario asistente-telegram-actualizar" onClick={cargarEstado} type="button">Actualizar estado</button>
          </div>
          {['conflicto', 'error', 'reintentando', 'detenido'].includes(estado.estadoBot) && (
            <p className="asistente-telegram-ayuda">{estadoBot} {estado.estadoBot === 'conflicto' && 'Detén las otras instancias del backend y revisa que no haya un webhook activo; luego reinicia el servicio.'}</p>
          )}
        </>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="asistente-telegram-nota">Las preguntas se procesan en tu backend. Evita enviar información sensible por Telegram.</p>
    </section>
  );
}

function DocumentosAsistente() {
  const [documentos, setDocumentos] = useState([]);
  const [archivo, setArchivo] = useState(null);
  const [modulosExportacion, setModulosExportacion] = useState(
    MODULOS_EXPORTACION.map(([modulo]) => modulo)
  );
  const [formatoExportacion, setFormatoExportacion] = useState('excel_pdf');
  const [archivosGenerados, setArchivosGenerados] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [error, setError] = useState('');
  const [mensajeExportacion, setMensajeExportacion] = useState('');
  const inputArchivo = useRef(null);

  const cargarDocumentos = useCallback(async () => {
    try {
      const respuesta = await api.get('/asistente/documentos');
      setDocumentos(respuesta.data.documentos);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }, []);

  useEffect(() => {
    let cancelado = false;
    api.get('/asistente/documentos')
      .then((respuesta) => {
        if (!cancelado) setDocumentos(respuesta.data.documentos);
      })
      .catch((err) => {
        if (!cancelado) setError(mensajeDeError(err));
      });
    return () => { cancelado = true; };
  }, []);

  useEffect(() => () => {
    archivosGenerados.forEach(({ url }) => URL.revokeObjectURL(url));
  }, [archivosGenerados]);

  const importarDocumento = async (evento) => {
    evento.preventDefault();
    if (!archivo || cargando) return;
    if (archivo.size > MAX_TAMANO_DOCUMENTO) {
      setError('El archivo no puede superar 15 MB.');
      return;
    }

    setCargando(true);
    setError('');
    const datos = new FormData();
    datos.append('archivo', archivo);
    try {
      await api.post('/asistente/documentos', datos);
      setArchivo(null);
      if (inputArchivo.current) inputArchivo.current.value = '';
      await cargarDocumentos();
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  };

  const quitarDocumento = async (id) => {
    setCargando(true);
    setError('');
    try {
      await api.delete(`/asistente/documentos/${id}`);
      setDocumentos((actuales) => actuales.filter((documento) => documento.id !== id));
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  };

  const generarDesdeSistema = async (evento) => {
    evento.preventDefault();
    if (exportando || modulosExportacion.length === 0) return;
    setExportando(true);
    setError('');
    setMensajeExportacion('');
    try {
      const respuesta = await api.post('/asistente/documentos/generar', {
        modulos: modulosExportacion,
        formato: formatoExportacion,
      });
      setArchivosGenerados(respuesta.data.archivos.map((archivoGenerado) => {
        const binario = atob(archivoGenerado.contenido);
        const bytes = Uint8Array.from(binario, (caracter) => caracter.charCodeAt(0));
        const url = URL.createObjectURL(new Blob([bytes], { type: archivoGenerado.tipo }));
        return { nombre: archivoGenerado.nombre, url };
      }));
      await cargarDocumentos();
      setMensajeExportacion(
        `Se generaron ${respuesta.data.registros} registros y se actualizó la copia que consulta la IA cuando no está disponible la base de datos de solo lectura.${respuesta.data.truncado ? ' Algunos módulos alcanzaron el límite de 500 registros.' : ''}`
      );
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setExportando(false);
    }
  };

  return (
    <details className="asistente-documentos">
      <summary className="asistente-documentos-resumen">
        <span>
          <strong>Fuentes y documentos</strong>
          <small>Administra archivos y exportaciones del sistema</small>
        </span>
        <span className="asistente-documentos-contador">{documentos.length} de 20</span>
      </summary>
      <div className="asistente-documentos-contenido">
      <p className="asistente-documentos-intro">Importa manuales o normatividad en PDF/CSV, o genera reportes para que el asistente pueda consultarlos.</p>
      <form className="asistente-exportacion-formulario" onSubmit={generarDesdeSistema}>
        <fieldset disabled={exportando || cargando}>
          <legend>Crear archivos con los datos actuales del sistema</legend>
          <div className="asistente-exportacion-modulos">
            {MODULOS_EXPORTACION.map(([modulo, etiqueta]) => (
              <label key={modulo}>
                <input
                  checked={modulosExportacion.includes(modulo)}
                  onChange={(evento) => setModulosExportacion((actuales) => (
                    evento.target.checked
                      ? [...actuales, modulo]
                      : actuales.filter((valor) => valor !== modulo)
                  ))}
                  type="checkbox"
                />
                {etiqueta}
              </label>
            ))}
          </div>
          <div className="asistente-exportacion-acciones">
            <label htmlFor="formato-exportacion">Formato</label>
            <select
              id="formato-exportacion"
              onChange={(evento) => setFormatoExportacion(evento.target.value)}
              value={formatoExportacion}
            >
              <option value="excel_pdf">Excel y PDF (recomendado)</option>
              <option value="todos">Excel, CSV y PDF</option>
              <option value="excel">Excel (XLSX)</option>
              <option value="ambos">CSV y PDF</option>
              <option value="csv">Solo CSV</option>
              <option value="pdf">Solo PDF</option>
            </select>
            <button className="secundario" disabled={exportando || cargando || modulosExportacion.length === 0} type="submit">
              {exportando ? 'Generando archivos…' : 'Generar archivos'}
            </button>
          </div>
        </fieldset>
        <small>El CSV también se guarda en los documentos del asistente. Se exportan hasta 500 registros por módulo, sin datos de contacto.</small>
      </form>
      {archivosGenerados.length > 0 && (
        <ul className="asistente-exportacion-descargas" aria-label="Archivos generados">
          {archivosGenerados.map((archivoGenerado) => (
            <li key={archivoGenerado.nombre}>
              <a className="secundario" download={archivoGenerado.nombre} href={archivoGenerado.url}>
                Descargar {
                  archivoGenerado.nombre.toLowerCase().endsWith('.pdf')
                    ? 'PDF'
                    : archivoGenerado.nombre.toLowerCase().endsWith('.xlsx')
                      ? 'Excel'
                      : `CSV · ${archivoGenerado.nombre
                        .replace(/^datos-sistema-\d{4}-\d{2}-\d{2}-/, '')
                        .replace(/\.csv$/i, '')}`
                }
              </a>
            </li>
          ))}
        </ul>
      )}
      <small>Los reportes generados aquí ya se indexan automáticamente. Importa solo documentos externos, como manuales o normatividad.</small>
      <form className="asistente-documentos-formulario" onSubmit={importarDocumento}>
        <label htmlFor="documento-asistente">Seleccionar PDF o CSV (máximo 15 MB)</label>
        <input
          ref={inputArchivo}
          accept=".pdf,.csv,application/pdf,text/csv"
          disabled={cargando || documentos.length >= 20}
          id="documento-asistente"
          onChange={(evento) => {
            setArchivo(evento.target.files?.[0] || null);
            setError('');
          }}
          type="file"
        />
        <button className="secundario" disabled={!archivo || cargando || documentos.length >= 20} type="submit">
          {cargando ? 'Procesando…' : 'Importar documento'}
        </button>
      </form>
      {documentos.length > 0 && (
        <ul className="asistente-documentos-lista">
          {documentos.map((documento) => (
            <li key={documento.id}>
              <span>
                <strong>{documento.nombre}</strong>
                <small>
                  {documento.tipo.toUpperCase()} · {(documento.bytes / 1024).toFixed(0)} KB
                  {documento.creadoEn ? ` · Actualizado ${new Date(documento.creadoEn).toLocaleString()}` : ''}
                </small>
              </span>
              <button
                aria-label={`Eliminar ${documento.nombre}`}
                className="secundario"
                disabled={cargando}
                onClick={() => quitarDocumento(documento.id)}
                type="button"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error" role="alert">{error}</p>}
      {mensajeExportacion && <p className="asistente-exportacion-mensaje" role="status">{mensajeExportacion}</p>}
      <small className="asistente-documentos-nota">Los archivos se procesan y almacenan en este servidor; no se envían completos al proveedor de IA, solo los fragmentos pertinentes a cada pregunta.</small>
      </div>
    </details>
  );
}

export default function Asistente() {
  const { user } = useAuth();
  const [inicial] = useState(() => leerConversacion(user.id));
  const [pregunta, setPregunta] = useState('');
  const [fuenteConsulta, setFuenteConsulta] = useState('automatico');
  const [mensajes, setMensajes] = useState(inicial.mensajes);
  const [cargando, setCargando] = useState(false);
  const [cargandoHistorial, setCargandoHistorial] = useState(true);
  const [error, setError] = useState('');
  const [errorAlmacenamiento, setErrorAlmacenamiento] = useState(inicial.error);
  const finConversacion = useRef(null);

  const guardarConversacion = useCallback((nuevosMensajes) => {
    setErrorAlmacenamiento('');
    try {
      localStorage.setItem(
        `asistente-conversacion-${user.id}`,
        JSON.stringify(limitarMensajes(nuevosMensajes))
      );
    } catch {
      setErrorAlmacenamiento('No se pudo guardar el historial en este navegador.');
    }
  }, [user.id]);

  useEffect(() => {
    finConversacion.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [mensajes, cargando]);

  useEffect(() => {
    let cancelado = false;
    const cargarHistorial = async () => {
      try {
        const respuesta = await api.get('/asistente/historial');
        const historialServidor = typeof respuesta.data.mensajes === 'string'
          ? JSON.parse(respuesta.data.mensajes)
          : respuesta.data.mensajes;
        if (!Array.isArray(historialServidor)) {
          throw new Error('El historial recibido no tiene un formato válido');
        }

        if (historialServidor.length > 0) {
          if (!cancelado) {
            setMensajes(historialServidor);
            guardarConversacion(historialServidor);
          }
        } else if (inicial.mensajes.length > 0) {
          await api.put('/asistente/historial', { mensajes: inicial.mensajes });
          if (!cancelado) setMensajes(inicial.mensajes);
        } else if (!cancelado) {
          setMensajes([]);
        }
      } catch (err) {
        if (!cancelado) {
          setMensajes(inicial.mensajes);
          setError(`No se pudo sincronizar el historial. ${mensajeDeError(err)}`);
        }
      } finally {
        if (!cancelado) setCargandoHistorial(false);
      }
    };

    cargarHistorial();
    return () => { cancelado = true; };
  }, [user.id, inicial.mensajes, guardarConversacion]);

  const consultar = async (evento) => {
    evento.preventDefault();
    const texto = pregunta.trim();
    if (!texto || cargando || cargandoHistorial) return;

    const ultimoMensaje = mensajes.at(-1);
    const repetirEnvioPendiente = ultimoMensaje?.rol === 'user' && ultimoMensaje.texto === texto;
    const historial = (repetirEnvioPendiente ? mensajes.slice(0, -1) : mensajes)
      .slice(-6)
      .map((mensaje) => ({
        role: mensaje.rol,
        content: mensaje.texto,
      }));
    const mensajesUsuario = limitarMensajes(
      repetirEnvioPendiente ? mensajes : [...mensajes, { rol: 'user', texto }]
    );
    setMensajes(mensajesUsuario);
    guardarConversacion(mensajesUsuario);
    setPregunta('');
    setError('');
    setCargando(true);

    try {
      await api.put('/asistente/historial', { mensajes: mensajesUsuario });
      const respuesta = await api.post('/asistente', {
        pregunta: texto,
        historial,
        fuente: fuenteConsulta,
      });
      const mensajesRespuesta = limitarMensajes([
        ...mensajesUsuario,
        {
          rol: 'assistant',
          texto: respuesta.data.respuesta,
          ...(respuesta.data.resultado ? { resultado: respuesta.data.resultado } : {}),
        },
      ]);
      setMensajes(mensajesRespuesta);
      guardarConversacion(mensajesRespuesta);
      try {
        await api.put('/asistente/historial', { mensajes: mensajesRespuesta });
      } catch (err) {
        setError(`La respuesta llegó, pero no se pudo sincronizar el historial. ${mensajeDeError(err)}`);
      }
    } catch (err) {
      if (err.response?.data?.codigo === 'PREGUNTA_NO_INTERPRETADA') {
        const mensajesRespuesta = limitarMensajes([
          ...mensajesUsuario,
          { rol: 'assistant', texto: err.response.data.mensaje },
        ]);
        setMensajes(mensajesRespuesta);
        guardarConversacion(mensajesRespuesta);
        try {
          await api.put('/asistente/historial', { mensajes: mensajesRespuesta });
        } catch (errorHistorial) {
          setError(`La sugerencia llegó, pero no se pudo sincronizar el historial. ${mensajeDeError(errorHistorial)}`);
        }
      } else {
        setError(mensajeDeError(err));
      }
    } finally {
      setCargando(false);
    }
  };

  const limpiarConversacion = async () => {
    if (cargando || cargandoHistorial) return;
    setCargando(true);
    setError('');
    try {
      await api.delete('/asistente/historial');
      setMensajes([]);
      guardarConversacion([]);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setCargando(false);
    }
  };

  return (
    <Layout ancho>
      <header className="asistente-encabezado">
        <div className="asistente-marca" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
            <circle cx="12" cy="12" r="2.4" />
          </svg>
        </div>
        <div className="asistente-encabezado-texto">
          <p className="asistente-ceja">THERMOASSIST <span>·</span> ASISTENTE INTELIGENTE</p>
          <h1>Pregúntale a tus datos</h1>
          <p>Haz una pregunta en lenguaje natural. En modo automático, elegiré la fuente adecuada.</p>
        </div>
        <span className="asistente-datos-vivos"><i aria-hidden="true" /> Datos y documentos</span>
      </header>

      <section className="asistente-espacio" aria-label="Conversación con ThermoAssist">
      <div className="asistente-chat" aria-live="polite" aria-busy={cargando}>
        {cargandoHistorial ? (
          <p className="asistente-espera" role="status">Preparando tu conversación…</p>
        ) : mensajes.length === 0 ? (
          <div className="asistente-inicio">
            <span className="asistente-saludo-icono" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v2M12 19v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M3 12h2m14 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                <circle cx="12" cy="12" r="5" />
              </svg>
            </span>
            <p className="asistente-bienvenida-ceja">Hola, {user.nombre.split(' ')[0]}</p>
            <h2>¿Qué quieres descubrir hoy?</h2>
            <p className="asistente-intro">Consulta clientes, equipos, servicios y los documentos técnicos que hayas cargado.</p>
            <div className="asistente-sugerencias">
              {SUGERENCIAS.map(({ categoria, pregunta: preguntaSugerida }) => (
                <button
                  className="asistente-sugerencia"
                  key={preguntaSugerida}
                  onClick={() => setPregunta(preguntaSugerida)}
                  type="button"
                >
                  <span>
                    <small>{categoria}</small>
                    <strong>{preguntaSugerida}</strong>
                  </span>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M4 10h12M10 4l6 6-6 6" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            <div className="asistente-chat-cabecera">
              <div className="asistente-chat-identidad">
                <span className="asistente-avatar asistente-avatar-bot" aria-hidden="true">T</span>
                <span><strong>ThermoAssist</strong><small>Consulta segura de tus datos</small></span>
              </div>
              <button className="asistente-limpiar" disabled={cargando || cargandoHistorial} onClick={limpiarConversacion} type="button">
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M3 5h14M8 5V3h4v2m3 0-.7 11H5.7L5 5m3 3v5m4-5v5" />
                </svg>
                Borrar conversación
              </button>
            </div>
            <ol className="asistente-mensajes" aria-label="Conversación">
              {mensajes.map((mensaje, indice) => (
                <li className={`asistente-mensaje ${mensaje.rol}`} key={`${mensaje.rol}-${indice}`}>
                  <span className={`asistente-avatar ${mensaje.rol === 'assistant' ? 'asistente-avatar-bot' : 'asistente-avatar-usuario'}`} aria-hidden="true">
                    {mensaje.rol === 'assistant' ? 'T' : user.nombre.split(' ').map((parte) => parte[0]).slice(0, 2).join('').toUpperCase()}
                  </span>
                  <div className="asistente-mensaje-contenido">
                    <strong>{mensaje.rol === 'user' ? 'Tú' : 'ThermoAssist'}</strong>
                    <div className="asistente-burbuja">
                      {mensaje.rol === 'assistant'
                        ? <RespuestaAsistente texto={mensaje.texto} resultado={mensaje.resultado} />
                        : <p>{mensaje.texto}</p>}
                    </div>
                  </div>
                </li>
              ))}
              {cargando && (
                <li className="asistente-mensaje assistant asistente-cargando">
                  <span className="asistente-avatar asistente-avatar-bot" aria-hidden="true">T</span>
                  <div className="asistente-mensaje-contenido">
                    <strong>ThermoAssist</strong>
                    <div className="asistente-burbuja asistente-espera">
                      <span className="asistente-puntos" aria-hidden="true"><i /><i /><i /></span>
                      Consultando tus datos…
                    </div>
                  </div>
                </li>
              )}
              <li ref={finConversacion} aria-hidden="true" />
            </ol>
          </>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {errorAlmacenamiento && <p className="error" role="alert">{errorAlmacenamiento}</p>}
      <form className="asistente-formulario" onSubmit={consultar}>
        <label className="asistente-etiqueta-pregunta" htmlFor="pregunta-asistente">Escribe tu pregunta</label>
        <div className="asistente-compositor">
          <textarea
            id="pregunta-asistente"
            maxLength={1000}
            onChange={(evento) => setPregunta(evento.target.value)}
            placeholder="Ej.: ¿Cuántas solicitudes pendientes tenemos?"
            rows={2}
            value={pregunta}
          />
          <button className="asistente-enviar" disabled={cargando || cargandoHistorial || !pregunta.trim()} type="submit" aria-label={cargando ? 'Enviando pregunta' : 'Enviar pregunta'} title={cargando ? 'Enviando pregunta' : 'Enviar pregunta'}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m3 3 14 7-14 7 2.5-7L3 3Z" />
              <path d="M5.5 10H17" />
            </svg>
          </button>
        </div>
        <div className="asistente-envio">
          <label className="asistente-fuente" htmlFor="fuente-asistente">
            Consultar en
            <select
              disabled={cargando || cargandoHistorial}
              id="fuente-asistente"
              onChange={(evento) => setFuenteConsulta(evento.target.value)}
              value={fuenteConsulta}
            >
              <option value="automatico">Automático</option>
              <option value="sistema">Base de datos</option>
              <option value="documentos">Documentos PDF/CSV</option>
            </select>
          </label>
          <small className="asistente-fuente-ayuda">
            {fuenteConsulta === 'automatico'
              ? 'Automático selecciona la fuente según tu pregunta.'
              : fuenteConsulta === 'sistema'
                ? 'La base de datos se consulta en modo de solo lectura.'
                : 'Busca respuestas en los documentos que hayas importado.'}
          </small>
          <small>{pregunta.length}/1000</small>
        </div>
      </form>
      </section>

      <DocumentosAsistente />
      <TelegramVinculo />
    </Layout>
  );
}
