import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import api, { mensajeDeError } from '../api';

export default function RestablecerContrasena() {
  const [parametros] = useSearchParams();
  const token = parametros.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const enviar = async (evento) => {
    evento.preventDefault();
    setMensaje('');
    setError('');
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setEnviando(true);
    try {
      const { data } = await api.post('/auth/reset-password', { token, password });
      setMensaje(data.mensaje);
    } catch (err) {
      setError(mensajeDeError(err));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <AuthLayout
      titulo="Crear nueva contraseña"
      descripcion="Elige una contraseña segura de al menos 8 caracteres."
      pie={mensaje
        ? <>¿Listo? <Link to="/login">Iniciar sesión</Link></>
        : <>¿Necesitas otro enlace? <Link to="/recuperar-contrasena">Solicitar recuperación</Link></>}
    >
      <form onSubmit={enviar}>
        <label>Nueva contraseña
          <input
            type="password"
            name="password"
            value={password}
            onChange={(evento) => setPassword(evento.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        <label>Confirma la nueva contraseña
          <input
            type="password"
            name="confirmacion"
            value={confirmacion}
            onChange={(evento) => setConfirmacion(evento.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>
        {mensaje && <p className="auth-mensaje-exito" role="status">{mensaje} <Link to="/login">Iniciar sesión</Link></p>}
        {error && <p className="error" role="alert">{error}</p>}
        {!mensaje && <button disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar nueva contraseña'}</button>}
      </form>
    </AuthLayout>
  );
}
