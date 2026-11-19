import { useState } from 'react';
import api, { mensajeDeError } from '../api';
import { ESTADO_EQUIPO } from '../constantes';

const VACIO = {
  tipo: '', marca: '', modelo: '', serial: '', capacidad_btu: '',
  ubicacion: '', fecha_instalacion: '', estado: 'activo',
};

// Sirve para registrar un equipo nuevo o editar uno existente
export default function EquipoForm({ clienteId, equipo, onGuardado, onCancelar }) {
  const [form, setForm] = useState(
    equipo ? Object.fromEntries(Object.keys(VACIO).map((k) => [k, equipo[k] ?? ''])) : VACIO
  );
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const datos = { ...form, cliente_id: clienteId };
      if (equipo) await api.put(`/equipos/${equipo.id}`, datos);
      else await api.post('/equipos', datos);
      onGuardado();
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  };

  return (
    <form className="tarjeta ancha" onSubmit={enviar}>
      <h2>{equipo ? 'Editar equipo' : 'Registrar equipo'}</h2>
      <div className="dos-columnas">
        <label>Tipo
          <input name="tipo" list="tipos-equipo" value={form.tipo} onChange={cambiar} required />
          <datalist id="tipos-equipo">
            <option value="Mini split" /><option value="Cassette" /><option value="Piso techo" />
            <option value="Ventana" /><option value="Chiller" /><option value="Cuarto frío" />
          </datalist>
        </label>
        <label>Marca
          <input name="marca" value={form.marca} onChange={cambiar} />
        </label>
        <label>Modelo
          <input name="modelo" value={form.modelo} onChange={cambiar} />
        </label>
        <label>Serial
          <input name="serial" value={form.serial} onChange={cambiar} />
        </label>
        <label>Capacidad (BTU)
          <input type="number" min="1" name="capacidad_btu" value={form.capacidad_btu} onChange={cambiar} />
        </label>
        <label>Ubicación
          <input name="ubicacion" value={form.ubicacion} onChange={cambiar} placeholder="Ej. Recepción, piso 2" />
        </label>
        <label>Fecha de instalación
          <input type="date" name="fecha_instalacion" value={form.fecha_instalacion} onChange={cambiar} />
        </label>
        <label>Estado
          <select name="estado" value={form.estado} onChange={cambiar}>
            {Object.entries(ESTADO_EQUIPO).map(([valor, texto]) => (
              <option key={valor} value={valor}>{texto}</option>
            ))}
          </select>
        </label>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button disabled={enviando}>{enviando ? 'Guardando…' : 'Guardar equipo'}</button>
        <button type="button" className="secundario" onClick={onCancelar}>Cancelar</button>
      </div>
    </form>
  );
}
