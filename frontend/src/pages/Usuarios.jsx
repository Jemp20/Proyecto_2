import { useState } from 'react';
import Layout from '../components/Layout';
import PageHeader from '../components/PageHeader';
import api, { mensajeDeError } from '../api';

const VACIO = { nombre: '', email: '', password: '', rol: 'tecnico', telefono: '', especialidad: '' };

export default function Usuarios() {
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');
  const [exito, setExito] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setExito('');
    setEnviando(true);
    try {
      const { data } = await api.post('/auth/usuarios', form);
      setExito(`Usuario creado: ${data.usuario.nombre} (${data.usuario.rol})`);
      setForm(VACIO);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Layout>
      <PageHeader
        eyebrow="ACCESOS Y CUENTAS"
        title="Usuarios del sistema"
        description="Crea cuentas de técnico o administrador. Los clientes se registran por su cuenta."
        icon="usuarios"
      />

        <form className="tarjeta" onSubmit={enviar}>
          <label>Nombre completo
            <input name="nombre" value={form.nombre} onChange={cambiar} required minLength={3} />
          </label>
          <label>Correo
            <input type="email" name="email" value={form.email} onChange={cambiar} required />
          </label>
          <label>Contraseña inicial
            <input type="password" name="password" value={form.password} onChange={cambiar} required minLength={8} />
          </label>
          <label>Rol
            <select name="rol" value={form.rol} onChange={cambiar}>
              <option value="tecnico">Técnico</option>
              <option value="administrador">Administrador</option>
            </select>
          </label>
          {form.rol === 'tecnico' && (
            <>
              <label>Teléfono
                <input name="telefono" value={form.telefono} onChange={cambiar} />
              </label>
              <label>Especialidad
                <input name="especialidad" value={form.especialidad} onChange={cambiar} placeholder="Ej. instalación de splits" />
              </label>
            </>
          )}
          {error && <p className="error" role="alert">{error}</p>}
          {exito && <p className="exito" role="status">{exito}</p>}
          <button disabled={enviando}>{enviando ? 'Creando…' : 'Crear usuario'}</button>
        </form>
    </Layout>
  );
}
