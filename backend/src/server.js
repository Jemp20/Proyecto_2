require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./config/db');

if (!process.env.JWT_SECRET) {
  console.error('Falta JWT_SECRET en el archivo .env');
  process.exit(1);
}

const app = express();

console.log('Ejecutando:', __filename);

const originsPermitidos = new Set([
  process.env.CLIENT_URL || 'http://localhost:5173',
  ...(process.env.CLIENT_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
]);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || originsPermitidos.has(origin)) return callback(null, true);
    return callback(new Error('Origen no permitido por la configuración CORS'));
  },
}));
app.use(express.json());


// Verifica que el API y la base de datos respondan
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, db: 'conectada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, db: 'sin conexión' });
  }
});

// Las rutas de cada módulo se irán montando aquí, sprint a sprint:
app.use('/api/auth', require('./routes/auth.routes'));         // Sprint 1
app.use('/api/clientes', require('./routes/clientes.routes'));   // Sprint 2
app.use('/api/equipos', require('./routes/equipos.routes'));     // Sprint 2
app.use('/api/solicitudes', require('./routes/solicitudes.routes')); // Sprint 3
app.use('/api/cotizaciones', require('./routes/cotizaciones.routes')); // Sprint 3
app.use('/api/tecnicos', require('./routes/tecnicos.routes'));       // Sprint 4
app.use('/api/agenda', require('./routes/agenda.routes'));           // Sprint 4
app.use('/api/ordenes', require('./routes/ordenes.routes'));         // Sprint 5
app.use('/api/reportes', require('./routes/reportes.routes'));       // Reportes
app.use('/api/asistente', require('./routes/asistente.routes'));     // Asistente de consultas

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`API escuchando en http://localhost:${PORT}`);
  require('./services/asistente-telegram.service').iniciar();
});
