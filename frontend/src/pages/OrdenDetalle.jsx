import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import FotoEvidencia from '../components/FotoEvidencia';
import { useAuth } from '../context/AuthContext';
import api, { mensajeDeError } from '../api';
import { ESTADO_ORDEN, TIPO_SERVICIO, fechaHora } from '../constantes';

const VACIO = { diagnostico: '', actividades_realizadas: '', observaciones: '' };

export default function OrdenDetalle() {
  const { id } = useParams();
  const { user } = useAuth();
  const [datos, setDatos] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [archivo, setArchivo] = useState(null);
  const [descripcion, setDescripcion] = useState('');
  const [claveArchivo, setClaveArchivo] = useState(0); // para vaciar el selector de archivo
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [ocupado, setOcupado] = useState(false);

  // reiniciar = true vuelve a llenar el formulario con lo guardado; con false se conserva lo que estás escribiendo
  const cargar = useCallback(async (reiniciar) => {
    try {
      const { data } = await api.get(`/ordenes/${id}`);
      setDatos(data);
      if (reiniciar) {
        setForm({
          diagnostico: data.orden.diagnostico || '',
          actividades_realizadas: data.orden.actividades_realizadas || '',
          observaciones: data.orden.observaciones || '',
        });
      }
    } catch (err) {
      setError(mensajeDeError(err));
    }
  }, [id]);

  useEffect(() => { cargar(true); }, [cargar]);

  const ejecutar = async (accion, exito) => {
    setOcupado(true);
    setError('');
    setAviso('');
    try {
      await accion();
      if (exito) setAviso(exito);
      return true;
    } catch (err) {
      setError(mensajeDeError(err));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const guardar = async (e) => {
    e.preventDefault();
    if (await ejecutar(() => api.put(`/ordenes/${id}`, form), 'Cambios guardados')) cargar(true);
  };

  const finalizar = async () => {
    if (!window.confirm('¿Finalizar el servicio? Después no podrás modificar la orden.')) return;
    const ok = await ejecutar(async () => {
      await api.put(`/ordenes/${id}`, form); // guarda lo escrito antes de cerrar
      await api.post(`/ordenes/${id}/finalizar`, {});
    }, 'Servicio finalizado');
    if (ok) cargar(true);
  };

  const subirFoto = async (e) => {
    e.preventDefault();
    if (!archivo) return;
    const cuerpo = new FormData();
    cuerpo.append('foto', archivo);
    if (descripcion) cuerpo.append('descripcion', descripcion);
    const ok = await ejecutar(() => api.post(`/ordenes/${id}/evidencias`, cuerpo), 'Foto agregada');
    if (ok) {
      setArchivo(null);
      setDescripcion('');
      setClaveArchivo((n) => n + 1);
      cargar(false);
    }
  };

  const eliminarFoto = async (ev) => {
    if (!window.confirm('¿Eliminar esta foto?')) return;
    if (await ejecutar(() => api.delete(`/ordenes/${id}/evidencias/${ev.id}`))) cargar(false);
  };

  if (!datos) {
    return (
      <Layout>
        {error ? <p className="error" role="alert">{error}</p> : <p className="estado">Cargando…</p>}
        <Link to="/ordenes">Volver a las órdenes</Link>
      </Layout>
    );
  }

  const { orden: o, evidencias } = datos;
  const esCliente = user.rol === 'cliente';
  const editable = !esCliente && o.estado === 'en_proceso';
  const equipo = [o.equipo_tipo, o.equipo_marca, o.equipo_modelo].filter(Boolean).join(' ') || 'Sin equipo registrado';
  const cambiar = (campo) => (e) => setForm({ ...form, [campo]: e.target.value });

  return (
    <Layout ancho>
      <p><Link to="/ordenes">← Órdenes</Link></p>
      <h1>
        Orden {o.codigo} <span className={`etiqueta estado-${o.estado}`}>{ESTADO_ORDEN[o.estado]}</span>
      </h1>

      <dl className="ficha">
        {!esCliente && (
          <>
            <dt>Cliente</dt><dd>{o.cliente_nombre}{o.cliente_telefono ? `, ${o.cliente_telefono}` : ''}</dd>
            <dt>Dirección</dt><dd>{[o.cliente_direccion, o.cliente_ciudad].filter(Boolean).join(', ') || '—'}</dd>
          </>
        )}
        <dt>Técnico</dt><dd>{o.tecnico_nombre}</dd>
        <dt>Servicio</dt><dd>{TIPO_SERVICIO[o.tipo_servicio]}</dd>
        <dt>Equipo</dt>
        <dd>
          {equipo}
          {o.equipo_id && <> <Link to={`/equipos/${o.equipo_id}/historial`}>Ver historial</Link></>}
        </dd>
        <dt>Solicitud</dt><dd>{o.solicitud_descripcion}</dd>
        <dt>Inicio</dt><dd>{fechaHora(o.fecha_inicio)}</dd>
        {o.fecha_fin && (<><dt>Fin</dt><dd>{fechaHora(o.fecha_fin)}</dd></>)}
      </dl>

      {error && <p className="error" role="alert">{error}</p>}
      {aviso && <p className="exito" role="status">{aviso}</p>}

      {editable && (
        <form className="bloque" onSubmit={guardar}>
          <h3>Registro del trabajo</h3>
          <label>Diagnóstico
            <textarea rows={3} value={form.diagnostico} onChange={cambiar('diagnostico')} placeholder="¿Qué falla o condición encontraste?" />
          </label>
          <label>Actividades realizadas
            <textarea rows={4} value={form.actividades_realizadas} onChange={cambiar('actividades_realizadas')} placeholder="Qué hiciste, repuestos usados, etc." />
          </label>
          <label>Observaciones y recomendaciones
            <textarea rows={3} value={form.observaciones} onChange={cambiar('observaciones')} />
          </label>
          <div className="acciones">
            <button disabled={ocupado}>Guardar cambios</button>
            <button type="button" disabled={ocupado} onClick={finalizar}>Finalizar servicio</button>
          </div>
          <small>Para finalizar, el diagnóstico y las actividades deben tener al menos 10 caracteres.</small>
        </form>
      )}

      {!editable && (o.diagnostico || o.actividades_realizadas || o.observaciones) && (
        <div className="bloque">
          <h3>Informe del servicio</h3>
          {o.diagnostico && <p className="texto-largo"><strong>Diagnóstico:</strong> {o.diagnostico}</p>}
          {o.actividades_realizadas && <p className="texto-largo"><strong>Actividades realizadas:</strong> {o.actividades_realizadas}</p>}
          {o.observaciones && <p className="texto-largo"><strong>Observaciones:</strong> {o.observaciones}</p>}
        </div>
      )}

      {esCliente && o.estado === 'en_proceso' && (
        <p>Tu servicio está en proceso. Cuando el técnico lo finalice verás aquí el informe y las fotos.</p>
      )}

      {(!esCliente || o.estado === 'finalizada') && (
        <>
          <h2>Evidencias fotográficas ({evidencias.length})</h2>
          {evidencias.length === 0 && <p>Todavía no hay fotos.</p>}
          <div className="galeria">
            {evidencias.map((ev) => (
              <FotoEvidencia key={ev.id} ordenId={o.id} evidencia={ev} onEliminar={editable ? eliminarFoto : undefined} />
            ))}
          </div>
        </>
      )}

      {editable && (
        <form className="bloque" onSubmit={subirFoto}>
          <h3>Agregar una foto</h3>
          <label>Imagen (JPG, PNG o WEBP, hasta 5 MB)
            <input key={claveArchivo} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setArchivo(e.target.files[0] || null)} required />
          </label>
          <label>Descripción (opcional)
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} placeholder="Ej. Capacitor nuevo instalado" />
          </label>
          <button disabled={ocupado || !archivo}>{ocupado ? 'Subiendo…' : 'Subir foto'}</button>
        </form>
      )}
    </Layout>
  );
}
