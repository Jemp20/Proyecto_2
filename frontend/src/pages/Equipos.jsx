import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../context/AuthContext';
import api, { mensajeDeError } from '../api';
import { ESTADO_EQUIPO } from '../constantes';

// El administrador ve todos los equipos; el cliente, solo los suyos (lo decide la API)
export default function Equipos() {
  const { user } = useAuth();
  const esAdmin = user.rol === 'administrador';
  const [equipos, setEquipos] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get('/equipos')
      .then((r) => setEquipos(r.data.equipos))
      .catch((err) => setError(mensajeDeError(err)))
      .finally(() => setCargando(false));
  }, []);

  return (
    <Layout ancho>
      <PageHeader
        eyebrow={esAdmin ? 'INVENTARIO TÉCNICO' : 'MI SERVICIO'}
        title={esAdmin ? 'Equipos' : 'Mis equipos'}
        description={esAdmin ? 'Consulta el inventario de climatización y accede al historial de cada equipo.' : 'Consulta tus equipos registrados y revisa su historial de servicio.'}
        icon="equipos"
      />

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && <p className="estado">Cargando…</p>}
      {!cargando && !error && equipos.length === 0 && (
        <p>{esAdmin ? 'No hay equipos registrados.' : 'Aún no tienes equipos registrados.'}</p>
      )}

      {equipos.length > 0 && (
        <div className="registros-grid equipos-grid">
          {equipos.map((e) => (
            <article className="registro-card equipo-card" key={e.id}>
              <div className="registro-card-cabecera">
                <span className="registro-icono equipo-icono" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 8h16v9H4zM7 5h10M7 20h10M8 11h.01M12 11h.01M16 11h.01" />
                  </svg>
                </span>
                <div className="registro-card-titulo">
                  <strong className="registro-titulo">{e.tipo}</strong>
                  <span className="registro-subtitulo">{[e.marca, e.modelo].filter(Boolean).join(' ') || 'Marca no registrada'}</span>
                </div>
                <span className={`etiqueta estado-${e.estado}`}>{ESTADO_EQUIPO[e.estado]}</span>
              </div>
              <div className="registro-datos equipo-datos">
                <div><small>Capacidad</small><strong>{e.capacidad_btu ? `${e.capacidad_btu} BTU` : '—'}</strong></div>
                <div><small>Ubicación</small><strong>{e.ubicacion || '—'}</strong></div>
                <div><small>Instalación</small><strong>{e.fecha_instalacion || '—'}</strong></div>
              </div>
              <div className="registro-card-pie">
                {esAdmin
                  ? <Link to={`/clientes/${e.cliente_id}`} className="registro-cliente">{e.cliente_nombre}</Link>
                  : <span className="registro-conteo">Historial de mantenimiento</span>}
                <Link to={`/equipos/${e.id}/historial`} className="registro-accion">Ver historial <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </Layout>
  );
}
