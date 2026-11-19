import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api, { mensajeDeError } from '../api';
import { ESTADO_EQUIPO, fecha, fechaHora } from '../constantes';

export default function HistorialEquipo() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/ordenes/historial/${id}`).then((r) => setDatos(r.data)).catch((err) => setError(mensajeDeError(err)));
  }, [id]);

  if (!datos) {
    return (
      <Layout>
        {error ? <p className="error" role="alert">{error}</p> : <p className="estado">Cargando…</p>}
        <button className="secundario" onClick={() => navigate(-1)}>Volver</button>
      </Layout>
    );
  }

  const { equipo: e, historial, proximo_mantenimiento: prox } = datos;

  return (
    <Layout ancho>
      <p><button className="secundario" onClick={() => navigate(-1)}>← Volver</button></p>
      <h1>Historial técnico: {[e.tipo, e.marca].filter(Boolean).join(' ')}</h1>

      <dl className="ficha">
        <dt>Cliente</dt><dd>{e.cliente_nombre}</dd>
        <dt>Modelo</dt><dd>{e.modelo || '—'}</dd>
        <dt>Serial</dt><dd>{e.serial || '—'}</dd>
        <dt>Ubicación</dt><dd>{e.ubicacion || '—'}</dd>
        <dt>Instalación</dt><dd>{fecha(e.fecha_instalacion)}</dd>
        <dt>Estado</dt><dd>{ESTADO_EQUIPO[e.estado]}</dd>
        <dt>Próximo mantenimiento</dt>
        <dd>{prox ? `${fecha(prox.proxima_fecha)} (cada ${prox.frecuencia_meses} meses; el último fue el ${fecha(prox.ultima_fecha)})` : 'Aún no programado'}</dd>
      </dl>

      <h2>Servicios realizados ({historial.length})</h2>
      {historial.length === 0 && <p>Este equipo todavía no tiene servicios finalizados.</p>}
      <ol className="historial">
        {historial.map((h) => (
          <li key={h.id}>
            <strong>{h.evento}</strong>
            <small>
              {fechaHora(h.fecha)}{h.tecnico_nombre ? `, ${h.tecnico_nombre}` : ''}
            </small>
            {h.orden_id && <div><Link to={`/ordenes/${h.orden_id}`}>Orden {h.codigo}</Link></div>}
            {h.detalle && <div className="texto-largo">{h.detalle}</div>}
          </li>
        ))}
      </ol>
    </Layout>
  );
}
