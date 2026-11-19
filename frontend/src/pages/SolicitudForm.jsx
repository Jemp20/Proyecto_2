import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api, { mensajeDeError } from '../api';
import { TIPO_SERVICIO } from '../constantes';

export default function SolicitudForm() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const esAdmin = user.rol === 'administrador';
  const [form, setForm] = useState({ cliente_id: '', equipo_id: '', tipo_servicio: 'mantenimiento_correctivo', descripcion: '' });
  const [clientes, setClientes] = useState([]);
  const [equipos, setEquipos] = useState([]);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // El administrador elige primero el cliente
  useEffect(() => {
    if (!esAdmin) return;
    api.get('/clientes').then((r) => setClientes(r.data.clientes)).catch((err) => setError(mensajeDeError(err)));
  }, [esAdmin]);

  // Equipos disponibles: los del cliente elegido (admin) o los propios (cliente)
  useEffect(() => {
    if (esAdmin && !form.cliente_id) return;
    api
      .get('/equipos', { params: esAdmin ? { cliente_id: form.cliente_id } : {} })
      .then((r) => setEquipos(r.data.equipos))
      .catch((err) => setError(mensajeDeError(err)));
  }, [esAdmin, form.cliente_id]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });
  const cambiarCliente = (e) => {
    setEquipos([]);
    setForm({ ...form, cliente_id: e.target.value, equipo_id: '' });
  };

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const { data } = await api.post('/solicitudes', {
        tipo_servicio: form.tipo_servicio,
        descripcion: form.descripcion,
        equipo_id: form.equipo_id || undefined,
        ...(esAdmin && { cliente_id: form.cliente_id }),
      });
      navigate(`/solicitudes/${data.id}`);
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  };

  return (
    <Layout>
      <p><Link to="/solicitudes">← Solicitudes</Link></p>
      <h1>Nueva solicitud de servicio</h1>

      <form className="tarjeta" onSubmit={enviar}>
        {esAdmin && (
          <label>Cliente
            <select name="cliente_id" value={form.cliente_id} onChange={cambiarCliente} required>
              <option value="">Selecciona un cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </label>
        )}

        <label>Tipo de servicio
          <select name="tipo_servicio" value={form.tipo_servicio} onChange={cambiar}>
            {Object.entries(TIPO_SERVICIO).map(([valor, texto]) => <option key={valor} value={valor}>{texto}</option>)}
          </select>
        </label>

        <label>Equipo (opcional)
          <select name="equipo_id" value={form.equipo_id} onChange={cambiar} disabled={esAdmin && !form.cliente_id}>
            <option value="">Sin equipo registrado / equipo nuevo</option>
            {equipos.map((eq) => (
              <option key={eq.id} value={eq.id}>
                {[eq.tipo, eq.marca, eq.ubicacion].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
        </label>

        <label>Describe el servicio o el problema
          <textarea name="descripcion" rows={4} value={form.descripcion} onChange={cambiar} required minLength={10}
            placeholder="Ej. El equipo gotea agua y no enfría como antes" />
        </label>

        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar solicitud'}</button>
          <Link to="/solicitudes" className="boton secundario">Cancelar</Link>
        </div>
      </form>
    </Layout>
  );
}
