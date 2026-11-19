const pool = require('../config/db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const vacioANull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const idValido = (valor) => Number.isInteger(Number(valor)) && Number(valor) > 0;

function validar({ nombre, email }) {
  if (!nombre || nombre.trim().length < 3) return 'El nombre debe tener al menos 3 caracteres';
  if (email && !EMAIL_RE.test(email)) return 'El correo no es válido';
  return null;
}

function datosDelBody(b) {
  return [
    b.nombre.trim(), vacioANull(b.documento), vacioANull(b.telefono),
    vacioANull(b.email), vacioANull(b.direccion), vacioANull(b.ciudad),
  ];
}

// GET /api/clientes?q=texto
exports.listar = async (req, res) => {
  const q = `%${(req.query.q || '').trim()}%`;
  const filtroArchivo = req.query.archivados === 'true'
    ? 'c.archivado_en IS NOT NULL'
    : 'c.archivado_en IS NULL';
  try {
    const [clientes] = await pool.query(
      `SELECT c.id, c.nombre, c.documento, c.telefono, c.email, c.ciudad,
              c.archivado_en,
              (SELECT COUNT(*) FROM equipos e WHERE e.cliente_id = c.id) AS total_equipos
       FROM clientes c
       WHERE ${filtroArchivo} AND (c.nombre LIKE ? OR c.documento LIKE ? OR c.email LIKE ?)
       ORDER BY c.nombre
       LIMIT 200`,
      [q, q, q]
    );
    res.json({ clientes });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al listar los clientes' });
  }
};

// GET /api/clientes/:id  (incluye sus equipos)
exports.obtener = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  try {
    const [filas] = await pool.query('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    if (!filas[0]) return res.status(404).json({ mensaje: 'Cliente no encontrado' });

    const [equipos] = await pool.query(
      'SELECT * FROM equipos WHERE cliente_id = ? ORDER BY created_at DESC',
      [req.params.id]
    );
    res.json({ cliente: filas[0], equipos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar el cliente' });
  }
};

// POST /api/clientes
exports.crear = async (req, res) => {
  const error = validar(req.body);
  if (error) return res.status(400).json({ mensaje: error });

  try {
    const [r] = await pool.query(
      'INSERT INTO clientes (nombre, documento, telefono, email, direccion, ciudad) VALUES (?, ?, ?, ?, ?, ?)',
      datosDelBody(req.body)
    );
    res.status(201).json({ id: r.insertId, mensaje: 'Cliente creado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe un cliente con ese documento' });
    }
    console.error(err);
    res.status(500).json({ mensaje: 'Error al crear el cliente' });
  }
};

// PUT /api/clientes/:id
exports.actualizar = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const error = validar(req.body);
  if (error) return res.status(400).json({ mensaje: error });

  try {
    const [existe] = await pool.query(
      'SELECT id, archivado_en FROM clientes WHERE id = ?',
      [req.params.id]
    );
    if (!existe[0]) return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    if (existe[0].archivado_en) {
      return res.status(409).json({ mensaje: 'No se puede editar un cliente archivado; restáuralo primero' });
    }

    await pool.query(
      'UPDATE clientes SET nombre = ?, documento = ?, telefono = ?, email = ?, direccion = ?, ciudad = ? WHERE id = ?',
      [...datosDelBody(req.body), req.params.id]
    );
    res.json({ mensaje: 'Cliente actualizado' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ mensaje: 'Ya existe un cliente con ese documento' });
    }
    console.error(err);
    res.status(500).json({ mensaje: 'Error al actualizar el cliente' });
  }
};

// DELETE /api/clientes/:id — archiva el perfil para conservar su trazabilidad.
exports.eliminar = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  let conexion;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    const [filas] = await conexion.query(
      `SELECT c.id, c.usuario_id, c.archivado_en, c.usuario_activo_previo, u.activo AS usuario_activo
       FROM clientes c
       LEFT JOIN usuarios u ON u.id = c.usuario_id
       WHERE c.id = ? FOR UPDATE`,
      [req.params.id]
    );
    if (!filas[0]) {
      await conexion.rollback();
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }

    if (!filas[0].archivado_en) {
      await conexion.query(
        `UPDATE clientes
         SET archivado_en = NOW(), usuario_activo_previo = ?
         WHERE id = ?`,
        [filas[0].usuario_id ? Number(filas[0].usuario_activo) : null, req.params.id]
      );
      if (filas[0].usuario_id) {
        await conexion.query('UPDATE usuarios SET activo = 0 WHERE id = ?', [filas[0].usuario_id]);
      }
    }
    await conexion.commit();
    return res.json({ archivado: true, mensaje: 'Cliente archivado; se conservó su historial' });
  } catch (err) {
    if (conexion) await conexion.rollback();
    console.error(err);
    return res.status(500).json({ mensaje: 'Error al archivar el cliente' });
  } finally {
    conexion?.release();
  }
};

exports.restaurar = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  let conexion;
  try {
    conexion = await pool.getConnection();
    await conexion.beginTransaction();
    const [filas] = await conexion.query(
      `SELECT id, usuario_id, archivado_en, usuario_activo_previo
       FROM clientes WHERE id = ? FOR UPDATE`,
      [req.params.id]
    );
    if (!filas[0]) {
      await conexion.rollback();
      return res.status(404).json({ mensaje: 'Cliente no encontrado' });
    }
    if (filas[0].archivado_en) {
      await conexion.query(
        'UPDATE clientes SET archivado_en = NULL, usuario_activo_previo = NULL WHERE id = ?',
        [req.params.id]
      );
      if (filas[0].usuario_id && filas[0].usuario_activo_previo !== null) {
        await conexion.query(
          'UPDATE usuarios SET activo = ? WHERE id = ?',
          [filas[0].usuario_activo_previo, filas[0].usuario_id]
        );
      }
    }
    await conexion.commit();
    return res.json({ archivado: false, mensaje: 'Cliente restaurado' });
  } catch (err) {
    if (conexion) await conexion.rollback();
    console.error(err);
    return res.status(500).json({ mensaje: 'Error al restaurar el cliente' });
  } finally {
    conexion?.release();
  }
};
