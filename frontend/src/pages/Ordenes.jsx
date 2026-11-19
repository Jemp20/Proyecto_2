import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import FiltroSelect from '../components/FiltroSelect';
import { useAuth } from '../context/AuthContext';
import api, { mensajeDeError } from '../api';
import { ESTADO_ORDEN, TIPO_SERVICIO, fechaHora } from '../constantes';

export default function Ordenes() {
  const { user } = useAuth();
  const [estado, setEstado] = useState('');
  const [ordenes, setOrdenes] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    api
      .get('/ordenes', { params: estado ? { estado } : {} })
      .then((r) => { setOrdenes(r.data.ordenes); setError(''); })
      .catch((err) => setError(mensajeDeError(err)))
      .finally(() => setCargando(false));
  }, [estado]);

  const columnas = [
    { titulo: 'Orden', ver: (o) => <Link to={`/ordenes/${o.id}`}>{o.codigo}</Link> },
    { titulo: 'Cliente', roles: ['administrador', 'tecnico'], ver: (o) => o.cliente_nombre },
    { titulo: 'Técnico', roles: ['administrador', 'cliente'], ver: (o) => o.tecnico_nombre },
    { titulo: 'Servicio', ver: (o) => TIPO_SERVICIO[o.tipo_servicio] },
    { titulo: 'Equipo', ver: (o) => [o.equipo_tipo, o.equipo_marca].filter(Boolean).join(' ') || '—' },
    { titulo: 'Inicio', ver: (o) => fechaHora(o.fecha_inicio) },
    { titulo: 'Estado', ver: (o) => <span className={`etiqueta estado-${o.estado}`}>{ESTADO_ORDEN[o.estado]}</span> },
  ].filter((c) => !c.roles || c.roles.includes(user.rol));

  const titulo = { administrador: 'Órdenes de servicio', tecnico: 'Mis órdenes de servicio', cliente: 'Estado de mis servicios' }[user.rol];

  return (
    <Layout ancho>
      <PageHeader
        eyebrow="SEGUIMIENTO DE SERVICIOS"
        title={titulo}
        description={user.rol === 'tecnico' ? <>Inicia un servicio desde <Link to="/agenda">Mis visitas</Link> para crear su orden.</> : 'Consulta el avance y el resultado de los trabajos de servicio.'}
        icon="ordenes"
      />

      <div className="filtros">
        <span className="filtros-etiqueta">ESTADO DE LA ORDEN</span>
        <FiltroSelect
          etiqueta="Filtrar órdenes por estado"
          valor={estado}
          onChange={setEstado}
          opciones={[{ valor: '', etiqueta: 'Todos los estados' }, ...Object.entries(ESTADO_ORDEN).map(([valor, etiqueta]) => ({ valor, etiqueta }))]}
        />
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && <p className="estado">Cargando…</p>}
      {!cargando && !error && ordenes.length === 0 && <p>Todavía no hay órdenes de servicio.</p>}

      {ordenes.length > 0 && (
        <div className="registros-grid">
          {ordenes.map((o) => (
            <article className="registro-card orden-card" key={o.id}>
              <div className="registro-card-cabecera">
                <span className="registro-numero">ORDEN DE SERVICIO <strong>{o.codigo}</strong></span>
                <span className={`etiqueta estado-${o.estado}`}>{ESTADO_ORDEN[o.estado]}</span>
              </div>
              <h2 className="solicitud-servicio">{TIPO_SERVICIO[o.tipo_servicio]}</h2>
              <div className="registro-datos">
                {columnas.filter((columna) => !['Orden', 'Estado', 'Servicio'].includes(columna.titulo)).map((columna) => (
                  <div key={columna.titulo}><small>{columna.titulo}</small><strong>{columna.ver(o)}</strong></div>
                ))}
              </div>
              <div className="registro-card-pie">
                <span className="registro-conteo">Seguimiento de trabajo</span>
                <Link to={`/ordenes/${o.id}`} className="registro-accion">Ver orden <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </Layout>
  );
}
