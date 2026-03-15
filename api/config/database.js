const mysql = require('mysql2/promise');

let pool = null;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'helpdesk',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4'
    });
  }
  return pool;
}

async function query(sql, params = []) {
  const db = getPool();
  const [rows] = await db.query(sql, params);
  return rows;
}

async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

async function insert(sql, params = []) {
  const db = getPool();
  const [result] = await db.query(sql, params);
  return result;
}

async function testConnection() {
  try {
    const db = getPool();
    await db.query('SELECT 1');
    return true;
  } catch (err) {
    console.error('Database connection failed:', err.message);
    return false;
  }
}

module.exports = { getPool, query, queryOne, insert, testConnection };
