const pool = require('../config/db');

const ESTADOS = ['activo', 'en_mantenimiento', 'fuera_de_servicio'];
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;

const vacioANull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const idValido = (valor) => Number.isInteger(Number(valor)) && Number(valor) > 0;

function validar(b) {
  if (!idValido(b.cliente_id)) return 'Debes indicar el cliente del equipo';
  if (!b.tipo || !String(b.tipo).trim()) return 'El tipo de equipo es obligatorio';
  if (b.capacidad_btu !== undefined && b.capacidad_btu !== null && b.capacidad_btu !== '') {
    if (!idValido(b.capacidad_btu)) return 'La capacidad en BTU debe ser un número positivo';
  }
  if (b.fecha_instalacion && !FECHA_RE.test(b.fecha_instalacion)) {
    return 'La fecha de instalación debe tener el formato AAAA-MM-DD';
  }
  if (b.estado && !ESTADOS.includes(b.estado)) {
    return `El estado debe ser uno de: ${ESTADOS.join(', ')}`;
  }
  return null;
}

function datosDelBody(b) {
  return [
    Number(b.cliente_id), String(b.tipo).trim(), vacioANull(b.marca), vacioANull(b.modelo),
    vacioANull(b.serial), vacioANull(b.capacidad_btu), vacioANull(b.ubicacion),
    vacioANull(b.fecha_instalacion), b.estado || 'activo',
  ];
}

// Un cliente solo ve sus propios equipos; el administrador ve todos
function filtroPorRol(req) {
  return req.user.rol === 'cliente'
    ? { sql: ' AND c.usuario_id = ?', params: [req.user.id] }
    : { sql: '', params: [] };
}

// GET /api/equipos?cliente_id=
exports.listar = async (req, res) => {
  const { sql, params } = filtroPorRol(req);
  let filtroCliente = '';
  if (req.user.rol !== 'cliente' && req.query.cliente_id) {
    if (!idValido(req.query.cliente_id)) return res.status(400).json({ mensaje: 'Cliente no válido' });
    filtroCliente = ' AND e.cliente_id = ?';
    params.push(Number(req.query.cliente_id));
  }

  try {
    const [equipos] = await pool.query(
      `SELECT e.*, c.nombre AS cliente_nombre
       FROM equipos e JOIN clientes c ON c.id = e.cliente_id
       WHERE 1 = 1${sql}${filtroCliente}
       ORDER BY e.created_at DESC
       LIMIT 500`,
      params
    );
    res.json({ equipos });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al listar los equipos' });
  }
};

// GET /api/equipos/:id
exports.obtener = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const { sql, params } = filtroPorRol(req);

  try {
    const [filas] = await pool.query(
      `SELECT e.*, c.nombre AS cliente_nombre
       FROM equipos e JOIN clientes c ON c.id = e.cliente_id
       WHERE e.id = ?${sql}`,
      [req.params.id, ...params]
    );
    if (!filas[0]) return res.status(404).json({ mensaje: 'Equipo no encontrado' });
    res.json({ equipo: filas[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al consultar el equipo' });
  }
};

// POST /api/equipos
exports.crear = async (req, res) => {
  const error = validar(req.body);
  if (error) return res.status(400).json({ mensaje: error });

  try {
    const [clientes] = await pool.query(
      'SELECT id FROM clientes WHERE id = ? AND archivado_en IS NULL',
      [req.body.cliente_id]
    );
    if (!clientes[0]) return res.status(400).json({ mensaje: 'El cliente indicado no existe o está archivado' });
    const [r] = await pool.query(
      `INSERT INTO equipos
       (cliente_id, tipo, marca, modelo, serial, capacidad_btu, ubicacion, fecha_instalacion, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      datosDelBody(req.body)
    );
    res.status(201).json({ id: r.insertId, mensaje: 'Equipo registrado' });
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ mensaje: 'El cliente indicado no existe' });
    }
    console.error(err);
    res.status(500).json({ mensaje: 'Error al registrar el equipo' });
  }
};

// PUT /api/equipos/:id
exports.actualizar = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  const error = validar(req.body);
  if (error) return res.status(400).json({ mensaje: error });

  try {
    const [clientes] = await pool.query(
      'SELECT id FROM clientes WHERE id = ? AND archivado_en IS NULL',
      [req.body.cliente_id]
    );
    if (!clientes[0]) return res.status(400).json({ mensaje: 'El cliente indicado no existe o está archivado' });
    const [existe] = await pool.query('SELECT id FROM equipos WHERE id = ?', [req.params.id]);
    if (!existe[0]) return res.status(404).json({ mensaje: 'Equipo no encontrado' });

    await pool.query(
      `UPDATE equipos SET cliente_id = ?, tipo = ?, marca = ?, modelo = ?, serial = ?,
       capacidad_btu = ?, ubicacion = ?, fecha_instalacion = ?, estado = ? WHERE id = ?`,
      [...datosDelBody(req.body), req.params.id]
    );
    res.json({ mensaje: 'Equipo actualizado' });
  } catch (err) {
    if (err.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ mensaje: 'El cliente indicado no existe' });
    }
    console.error(err);
    res.status(500).json({ mensaje: 'Error al actualizar el equipo' });
  }
};

// DELETE /api/equipos/:id
exports.eliminar = async (req, res) => {
  if (!idValido(req.params.id)) return res.status(400).json({ mensaje: 'Identificador no válido' });
  try {
    const [r] = await pool.query('DELETE FROM equipos WHERE id = ?', [req.params.id]);
    if (r.affectedRows === 0) return res.status(404).json({ mensaje: 'Equipo no encontrado' });
    res.json({ mensaje: 'Equipo eliminado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ mensaje: 'Error al eliminar el equipo' });
  }
};
