import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api, { mensajeDeError } from '../api';

export default function Clientes() {
  const [q, setQ] = useState('');
  const [clientes, setClientes] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [mostrarArchivados, setMostrarArchivados] = useState(false);

  // Espera un instante después de teclear para no consultar en cada letra
  useEffect(() => {
    const espera = setTimeout(() => {
      api
        .get('/clientes', { params: { q, archivados: mostrarArchivados } })
        .then((r) => { setClientes(r.data.clientes); setError(''); })
        .catch((err) => setError(mensajeDeError(err)))
        .finally(() => setCargando(false));
    }, 250);
    return () => clearTimeout(espera);
  }, [q, mostrarArchivados]);

  return (
    <Layout ancho>
      <PageHeader
        eyebrow="GESTIÓN DE CLIENTES"
        title="Clientes"
        description="Administra las cuentas, consulta su información y mantén sus equipos organizados."
        icon="clientes"
        action={<Link to="/clientes/nuevo" className="boton">Nuevo cliente</Link>}
      />

      <input
        className="buscador"
        type="search"
        placeholder="Buscar por nombre, documento o correo"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Buscar clientes"
      />

      <label className="filtro-archivados">
        <input
          type="checkbox"
          checked={mostrarArchivados}
          onChange={(evento) => setMostrarArchivados(evento.target.checked)}
        />
        Mostrar clientes archivados
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      {cargando && <p className="estado">Cargando…</p>}
      {!cargando && !error && clientes.length === 0 && <p>No hay clientes que coincidan.</p>}

      {clientes.length > 0 && (
        <div className="registros-grid">
          {clientes.map((c) => (
            <article className="registro-card cliente-card" key={c.id}>
              <div className="registro-card-cabecera">
                <span className="registro-avatar">{c.nombre.split(' ').filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span>
                <div className="registro-card-titulo">
                  <Link to={`/clientes/${c.id}`} className="registro-titulo">{c.nombre}</Link>
                  <span className="registro-subtitulo">{c.ciudad || 'Ciudad no registrada'}</span>
                </div>
                <span className={`etiqueta ${c.archivado_en ? 'estado-inactivo' : 'estado-activo'}`}>{c.archivado_en ? 'Archivado' : 'Activo'}</span>
              </div>
              <div className="registro-datos">
                <div><small>Documento</small><strong>{c.documento || '—'}</strong></div>
                <div><small>Teléfono</small><strong>{c.telefono || '—'}</strong></div>
              </div>
              <div className="registro-card-pie">
                <span className="registro-conteo"><strong>{c.total_equipos}</strong> {c.total_equipos === 1 ? 'equipo registrado' : 'equipos registrados'}</span>
                <Link to={`/clientes/${c.id}`} className="registro-accion">Ver ficha <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </Layout>
  );
}
