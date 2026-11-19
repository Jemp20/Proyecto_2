import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api, { mensajeDeError } from '../api';

export default function Tecnicos() {
  const [tecnicos, setTecnicos] = useState([]);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ telefono: '', especialidad: '', activo: true });
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api
      .get('/tecnicos')
      .then((r) => setTecnicos(r.data.tecnicos))
      .catch((err) => setError(mensajeDeError(err)))
      .finally(() => setCargando(false));
  }, [version]);

  const editar = (t) => {
    setError('');
    setEditando(t);
    setForm({ telefono: t.telefono || '', especialidad: t.especialidad || '', activo: !!t.activo });
  };

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      await api.put(`/tecnicos/${editando.id}`, form);
      setEditando(null);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Layout ancho>
      <PageHeader
        eyebrow="EQUIPO DE TRABAJO"
        title="Técnicos"
        description="Organiza el equipo técnico y administra su disponibilidad y especialidades."
        icon="tecnicos"
        action={<Link to="/usuarios" className="boton secundario">Crear técnico</Link>}
      />

      {error && <p className="error" role="alert">{error}</p>}

      {editando && (
        <form className="bloque" onSubmit={guardar}>
          <h3>Editar a {editando.nombre}</h3>
          <div className="dos-columnas">
            <label>Teléfono
              <input value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </label>
            <label>Especialidad
              <input value={form.especialidad} onChange={(e) => setForm({ ...form, especialidad: e.target.value })} />
            </label>
          </div>
          <label className="casilla">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Activo (puede recibir visitas)
          </label>
          <div className="acciones">
            <button disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
            <button type="button" className="secundario" onClick={() => setEditando(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {cargando && <p className="estado">Cargando…</p>}
      {!cargando && tecnicos.length === 0 && <p>Todavía no hay técnicos registrados.</p>}

      {tecnicos.length > 0 && (
        <div className="registros-grid">
          {tecnicos.map((t) => (
            <article className="registro-card tecnico-card" key={t.id}>
              <div className="registro-card-cabecera">
                <span className="registro-avatar">{t.nombre.split(' ').filter(Boolean).slice(0, 2).map((parte) => parte[0]).join('').toUpperCase()}</span>
                <div className="registro-card-titulo">
                  <strong className="registro-titulo">{t.nombre}</strong>
                  <span className="registro-subtitulo">{t.especialidad || 'Especialidad no registrada'}</span>
                </div>
                <span className={`etiqueta ${t.activo ? 'estado-activo' : 'estado-inactivo'}`}>{t.activo ? 'Activo' : 'Inactivo'}</span>
              </div>
              <div className="registro-datos">
                <div><small>Correo</small><strong>{t.email}</strong></div>
                <div><small>Teléfono</small><strong>{t.telefono || '—'}</strong></div>
              </div>
              <div className="registro-card-pie">
                <span className="registro-conteo"><strong>{t.visitas_pendientes}</strong> visitas pendientes</span>
                <button className="secundario registro-editar" onClick={() => editar(t)}>Editar perfil</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </Layout>
  );
}
