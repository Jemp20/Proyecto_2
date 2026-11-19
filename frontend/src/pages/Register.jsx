import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { useAuth } from '../context/AuthContext';
import { mensajeDeError } from '../api';

export default function Register() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', password: '' });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  if (user) return <Navigate to="/panel" replace />;

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await register(form);
      navigate('/panel');
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AuthLayout
      titulo="Crear cuenta de cliente"
      pie={<>¿Ya tienes cuenta? <Link to="/login">Inicia sesión</Link></>}
    >
      <form onSubmit={enviar}>
        <label>Nombre completo
          <input name="nombre" value={form.nombre} onChange={cambiar} required minLength={3} autoComplete="name" />
        </label>
        <label>Correo
          <input type="email" name="email" value={form.email} onChange={cambiar} required autoComplete="email" />
        </label>
        <label>Teléfono (opcional)
          <input type="tel" name="telefono" value={form.telefono} onChange={cambiar} autoComplete="tel" />
        </label>
        <label>Contraseña
          <input type="password" name="password" value={form.password} onChange={cambiar} required minLength={8} autoComplete="new-password" />
          <small>Mínimo 8 caracteres</small>
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <button disabled={enviando}>{enviando ? 'Creando cuenta…' : 'Crear cuenta'}</button>
      </form>
    </AuthLayout>
  );
}
