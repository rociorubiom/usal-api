// ============================================================
//  API USAL · Node.js + Express + MySQL
//  TFG · Ingeniería Informática
//  Configurado para Railway
//
//  INSTALACIÓN LOCAL:
//    npm install express mysql2 jsonwebtoken cors dotenv
//    node server.js
// ============================================================

require("dotenv").config();
const express = require("express");
const mysql   = require("mysql2/promise");
const jwt     = require("jsonwebtoken");
const cors    = require("cors");

const app        = express();
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "tfg_usal_xK9mP2qL_2024";

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
// ── Pool de conexiones MySQL ──────────────────────────────
const pool = mysql.createPool({
  host:     process.env.DB_HOST || "mysql.railway.internal",
  port:     process.env.DB_PORT || 3306,
  user:     process.env.DB_USER || "root",
  password: process.env.DB_PASS || "WUIEVyajDrxQHIfyMJCeHYYPSVdmPaGp",
  database: process.env.DB_NAME || "railway",
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

// ── GET /  →  health check ────────────────────────────────
app.get("/", (req, res) => {
  res.json({ ok: true, mensaje: "API USAL funcionando correctamente" });
});

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

    // Comparación en texto plano (para el TFG)
    if (password !== alumno.password)
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });

    const token = jwt.sign(
      { id: alumno.id, usuario: alumno.usuario },
      JWT_SECRET,
      { expiresIn: "2h" }
    );

    res.json({
      ok:        true,
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
app.get("/api/convocatorias", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        a.codigo,
        a.nombre      AS asignatura,
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
// Devuelve todo: alumno + notas + convocatorias en una sola llamada
app.get("/api/expediente", authMiddleware, async (req, res) => {
  try {
    const [[alumno]] = await pool.query(
      "SELECT nombre, apellidos, usuario, curso FROM alumnos WHERE id = ?",
      [req.alumno.id]
    );

    const [notas] = await pool.query(`
      SELECT
        a.codigo, a.nombre AS asignatura, a.curso, a.cuatrimestre, a.creditos,
        n.convocatoria, n.nota, n.calificacion
      FROM notas n
      JOIN asignaturas a ON a.id = n.asignatura_id
      WHERE n.alumno_id = ?
      ORDER BY a.curso, a.cuatrimestre, a.nombre
    `, [req.alumno.id]);

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
  console.log(`API USAL corriendo en http://localhost:${PORT}`);
});
