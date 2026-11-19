import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import FiltroSelect from '../components/FiltroSelect';
import { useAuth } from '../context/AuthContext';
import api, { mensajeDeError } from '../api';
import { ESTADO_SOLICITUD, TIPO_SERVICIO, fecha } from '../constantes';

export default function Solicitudes() {
  const { user } = useAuth();
  const esAdmin = user.rol === 'administrador';
  const [estado, setEstado] = useState('');
  const [solicitudes, setSolicitudes] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get('/solicitudes', { params: estado ? { estado } : {} })
      .then((r) => { setSolicitudes(r.data.solicitudes); setError(''); })
      .catch((err) => setError(mensajeDeError(err)))
      .finally(() => setCargando(false));
  }, [estado]);

  return (
    <Layout ancho>
      <PageHeader
        eyebrow={esAdmin ? 'CENTRO DE SERVICIOS' : 'MI SERVICIO'}
        title={esAdmin ? 'Solicitudes' : 'Mis solicitudes'}
        description={esAdmin ? 'Revisa los requerimientos, gestiona su avance y prepara cotizaciones.' : 'Solicita atención y mantente al tanto de cada servicio.'}
        icon="solicitudes"
        action={<Link to="/solicitudes/nueva" className="boton">Nueva solicitud</Link>}
      />

      <div className="filtros">
        <span className="filtros-etiqueta">ESTADO DE SOLICITUD</span>
        <FiltroSelect
          etiqueta="Filtrar solicitudes por estado"
          valor={estado}
          onChange={setEstado}
          opciones={[{ valor: '', etiqueta: 'Todos los estados' }, ...Object.entries(ESTADO_SOLICITUD).map(([valor, etiqueta]) => ({ valor, etiqueta }))]}
        />
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && <p className="estado">Cargando…</p>}
      {!cargando && !error && solicitudes.length === 0 && <p>No hay solicitudes para mostrar.</p>}

      {solicitudes.length > 0 && (
        <div className="registros-grid">
          {solicitudes.map((s) => (
            <article className="registro-card solicitud-card" key={s.id}>
              <div className="registro-card-cabecera">
                <span className="registro-numero">SOLICITUD <strong>#{s.id}</strong></span>
                <span className={`etiqueta estado-${s.estado}`}>{ESTADO_SOLICITUD[s.estado]}</span>
              </div>
              <h2 className="solicitud-servicio">{TIPO_SERVICIO[s.tipo_servicio]}</h2>
              <div className="solicitud-resumen">
                {esAdmin && <span><small>Cliente</small><strong>{s.cliente_nombre}</strong></span>}
                <span><small>Equipo</small><strong>{[s.equipo_tipo, s.equipo_marca].filter(Boolean).join(' ') || 'Sin equipo asociado'}</strong></span>
                <span><small>Fecha de solicitud</small><strong>{fecha(s.created_at)}</strong></span>
              </div>
              <div className="registro-card-pie">
                <span className="registro-conteo">Seguimiento del servicio</span>
                <Link to={`/solicitudes/${s.id}`} className="registro-accion">Ver solicitud <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </Layout>
  );
}
