// Guarda cada cambio de estado de una solicitud: es la trazabilidad del servicio
exports.registrarCambio = (conn, { solicitudId, ordenId, anterior, nuevo, usuarioId, comentario }) =>
  conn.query(
    `INSERT INTO seguimiento (solicitud_id, orden_id, estado_anterior, estado_nuevo, usuario_id, comentario)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [solicitudId, ordenId || null, anterior || null, nuevo, usuarioId || null, comentario || null]
  );
