// ============================================================
//  API USAL · Node.js + Express + MySQL
//  TFG · Ingeniería Informática
//
//  INSTALACIÓN:
//    npm install express mysql2 bcrypt jsonwebtoken cors dotenv
//
//  ARRANQUE:
//    node server.js
//    (o con nodemon: npx nodemon server.js)
// ============================================================

require("dotenv").config();
const express    = require("express");
const mysql      = require("mysql2/promise");
const bcrypt     = require("bcrypt");
const jwt        = require("jsonwebtoken");
const cors       = require("cors");

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "clave_secreta_tfg_usal_2024";

app.use(cors());
app.use(express.json());

// ── Pool de conexiones MySQL ──────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || "localhost",
  user:     process.env.DB_USER     || "root",
  password: process.env.DB_PASS     || "",
  database: process.env.DB_NAME     || "usal_juego",
  waitForConnections: true,
  connectionLimit: 10
});

// ── Middleware: verificar JWT ─────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers["authorization"];
  if (!header) return res.status(401).json({ error: "Token requerido" });

  const token = header.split(" ")[1];
  try {
    req.alumno = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

// ============================================================
//  RUTAS
// ============================================================

// ── POST /api/login ───────────────────────────────────────
// Body: { usuario, password }
// Devuelve: { token, nombre, apellidos, curso }
app.post("/api/login", async (req, res) => {
  const { usuario, password } = req.body;

  if (!usuario || !password)
    return res.status(400).json({ error: "Faltan credenciales" });

  try {
    const [rows] = await pool.query(
      "SELECT * FROM alumnos WHERE usuario = ?", [usuario]
    );

    if (rows.length === 0)
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

    const alumno = rows[0];

    // Para pruebas rápidas sin bcrypt real puedes comparar en plano:
    // const match = password === alumno.password;
    const match = await bcrypt.compare(password, alumno.password);

    if (!match)
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

    const token = jwt.sign(
      { id: alumno.id, usuario: alumno.usuario },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      ok: true,
      token,
      nombre:    alumno.nombre,
      apellidos: alumno.apellidos,
      curso:     alumno.curso
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ── GET /api/notas ────────────────────────────────────────
// Devuelve todas las notas del alumno autenticado
// Headers: Authorization: Bearer <token>
app.get("/api/notas", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        a.codigo,
        a.nombre        AS asignatura,
        a.curso,
        a.cuatrimestre,
        a.creditos,
        n.convocatoria,
        n.nota,
        n.calificacion
      FROM notas n
      JOIN asignaturas a ON a.id = n.asignatura_id
      WHERE n.alumno_id = ?
      ORDER BY a.curso, a.cuatrimestre, a.nombre, n.convocatoria
    `, [req.alumno.id]);

    res.json({ ok: true, notas: rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ── GET /api/convocatorias ────────────────────────────────
// Devuelve los próximos exámenes del alumno autenticado
// (solo asignaturas en las que el alumno tiene nota registrada o aún no aprobó)
app.get("/api/convocatorias", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        a.codigo,
        a.nombre        AS asignatura,
        a.creditos,
        c.tipo,
        c.fecha,
        c.hora_inicio,
        c.hora_fin,
        c.aula,
        c.sede
      FROM convocatorias c
      JOIN asignaturas a ON a.id = c.asignatura_id
      WHERE c.fecha >= CURDATE()
      ORDER BY c.fecha, c.hora_inicio
    `);

    res.json({ ok: true, convocatorias: rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ── GET /api/expediente ───────────────────────────────────
// Resumen completo: datos del alumno + notas + convocatorias
app.get("/api/expediente", authMiddleware, async (req, res) => {
  try {
    // Datos del alumno
    const [[alumno]] = await pool.query(
      "SELECT nombre, apellidos, usuario, curso FROM alumnos WHERE id = ?",
      [req.alumno.id]
    );

    // Notas
    const [notas] = await pool.query(`
      SELECT
        a.codigo, a.nombre AS asignatura, a.curso, a.cuatrimestre, a.creditos,
        n.convocatoria, n.nota, n.calificacion
      FROM notas n
      JOIN asignaturas a ON a.id = n.asignatura_id
      WHERE n.alumno_id = ?
      ORDER BY a.curso, a.cuatrimestre, a.nombre
    `, [req.alumno.id]);

    // Convocatorias próximas
    const [convocatorias] = await pool.query(`
      SELECT
        a.codigo, a.nombre AS asignatura,
        c.tipo, c.fecha, c.hora_inicio, c.hora_fin, c.aula, c.sede
      FROM convocatorias c
      JOIN asignaturas a ON a.id = c.asignatura_id
      WHERE c.fecha >= CURDATE()
      ORDER BY c.fecha
    `);

    res.json({ ok: true, alumno, notas, convocatorias });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ── Arranque ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅  API USAL corriendo en http://localhost:${PORT}`);
});
