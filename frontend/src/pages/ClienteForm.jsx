import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import api, { mensajeDeError } from '../api';

const VACIO = { nombre: '', documento: '', telefono: '', email: '', direccion: '', ciudad: '' };

// Con :id edita; sin :id crea
export default function ClienteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(VACIO);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/clientes/${id}`)
      .then((r) => {
        const c = r.data.cliente;
        setForm(Object.fromEntries(Object.keys(VACIO).map((k) => [k, c[k] ?? ''])));
      })
      .catch((err) => setError(mensajeDeError(err)));
  }, [id]);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      if (id) {
        await api.put(`/clientes/${id}`, form);
        navigate(`/clientes/${id}`);
      } else {
        const { data } = await api.post('/clientes', form);
        navigate(`/clientes/${data.id}`);
      }
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  };

  return (
    <Layout>
      <h1>{id ? 'Editar cliente' : 'Nuevo cliente'}</h1>
      <form className="tarjeta" onSubmit={enviar}>
        <label>Nombre o razón social
          <input name="nombre" value={form.nombre} onChange={cambiar} required minLength={3} />
        </label>
        <label>Documento (cédula o NIT)
          <input name="documento" value={form.documento} onChange={cambiar} />
        </label>
        <label>Teléfono
          <input type="tel" name="telefono" value={form.telefono} onChange={cambiar} />
        </label>
        <label>Correo
          <input type="email" name="email" value={form.email} onChange={cambiar} autoComplete="off" />
        </label>
        <label>Dirección
          <input name="direccion" value={form.direccion} onChange={cambiar} />
        </label>
        <label>Ciudad
          <input name="ciudad" value={form.ciudad} onChange={cambiar} />
        </label>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="acciones">
          <button disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar cliente'}</button>
          <Link to={id ? `/clientes/${id}` : '/clientes'} className="boton secundario">Cancelar</Link>
        </div>
      </form>
    </Layout>
  );
}
