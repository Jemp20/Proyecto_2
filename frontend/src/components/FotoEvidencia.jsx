import { useEffect, useState } from 'react';
import api from '../api';

// Las fotos exigen sesión: se descargan con el token y se muestran desde la memoria del navegador
export default function FotoEvidencia({ ordenId, evidencia, onEliminar }) {
  const [url, setUrl] = useState('');
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let activo = true;
    let direccion = '';
    api
      .get(`/ordenes/${ordenId}/evidencias/${evidencia.id}/archivo`, { responseType: 'blob' })
      .then((r) => {
        if (!activo) return;
        direccion = URL.createObjectURL(r.data);
        setUrl(direccion);
      })
      .catch(() => {
        if (activo) setFallo(true);
      });
    return () => {
      activo = false;
      if (direccion) URL.revokeObjectURL(direccion);
    };
  }, [ordenId, evidencia.id]);

  return (
    <figure className="foto">
      {url ? (
        <a href={url} target="_blank" rel="noreferrer">
          <img src={url} alt={evidencia.descripcion || 'Evidencia del servicio'} />
        </a>
      ) : (
        <div className="foto-espera">{fallo ? 'No se pudo cargar' : 'Cargando…'}</div>
      )}
      {evidencia.descripcion && <figcaption>{evidencia.descripcion}</figcaption>}
      {onEliminar && (
        <button type="button" className="peligro" onClick={() => onEliminar(evidencia)}>Eliminar</button>
      )}
    </figure>
  );
}
