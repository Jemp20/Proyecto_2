import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import FiltroSelect from '../components/FiltroSelect';
import VisitaForm from '../components/VisitaForm';
import { useAuth } from '../context/AuthContext';
import api, { mensajeDeError } from '../api';
import { ESTADO_VISITA, TIPO_SERVICIO, fecha, hora } from '../constantes';

export default function Agenda() {
  const { user } = useAuth();
  const esAdmin = user.rol === 'administrador';
  const [desde, setDesde] = useState(new Date().toLocaleDateString('en-CA'));
  const [estado, setEstado] = useState('');
  const [tecnicoId, setTecnicoId] = useState('');
  const [visitas, setVisitas] = useState([]);
  const [tecnicos, setTecnicos] = useState([]);
  const [porProgramar, setPorProgramar] = useState([]);
  const [editando, setEditando] = useState(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [ordenes, setOrdenes] = useState({}); // visita -> orden
  const navigate = useNavigate();

  useEffect(() => {
    const params = {};
    if (desde) params.desde = desde;
    if (estado) params.estado = estado;
    if (tecnicoId) params.tecnico_id = tecnicoId;
    api
      .get('/agenda', { params })
      .then((r) => { setVisitas(r.data.visitas); setError(''); })
      .catch((err) => setError(mensajeDeError(err)))
      .finally(() => setCargando(false));
  }, [desde, estado, tecnicoId, version]);

  // Órdenes de servicio ya creadas (cada rol recibe solo las suyas)
  useEffect(() => {
    api
      .get('/ordenes')
      .then((r) => setOrdenes(Object.fromEntries(r.data.ordenes.filter((o) => o.agenda_id).map((o) => [o.agenda_id, o]))))
      .catch(() => {});
  }, [version]);

  // Solo el administrador: lista de técnicos y solicitudes aprobadas que faltan por programar
  useEffect(() => {
    if (!esAdmin) return;
    api.get('/tecnicos').then((r) => setTecnicos(r.data.tecnicos)).catch(() => {});
    api.get('/solicitudes', { params: { estado: 'aprobada' } }).then((r) => setPorProgramar(r.data.solicitudes)).catch(() => {});
  }, [esAdmin, version]);

  const cancelarVisita = async (v) => {
    if (!window.confirm(`¿Cancelar la visita del ${fecha(v.fecha_programada)} a las ${hora(v.hora_inicio)}?`)) return;
    try {
      await api.post(`/agenda/${v.id}/cancelar`, {});
      setVersion((n) => n + 1);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const iniciarServicio = async (v) => {
    try {
      const { data } = await api.post('/ordenes', { agenda_id: v.id });
      navigate(`/ordenes/${data.id}`);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  // Cada rol ve las columnas que le sirven
  const columnas = [
    { titulo: 'Fecha', ver: (v) => fecha(v.fecha_programada) },
    { titulo: 'Horario', ver: (v) => `${hora(v.hora_inicio)} a ${hora(v.hora_fin)}` },
    { titulo: 'Técnico', roles: ['administrador', 'cliente'], ver: (v) => v.tecnico_nombre },
    {
      titulo: 'Cliente', roles: ['administrador', 'tecnico'],
      ver: (v) => (<>{v.cliente_nombre}<small className="sub">{v.cliente_telefono || ''}</small></>),
    },
    {
      titulo: 'Solicitud', roles: ['administrador', 'cliente'],
      ver: (v) => <Link to={`/solicitudes/${v.solicitud_id}`}>#{v.solicitud_id}</Link>,
    },
    {
      titulo: 'Servicio',
      ver: (v) => (<>{TIPO_SERVICIO[v.tipo_servicio]}<small className="sub">{String(v.descripcion).slice(0, 80)}</small></>),
    },
    { titulo: 'Equipo', ver: (v) => [v.equipo_tipo, v.equipo_marca].filter(Boolean).join(' ') || '—' },
    {
      titulo: 'Lugar', roles: ['administrador', 'tecnico'],
      ver: (v) => (<>{[v.cliente_direccion, v.cliente_ciudad].filter(Boolean).join(', ') || '—'}<small className="sub">{v.equipo_ubicacion || ''}</small></>),
    },
    {
      titulo: 'Orden',
      ver: (v) => {
        const orden = ordenes[v.id];
        if (orden) return <Link to={`/ordenes/${orden.id}`}>{orden.codigo}</Link>;
        if (user.rol !== 'cliente' && ['programada', 'reprogramada'].includes(v.estado)) {
          return <span className="acciones"><button onClick={() => iniciarServicio(v)}>Iniciar servicio</button></span>;
        }
        return '—';
      },
    },
    {
      titulo: 'Estado',
      ver: (v) => <span className={`etiqueta estado-${v.estado}`}>{ESTADO_VISITA[v.estado]}</span>,
    },
  ].filter((c) => !c.roles || c.roles.includes(user.rol));

  const titulo = esAdmin ? 'Agenda de visitas' : user.rol === 'tecnico' ? 'Mis visitas' : 'Mis visitas programadas';

  return (
    <Layout ancho>
      <PageHeader
        eyebrow="PROGRAMACIÓN DE SERVICIOS"
        title={titulo}
        description={esAdmin ? 'Organiza las visitas, asigna técnicos y consulta el calendario de servicios.' : 'Consulta tus visitas programadas y el estado de cada servicio.'}
        icon="agenda"
      />

      {esAdmin && porProgramar.length > 0 && (
        <div className="bloque">
          <h3>Solicitudes aprobadas por programar ({porProgramar.length})</h3>
          <ul className="modulos">
            {porProgramar.map((s) => (
              <li key={s.id}>
                <Link to={`/solicitudes/${s.id}`}>#{s.id}, {s.cliente_nombre}, {TIPO_SERVICIO[s.tipo_servicio]}</Link>
                <small>Programar</small>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editando && (
        <VisitaForm
          key={editando.id}
          visita={editando}
          onGuardado={() => { setEditando(null); setVersion((n) => n + 1); }}
          onCancelar={() => setEditando(null)}
        />
      )}

      <div className="filtros-fila">
        <label>Desde
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="agenda-filtro-estado">Estado
          <FiltroSelect
            etiqueta="Filtrar visitas por estado"
            valor={estado}
            onChange={setEstado}
            opciones={[{ valor: '', etiqueta: 'Todos los estados' }, ...Object.entries(ESTADO_VISITA).map(([valor, etiqueta]) => ({ valor, etiqueta }))]}
          />
        </label>
        {esAdmin && (
          <label>Técnico
            <FiltroSelect
              etiqueta="Filtrar por técnico"
              valor={tecnicoId}
              onChange={setTecnicoId}
              opciones={[{ valor: '', etiqueta: 'Todos los técnicos' }, ...tecnicos.map((tecnico) => ({ valor: String(tecnico.id), etiqueta: tecnico.nombre }))]}
            />
          </label>
        )}
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && <p className="estado">Cargando…</p>}
      {!cargando && !error && visitas.length === 0 && <p>No hay visitas para mostrar con estos filtros.</p>}

      {visitas.length > 0 && (
        <div className="registros-grid agenda-grid">
          {visitas.map((v) => (
            <article className="registro-card agenda-card" key={v.id}>
              <div className="registro-card-cabecera">
                <span className="registro-numero">VISITA <strong>#{v.id}</strong></span>
                <span className={`etiqueta estado-${v.estado}`}>{ESTADO_VISITA[v.estado]}</span>
              </div>
              <h2 className="solicitud-servicio">{TIPO_SERVICIO[v.tipo_servicio]}</h2>
              <div className="registro-datos agenda-datos">
                {columnas.filter((columna) => !['Estado', 'Servicio'].includes(columna.titulo)).map((columna) => (
                  <div key={columna.titulo}><small>{columna.titulo}</small><strong>{columna.ver(v)}</strong></div>
                ))}
              </div>
              {esAdmin && ['programada', 'reprogramada'].includes(v.estado) && !ordenes[v.id] && (
                <div className="acciones agenda-acciones">
                  <button className="secundario" onClick={() => setEditando(v)}>Reprogramar</button>
                  <button className="peligro" onClick={() => cancelarVisita(v)}>Cancelar</button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </Layout>
  );
}
