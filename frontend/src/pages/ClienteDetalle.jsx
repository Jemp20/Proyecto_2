import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import EquipoForm from '../components/EquipoForm';
import api, { mensajeDeError } from '../api';
import { ESTADO_EQUIPO } from '../constantes';

export default function ClienteDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0); // al cambiar, se vuelve a consultar
  const [formAbierto, setFormAbierto] = useState(false);
  const [equipoEditando, setEquipoEditando] = useState(null);

  useEffect(() => {
    api
      .get(`/clientes/${id}`)
      .then((r) => setDatos(r.data))
      .catch((err) => setError(mensajeDeError(err)));
  }, [id, version]);

  const cerrarForm = () => {
    setFormAbierto(false);
    setEquipoEditando(null);
  };

  const guardado = () => {
    cerrarForm();
    setVersion((v) => v + 1);
  };

  const eliminarCliente = async () => {
    if (!window.confirm('¿Archivar este cliente? Se conservarán sus equipos e historial y se bloqueará el acceso de su cuenta.')) return;
    try {
      await api.delete(`/clientes/${id}`);
      navigate('/clientes');
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const restaurarCliente = async () => {
    try {
      await api.patch(`/clientes/${id}/restaurar`);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  const eliminarEquipo = async (equipo) => {
    if (!window.confirm(`¿Eliminar el equipo ${equipo.tipo}${equipo.marca ? ' ' + equipo.marca : ''}?`)) return;
    try {
      await api.delete(`/equipos/${equipo.id}`);
      setVersion((v) => v + 1);
    } catch (err) {
      setError(mensajeDeError(err));
    }
  };

  if (!datos) {
    return (
      <Layout>
        {error ? <p className="error" role="alert">{error}</p> : <p className="estado">Cargando…</p>}
        <Link to="/clientes">Volver a clientes</Link>
      </Layout>
    );
  }

  const { cliente, equipos } = datos;

  return (
    <Layout ancho>
      <p><Link to="/clientes">← Clientes</Link></p>
      <div className="cabecera">
        <div>
          <h1>{cliente.nombre}</h1>
          {cliente.archivado_en && <span className="etiqueta estado-inactivo">Archivado</span>}
        </div>
        <div className="acciones">
          {cliente.archivado_en ? (
            <button onClick={restaurarCliente}>Restaurar cliente</button>
          ) : (
            <>
              <Link to={`/clientes/${id}/editar`} className="boton secundario">Editar</Link>
              <button className="peligro" onClick={eliminarCliente}>Archivar</button>
            </>
          )}
        </div>
      </div>
      {cliente.archivado_en && (
        <p className="aviso">El cliente está archivado. Su historial se conserva y no puede acceder ni generar nuevas operaciones.</p>
      )}

      <dl className="ficha">
        <dt>Documento</dt><dd>{cliente.documento || '—'}</dd>
        <dt>Teléfono</dt><dd>{cliente.telefono || '—'}</dd>
        <dt>Correo</dt><dd>{cliente.email || '—'}</dd>
        <dt>Dirección</dt><dd>{cliente.direccion || '—'}</dd>
        <dt>Ciudad</dt><dd>{cliente.ciudad || '—'}</dd>
      </dl>

      {error && <p className="error" role="alert">{error}</p>}

      <div className="cabecera">
        <h2>Equipos ({equipos.length})</h2>
        {!cliente.archivado_en && !formAbierto && !equipoEditando && (
          <button onClick={() => setFormAbierto(true)}>Registrar equipo</button>
        )}
      </div>

      {!cliente.archivado_en && (formAbierto || equipoEditando) && (
        <EquipoForm
          key={equipoEditando ? equipoEditando.id : 'nuevo'}
          clienteId={cliente.id}
          equipo={equipoEditando}
          onGuardado={guardado}
          onCancelar={cerrarForm}
        />
      )}

      {equipos.length === 0 ? (
        <p>Este cliente aún no tiene equipos registrados.</p>
      ) : (
        <div className="tabla-envoltorio">
          <table>
            <thead>
              <tr>
                <th>Tipo</th><th>Marca y modelo</th><th>Serial</th><th>BTU</th>
                <th>Ubicación</th><th>Instalación</th><th>Estado</th>
                {!cliente.archivado_en && <th></th>}
              </tr>
            </thead>
            <tbody>
              {equipos.map((e) => (
                <tr key={e.id}>
                  <td>{e.tipo}</td>
                  <td>{[e.marca, e.modelo].filter(Boolean).join(' ') || '—'}</td>
                  <td>{e.serial || '—'}</td>
                  <td>{e.capacidad_btu || '—'}</td>
                  <td>{e.ubicacion || '—'}</td>
                  <td>{e.fecha_instalacion || '—'}</td>
                  <td><span className="etiqueta">{ESTADO_EQUIPO[e.estado]}</span></td>
                  {!cliente.archivado_en && <td className="acciones">
                    <button className="secundario" onClick={() => { setFormAbierto(false); setEquipoEditando(e); }}>Editar</button>
                    <button className="peligro" onClick={() => eliminarEquipo(e)}>Eliminar</button>
                  </td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
