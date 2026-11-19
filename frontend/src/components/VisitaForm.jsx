import { useEffect, useState } from 'react';
import api, { mensajeDeError } from '../api';
import { hora } from '../constantes';

// Programa una visita nueva (solicitudId) o reprograma una existente (visita)
export default function VisitaForm({ solicitudId, visita, onGuardado, onCancelar }) {
  const hoy = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en tu zona horaria
  const [tecnicos, setTecnicos] = useState([]);
  const [form, setForm] = useState({
    tecnico_id: visita ? String(visita.tecnico_id) : '',
    fecha_programada: visita ? visita.fecha_programada : '',
    hora_inicio: visita ? hora(visita.hora_inicio) : '09:00',
    hora_fin: visita ? hora(visita.hora_fin) : '11:00',
  });
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api
      .get('/tecnicos', { params: { activo: 1 } })
      .then((r) => setTecnicos(r.data.tecnicos))
      .catch((err) => setError(mensajeDeError(err)));
  }, []);

  const cambiar = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const datos = { ...form, tecnico_id: Number(form.tecnico_id) };
      if (visita) await api.put(`/agenda/${visita.id}/reprogramar`, datos);
      else await api.post('/agenda', { ...datos, solicitud_id: Number(solicitudId) });
      onGuardado();
    } catch (err) {
      setError(mensajeDeError(err)); // aquí aparece el aviso si el técnico ya tiene una visita en ese horario
      setEnviando(false);
    }
  };

  return (
    <form className="bloque" onSubmit={enviar}>
      <h3>{visita ? 'Reprogramar visita' : 'Programar visita'}</h3>

      {tecnicos.length === 0 && !error && (
        <p>No hay técnicos activos. Crea uno desde "Usuarios del sistema".</p>
      )}

      <div className="dos-columnas">
        <label>Técnico
          <select name="tecnico_id" value={form.tecnico_id} onChange={cambiar} required>
            <option value="">Selecciona un técnico</option>
            {tecnicos.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre}{t.especialidad ? ` (${t.especialidad})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>Fecha
          <input type="date" name="fecha_programada" min={hoy} value={form.fecha_programada} onChange={cambiar} required />
        </label>
        <label>Hora de inicio
          <input type="time" name="hora_inicio" value={form.hora_inicio} onChange={cambiar} required />
        </label>
        <label>Hora de fin
          <input type="time" name="hora_fin" value={form.hora_fin} onChange={cambiar} required />
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <div className="acciones">
        <button disabled={enviando}>{enviando ? 'Guardando…' : visita ? 'Guardar cambios' : 'Programar visita'}</button>
        {onCancelar && <button type="button" className="secundario" onClick={onCancelar}>Cancelar</button>}
      </div>
    </form>
  );
}
