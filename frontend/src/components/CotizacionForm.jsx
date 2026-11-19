import { useState } from 'react';
import api, { mensajeDeError } from '../api';
import { moneda } from '../constantes';

const ITEM_VACIO = { descripcion: '', cantidad: 1, valor_unitario: '' };

// Formulario del administrador para cotizar una solicitud pendiente
export default function CotizacionForm({ solicitudId, onGuardado }) {
  const [items, setItems] = useState([{ ...ITEM_VACIO }]);
  const [iva, setIva] = useState(19);
  const [observaciones, setObservaciones] = useState('');
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cambiarItem = (i, campo, valor) =>
    setItems(items.map((it, idx) => (idx === i ? { ...it, [campo]: valor } : it)));
  const quitarItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  // Vista previa; el servidor vuelve a calcular los totales al guardar
  const subtotal = items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.valor_unitario) || 0), 0);
  const valorIva = (subtotal * (Number(iva) || 0)) / 100;

  const enviar = async (e) => {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      await api.post('/cotizaciones', {
        solicitud_id: Number(solicitudId),
        items: items.map((it) => ({
          descripcion: it.descripcion,
          cantidad: Number(it.cantidad),
          valor_unitario: Number(it.valor_unitario),
        })),
        iva_porcentaje: Number(iva),
        observaciones,
      });
      onGuardado();
    } catch (err) {
      setError(mensajeDeError(err));
      setEnviando(false);
    }
  };

  return (
    <form className="bloque" onSubmit={enviar}>
      <h3>Crear cotización</h3>

      {items.map((it, i) => (
        <div className="items-edicion" key={i}>
          <input placeholder="Descripción del ítem" aria-label="Descripción" value={it.descripcion}
            onChange={(e) => cambiarItem(i, 'descripcion', e.target.value)} required />
          <input type="number" min="0.01" step="any" placeholder="Cant." aria-label="Cantidad" value={it.cantidad}
            onChange={(e) => cambiarItem(i, 'cantidad', e.target.value)} required />
          <input type="number" min="0" step="any" placeholder="Valor unitario" aria-label="Valor unitario" value={it.valor_unitario}
            onChange={(e) => cambiarItem(i, 'valor_unitario', e.target.value)} required />
          <button type="button" className="secundario" onClick={() => quitarItem(i)} disabled={items.length === 1}>Quitar</button>
        </div>
      ))}

      <button type="button" className="secundario" onClick={() => setItems([...items, { ...ITEM_VACIO }])}>
        Agregar ítem
      </button>

      <div className="dos-columnas" style={{ marginTop: '1rem' }}>
        <label>IVA (%)
          <input type="number" min="0" max="100" step="any" value={iva} onChange={(e) => setIva(e.target.value)} required />
        </label>
        <label>Observaciones
          <input value={observaciones} onChange={(e) => setObservaciones(e.target.value)} placeholder="Ej. Válida por 15 días" />
        </label>
      </div>

      <div className="totales">
        <div><span>Subtotal</span><span>{moneda(subtotal)}</span></div>
        <div><span>IVA</span><span>{moneda(valorIva)}</span></div>
        <div className="total"><span>Total</span><span>{moneda(subtotal + valorIva)}</span></div>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      <button disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar cotización al cliente'}</button>
    </form>
  );
}
