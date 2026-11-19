const mysql = require('mysql2/promise');

const configurada = Boolean(process.env.DB_READONLY_USER && process.env.DB_READONLY_PASSWORD);

const pool = configurada
  ? mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_READONLY_USER,
      password: process.env.DB_READONLY_PASSWORD,
      database: process.env.DB_NAME || 'climatizacion',
      waitForConnections: true,
      connectionLimit: 2,
      charset: 'utf8mb4',
      dateStrings: true,
    })
  : null;

module.exports = { pool, configurada };
