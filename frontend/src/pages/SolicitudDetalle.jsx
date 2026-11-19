import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import CotizacionForm from '../components/CotizacionForm';
import VisitaForm from '../components/VisitaForm';
import { useAuth } from '../context/AuthContext';
import api, { mensajeDeError } from '../api';
import { ESTADO_SOLICITUD, ESTADO_COTIZACION, ESTADO_VISITA, TIPO_SERVICIO, moneda, fecha, hora } from '../constantes';

function ItemsCotizacion({ detalle }) {
  const { cotizacion: q, items } = detalle;
  return (
    <>
      <div className="tabla-envoltorio">
        <table>
          <thead>
            <tr><th>Descripción</th><th>Cantidad</th><th>Valor unitario</th><th>Total</th></tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.descripcion}</td>
                <td>{i.cantidad}</td>
                <td>{moneda(i.valor_unitario)}</td>
                <td>{moneda(i.cantidad * i.valor_unitario)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="totales">
        <div><span>Subtotal</span><span>{moneda(q.subtotal)}</span></div>
        <div><span>IVA</span><span>{moneda(q.iva)}</span></div>
        <div className="total"><span>Total</span><span>{moneda(q.total)}</span></div>
      </div>
      {q.observaciones && <p><strong>Observaciones:</strong> {q.observaciones}</p>}
    </>
  );
}

export default function SolicitudDetalle() {
  const { id } = useParams();
  const { user } = useAuth();
  const esAdmin = user.rol === 'administrador';
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0); // al cambiar, se vuelve a consultar
  const [detalles, setDetalles] = useState({}); // ítems de cada cotización abierta
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [visitas, setVisitas] = useState([]);

  useEffect(() => {
    api.get(`/solicitudes/${id}`).then((r) => setDatos(r.data)).catch((err) => setError(mensajeDeError(err)));
  }, [id, version]);

  // Visitas de esta solicitud (la agenda ya viene filtrada según tu rol)
  useEffect(() => {
    if (!datos) return;
    api
      .get('/agenda')
      .then((r) => setVisitas(r.data.visitas.filter((v) => v.solicitud_id === Number(id))))
      .catch(() => {});
  }, [datos, id]);

  // Las cotizaciones que esperan respuesta se muestran abiertas
  useEffect(() => {
    if (!datos) return;
    datos.cotizaciones
      .filter((q) => q.estado === 'enviada')
      .forEach((q) => {
        api.get(`/cotizaciones/${q.id}`)
          .then((r) => setDetalles((d) => ({ ...d, [q.id]: r.data })))
          .catch(() => {});
      });
  }, [datos]);

  const alternarItems = async (cotId) => {
    if (detalles[cotId]) {
      const copia = { ...detalles };
      delete copia[cotId];
      setDetalles(copia);
      return;
    }
    try {
      const { data } = await api.get(`/cotizaciones/${cotId}`);
      setDetalles({ ...detalles, [cotId]: data });
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const accion = async (peticion) => {
    setOcupado(true);
    setError('');
    try {
      await peticion();
      setMotivo('');
      setVersion((v) => v + 1);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setOcupado(false);
    }
  };

  const responder = (cotId, decision) =>
    accion(() => api.post(`/cotizaciones/${cotId}/responder`, { decision, comentario: motivo }));

  const cancelar = () => {
    if (!window.confirm('¿Cancelar esta solicitud?')) return;
    accion(() => api.post(`/solicitudes/${id}/cancelar`, {}));
  };

  if (!datos) {
    return (
      <Layout>
        {error ? <p className="error" role="alert">{error}</p> : <p className="estado">Cargando…</p>}
        <Link to="/solicitudes">Volver a solicitudes</Link>
      </Layout>
    );
  }

  const { solicitud: s, cotizaciones, historial } = datos;
  const puedeCancelar = ['pendiente', 'cotizada'].includes(s.estado);
  const visitaActiva = visitas.find((v) => ['programada', 'reprogramada'].includes(v.estado));
  const mostrarVisita = visitaActiva || s.estado === 'aprobada';

  return (
    <Layout ancho>
      <p><Link to="/solicitudes">← Solicitudes</Link></p>
      <div className="cabecera">
        <h1>Solicitud #{s.id} <span className={`etiqueta estado-${s.estado}`}>{ESTADO_SOLICITUD[s.estado]}</span></h1>
        {puedeCancelar && <button className="peligro" onClick={cancelar} disabled={ocupado}>Cancelar solicitud</button>}
      </div>

      <dl className="ficha">
        {esAdmin && (<><dt>Cliente</dt><dd>{s.cliente_nombre}</dd></>)}
        <dt>Servicio</dt><dd>{TIPO_SERVICIO[s.tipo_servicio]}</dd>
        <dt>Equipo</dt>
        <dd>{[s.equipo_tipo, s.equipo_marca, s.equipo_modelo].filter(Boolean).join(' ') || 'Sin equipo registrado'}</dd>
        <dt>Descripción</dt><dd>{s.descripcion}</dd>
        <dt>Fecha</dt><dd>{fecha(s.created_at)}</dd>
      </dl>

      {error && <p className="error" role="alert">{error}</p>}

      <h2>Cotizaciones</h2>
      {cotizaciones.length === 0 && (
        <p>{esAdmin ? 'Todavía no has cotizado esta solicitud.' : 'Aún no hay cotizaciones. Te avisaremos aquí cuando llegue una.'}</p>
      )}

      {cotizaciones.map((q) => (
        <div className="bloque" key={q.id}>
          <div className="cabecera">
            <h3>
              Cotización #{q.id} · {fecha(q.fecha)} · {moneda(q.total)}{' '}
              <span className={`etiqueta estado-${q.estado}`}>{ESTADO_COTIZACION[q.estado]}</span>
            </h3>
            <button className="secundario" onClick={() => alternarItems(q.id)}>
              {detalles[q.id] ? 'Ocultar detalle' : 'Ver detalle'}
            </button>
          </div>

          {detalles[q.id] && <ItemsCotizacion detalle={detalles[q.id]} />}

          {q.estado === 'enviada' && !esAdmin && (
            <div className="respuesta">
              <label>Comentario (opcional)
                <input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={150} />
              </label>
              <div className="acciones">
                <button disabled={ocupado} onClick={() => responder(q.id, 'aprobar')}>Aprobar cotización</button>
                <button className="peligro" disabled={ocupado} onClick={() => responder(q.id, 'rechazar')}>Rechazar</button>
              </div>
            </div>
          )}
          {q.estado === 'enviada' && esAdmin && <p>Esperando la respuesta del cliente.</p>}
        </div>
      ))}

      {esAdmin && s.estado === 'pendiente' && (
        <CotizacionForm solicitudId={s.id} onGuardado={() => setVersion((v) => v + 1)} />
      )}

      {mostrarVisita && <h2>Visita</h2>}

      {visitaActiva && (
        <div className="bloque">
          <div className="cabecera">
            <h3>
              {fecha(visitaActiva.fecha_programada)}, de {hora(visitaActiva.hora_inicio)} a {hora(visitaActiva.hora_fin)}{' '}
              <span className={`etiqueta estado-${visitaActiva.estado}`}>{ESTADO_VISITA[visitaActiva.estado]}</span>
            </h3>
            {esAdmin && <Link to="/agenda" className="boton secundario">Reprogramar o cancelar en la agenda</Link>}
          </div>
          <p>Técnico asignado: {visitaActiva.tecnico_nombre}</p>
        </div>
      )}

      {s.estado === 'aprobada' && !esAdmin && (
        <p>Tu solicitud fue aprobada. Pronto programaremos la visita y la verás aquí.</p>
      )}
      {s.estado === 'aprobada' && esAdmin && (
        <VisitaForm solicitudId={s.id} onGuardado={() => setVersion((v) => v + 1)} />
      )}

      <h2>Seguimiento</h2>
      <ol className="historial">
        {historial.map((h, i) => (
          <li key={i}>
            <strong>{ESTADO_SOLICITUD[h.estado_nuevo]}</strong>
            <small>{String(h.fecha).slice(0, 16)}{h.usuario ? ` · ${h.usuario}` : ''}</small>
            {h.comentario && <div>{h.comentario}</div>}
          </li>
        ))}
      </ol>
    </Layout>
  );
}
