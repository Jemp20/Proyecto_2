import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api, { mensajeDeError } from '../api';
import { ESTADO_SOLICITUD, TIPO_SERVICIO, fecha } from '../constantes';

const numero = (n) => new Intl.NumberFormat('es-CO').format(n);
const decimal = (n) => new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(n);
const fechaLocal = (date) => {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};
const nombreMes = (aaaamm) => {
  const [anio, mes] = aaaamm.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, 1)).toLocaleDateString('es-CO', { month: 'short', year: '2-digit', timeZone: 'UTC' });
};

function Indicador({ titulo, valor, detalle, tono = 'azul' }) {
  return (
    <div className={`indicador reporte-indicador tono-${tono}`}>
      <span className="reporte-indicador-titulo">{titulo}</span>
      <strong>{valor}</strong>
      {detalle && <small>{detalle}</small>}
    </div>
  );
}

function Grafico({ datos, tono = 'azul' }) {
  const maximo = Math.max(1, ...datos.map((d) => d.valor));
  const total = datos.reduce((suma, d) => suma + d.valor, 0);
  return (
    <ul className={`grafico reporte-grafico tono-${tono}`}>
      {datos.map((d) => (
        <li key={d.etiqueta}>
          <div className="reporte-grafico-cabecera">
            <span>{d.etiqueta}</span>
            <strong>{numero(d.valor)} <small>{total ? `${decimal((d.valor / total) * 100)} %` : '0 %'}</small></strong>
          </div>
          <div
            className="grafico-fondo"
            role="progressbar"
            aria-label={`${d.etiqueta}: ${d.valor} de ${total}`}
            aria-valuemin="0"
            aria-valuemax={maximo}
            aria-valuenow={d.valor}
          >
            <div className="grafico-valor" style={{ width: `${(d.valor / maximo) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function SeccionReporte({ eyebrow, titulo, descripcion, children }) {
  return (
    <section className="reporte-seccion">
      <header className="reporte-seccion-cabecera">
        <div>
          <span>{eyebrow}</span>
          <h2>{titulo}</h2>
        </div>
        {descripcion && <p>{descripcion}</p>}
      </header>
      {children}
    </section>
  );
}

function plazo(dias) {
  if (dias < 0) return { texto: `Vencido hace ${-dias} ${dias === -1 ? 'día' : 'días'}`, clase: 'estado-vencido' };
  if (dias === 0) return { texto: 'Vence hoy', clase: 'estado-pendiente' };
  return { texto: `En ${dias} ${dias === 1 ? 'día' : 'días'}`, clase: 'estado-pendiente' };
}

function rangoPeriodo(nombre) {
  const hoy = new Date();
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  if (nombre === '30dias') inicio.setDate(inicio.getDate() - 29);
  if (nombre === 'mes') inicio.setDate(1);
  if (nombre === '90dias') inicio.setDate(inicio.getDate() - 89);
  return { desde: fechaLocal(inicio), hasta: fechaLocal(hoy) };
}

export default function Reportes() {
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [periodo, setPeriodo] = useState('todo');

  useEffect(() => {
    let vigente = true;
    const params = {};
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    api
      .get('/reportes/resumen', { params })
      .then((r) => {
        if (!vigente) return;
        setDatos(r.data);
        setError('');
      })
      .catch((err) => {
        if (vigente) setError(mensajeDeError(err));
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => { vigente = false; };
  }, [desde, hasta]);

  const filtrado = desde || hasta;
  const aplicarPeriodo = (nombre) => {
    setCargando(true);
    setPeriodo(nombre);
    if (nombre === 'todo') {
      setDesde('');
      setHasta('');
      return;
    }

    const rango = rangoPeriodo(nombre);
    setDesde(rango.desde);
    setHasta(rango.hasta);
  };
  const totalEstados = datos?.solicitudes_por_estado.reduce((suma, item) => suma + item.total, 0) || 0;
  const totalTipos = datos?.solicitudes_por_tipo.reduce((suma, item) => suma + item.total, 0) || 0;

  return (
    <Layout ancho>
      <PageHeader
        eyebrow="ANÁLISIS DE OPERACIÓN"
        title="Reportes e indicadores"
        description="Explora el desempeño del servicio, la carga de trabajo y los mantenimientos próximos."
        icon="reportes"
      />

      <div className="reporte-filtros">
        <div className="reporte-filtros-cabecera">
          <div>
            <span className="reporte-filtros-ceja">EXPLORAR PERÍODO</span>
            <strong>{filtrado ? `${desde || 'Inicio'} — ${hasta || 'Hoy'}` : 'Todo el historial'}</strong>
          </div>
          <div className="reporte-periodos" aria-label="Períodos rápidos">
            {[
              ['todo', 'Todo'],
              ['30dias', 'Últimos 30 días'],
              ['mes', 'Este mes'],
              ['90dias', 'Últimos 90 días'],
            ].map(([valor, texto]) => (
              <button key={valor} type="button" className={periodo === valor ? 'activo' : ''} aria-pressed={periodo === valor} onClick={() => aplicarPeriodo(valor)}>
                {texto}
              </button>
            ))}
          </div>
        </div>
        <div className="reporte-filtros-fechas">
          <label>Desde
            <input type="date" value={desde} max={hasta || undefined} onChange={(e) => { setCargando(true); setPeriodo('personalizado'); setDesde(e.target.value); }} />
          </label>
          <label>Hasta
            <input type="date" value={hasta} min={desde || undefined} onChange={(e) => { setCargando(true); setPeriodo('personalizado'); setHasta(e.target.value); }} />
          </label>
          <span className="reporte-filtros-nota">El período afecta solicitudes, cotizaciones y servicios finalizados.</span>
        </div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && <p className="reporte-cargando" role="status">Actualizando indicadores…</p>}

      {datos && (
        <div className={`reporte-contenido${cargando ? ' reporte-actualizando' : ''}`} aria-busy={cargando}>
          <SeccionReporte eyebrow="VISTA GENERAL" titulo="La operación en números" descripcion="Cifras acumuladas del sistema. El rango de fechas no modifica estos datos.">
            <div className="indicadores reporte-indicadores">
              <Indicador titulo="Solicitudes recibidas" valor={numero(datos.totales.solicitudes)} detalle={`${numero(totalEstados)} en la distribución seleccionada`} tono="azul" />
              <Indicador titulo="Clientes registrados" valor={numero(datos.totales.clientes)} detalle="Cuentas registradas en el sistema" tono="naranja" />
              <Indicador titulo="Equipos registrados" valor={numero(datos.totales.equipos)} detalle="Inventario de climatización" tono="verde" />
              <Indicador titulo="Técnicos activos" valor={numero(datos.totales.tecnicos_activos)} detalle="Disponibles para asignación" tono="morado" />
            </div>
          </SeccionReporte>

          <SeccionReporte eyebrow="EFICIENCIA DEL SERVICIO" titulo="Atención y cotizaciones" descripcion="Indicadores calculados con los servicios y cotizaciones disponibles.">
            <div className="indicadores reporte-indicadores reporte-indicadores-secundarios">
              <Indicador
                titulo="Tiempo promedio de atención"
                valor={datos.atencion.dias_promedio === null ? '—' : `${decimal(datos.atencion.dias_promedio)} días`}
                detalle={datos.atencion.servicios ? `Promedio en ${numero(datos.atencion.servicios)} servicios finalizados` : 'Aún no hay servicios finalizados para calcularlo'}
                tono="azul"
              />
              <Indicador
                titulo="Cotizaciones aprobadas"
                valor={datos.cotizaciones.tasa_aprobacion === null ? '—' : `${decimal(datos.cotizaciones.tasa_aprobacion)} %`}
                detalle={`${numero(datos.cotizaciones.aprobadas)} aprobadas · ${numero(datos.cotizaciones.rechazadas)} rechazadas · ${numero(datos.cotizaciones.enviadas)} pendientes`}
                tono="verde"
              />
            </div>
          </SeccionReporte>

          <SeccionReporte eyebrow="DEMANDA" titulo="¿Qué servicios se solicitan?" descripcion={`${numero(totalTipos)} solicitudes incluidas en esta distribución.`}>
            {datos.solicitudes_por_tipo.length === 0 ? <p className="reporte-vacio">No hay solicitudes en este período.</p> : (
              <div className="reporte-panel">
                <Grafico datos={datos.solicitudes_por_tipo.map((f) => ({ etiqueta: TIPO_SERVICIO[f.tipo_servicio], valor: f.total }))} tono="naranja" />
              </div>
            )}
          </SeccionReporte>

          <SeccionReporte eyebrow="SEGUIMIENTO" titulo="Estado de las solicitudes" descripcion={`${numero(totalEstados)} solicitudes distribuidas por estado.`}>
            {datos.solicitudes_por_estado.length === 0 ? <p className="reporte-vacio">No hay solicitudes en este período.</p> : (
              <div className="reporte-panel">
                <Grafico datos={datos.solicitudes_por_estado.map((f) => ({ etiqueta: ESTADO_SOLICITUD[f.estado], valor: f.total }))} />
              </div>
            )}
          </SeccionReporte>

          <SeccionReporte eyebrow="TENDENCIA" titulo="Servicios finalizados por mes" descripcion="Comparación de los últimos 12 meses.">
            {datos.servicios_por_mes.length === 0 ? <p className="reporte-vacio">Aún no hay servicios finalizados para mostrar.</p> : (
              <div className="reporte-panel">
                <Grafico datos={datos.servicios_por_mes.map((f) => ({ etiqueta: nombreMes(f.mes), valor: f.total }))} tono="verde" />
              </div>
            )}
          </SeccionReporte>

          <SeccionReporte eyebrow="EQUIPO DE TRABAJO" titulo="Carga por técnico" descripcion="Visitas pendientes y trabajos atendidos por cada técnico.">
            {datos.carga_tecnicos.length === 0 ? <p className="reporte-vacio">Todavía no hay técnicos registrados.</p> : (
              <div className="tabla-envoltorio">
              <table>
                <thead>
                  <tr><th>Técnico</th><th>Visitas pendientes</th><th>En proceso</th><th>Servicios finalizados</th></tr>
                </thead>
                <tbody>
                  {datos.carga_tecnicos.map((t) => (
                    <tr key={t.id}>
                      <td>{t.nombre}{!t.activo && <> <span className="etiqueta estado-inactivo">Inactivo</span></>}</td>
                      <td>{t.visitas_pendientes}</td>
                      <td>{t.en_proceso}</td>
                      <td>{t.finalizados}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </SeccionReporte>

          <SeccionReporte eyebrow="PREVENCIÓN" titulo="Mantenimientos próximos" descripcion="Equipos vencidos o que requieren atención durante los próximos 30 días.">
            {datos.mantenimientos_proximos.length === 0 ? <p className="reporte-vacio">No hay mantenimientos vencidos ni por vencer en los próximos 30 días.</p> : (
              <div className="tabla-envoltorio">
              <table>
                <thead>
                  <tr><th>Equipo</th><th>Cliente</th><th>Ubicación</th><th>Último</th><th>Próximo</th><th>Plazo</th></tr>
                </thead>
                <tbody>
                  {datos.mantenimientos_proximos.map((m) => {
                    const p = plazo(m.dias_restantes);
                    return (
                      <tr key={m.equipo_id}>
                        <td><Link to={`/equipos/${m.equipo_id}/historial`}>{[m.tipo, m.marca].filter(Boolean).join(' ')}</Link></td>
                        <td>{m.cliente_nombre}</td>
                        <td>{m.ubicacion || '—'}</td>
                        <td>{fecha(m.ultima_fecha)}</td>
                        <td>{fecha(m.proxima_fecha)}</td>
                        <td><span className={`etiqueta ${p.clase}`}>{p.texto}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            )}
          </SeccionReporte>
        </div>
      )}
    </Layout>
  );
}
