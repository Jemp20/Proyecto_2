import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import api, { mensajeDeError } from '../api';
import { ESTADO_COTIZACION, moneda, fecha } from '../constantes';

export default function Cotizaciones() {
  const { user } = useAuth();
  const esAdmin = user.rol === 'administrador';
  const [cotizaciones, setCotizaciones] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get('/cotizaciones')
      .then((r) => setCotizaciones(r.data.cotizaciones))
      .catch((err) => setError(mensajeDeError(err)))
      .finally(() => setCargando(false));
  }, []);

  return (
    <Layout ancho>
      <PageHeader
        eyebrow="PROPUESTAS DE SERVICIO"
        title={esAdmin ? 'Cotizaciones' : 'Mis cotizaciones'}
        description={esAdmin ? 'Consulta las propuestas enviadas y revisa su estado de aprobación.' : 'Revisa los valores y el estado de tus propuestas de servicio.'}
        icon="cotizaciones"
      />

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && <p className="estado">Cargando…</p>}
      {!cargando && !error && cotizaciones.length === 0 && <p>Todavía no hay cotizaciones.</p>}

      {cotizaciones.length > 0 && (
        <div className="registros-grid">
          {cotizaciones.map((q) => (
            <article className="registro-card cotizacion-card" key={q.id}>
              <div className="registro-card-cabecera">
                <span className="registro-numero">COTIZACIÓN <strong>#{q.id}</strong></span>
                <span className={`etiqueta estado-${q.estado}`}>{ESTADO_COTIZACION[q.estado]}</span>
              </div>
              <div className="cotizacion-total">
                <small>Valor total</small>
                <strong>{moneda(q.total)}</strong>
              </div>
              <div className="registro-datos">
                {esAdmin && <div><small>Cliente</small><strong>{q.cliente_nombre}</strong></div>}
                <div><small>Fecha</small><strong>{fecha(q.fecha)}</strong></div>
              </div>
              <div className="registro-card-pie">
                <Link to={`/solicitudes/${q.solicitud_id}`} className="registro-conteo">Solicitud #{q.solicitud_id}</Link>
                <Link to={`/solicitudes/${q.solicitud_id}`} className="registro-accion">Ver solicitud <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </Layout>
  );
}
