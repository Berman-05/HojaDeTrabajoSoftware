const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT, 10) || 20835,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: {
        rejectUnauthorized: false
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

(async () => {
    try {
        const connection = await pool.getConnection();
        console.log('Conexión exitosa a la base de datos');
        connection.release();
    } catch (err) {
        console.error('Error al conectar a la base de datos:', err.message);
    }
})();

app.post('/api/register', async (req, res) => {
    const { email, names, last_names, age } = req.body;

    if (!email || !names || !last_names || !age) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const verificationToken = crypto.randomUUID();

    try {
        const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(409).json({ error: 'El correo electrónico ya existe en la base de datos.' });
        }

        const sql = `
            INSERT INTO users (email, names, last_names, age, status, verification_token)
            VALUES (?, ?, ?, ?, 'pendiente', ?)
        `;
        await pool.execute(sql, [email, names, last_names, parseInt(age, 10), verificationToken]);

        return res.status(201).json({
            message: 'Usuario registrado correctamente.',
            verificationToken: verificationToken
        });
    } catch (err) {
        console.error('Error en /api/register:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'El correo electrónico ya existe en la base de datos.' });
        }
        return res.status(500).json({ error: 'Error interno en el servidor al registrar usuario.' });
    }
});

app.get('/api/verify', async (req, res) => {
    const { email, token } = req.query;

    if (!email && !token) {
        return res.status(400).json({ error: 'Parámetro email o token es requerido.' });
    }

    try {
        let sql, params;
        if (token) {
            sql = 'UPDATE users SET status = ? WHERE verification_token = ?';
            params = ['verificado', token];
        } else {
            sql = 'UPDATE users SET status = ? WHERE email = ?';
            params = ['verificado', email];
        }

        const [result] = await pool.execute(sql, params);

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'No se encontró un usuario pendiente con esos datos.' });
        }

        return res.json({ message: 'Cuenta verificada exitosamente.' });
    } catch (err) {
        console.error('Error en /api/verify:', err);
        return res.status(500).json({ error: 'Error interno al verificar la cuenta.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
});
