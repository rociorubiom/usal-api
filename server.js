// ============================================================
//  API USAL · Node.js + Express + MySQL
//  TFG · Ingeniería Informática
//  Configurado para Railway
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

// ── GET /  →  health check ────────────────────────────────
app.get("/", (req, res) => {
  res.json({ ok: true, mensaje: "API USAL funcionando correctamente" });
});

// ── POST /api/login ───────────────────────────────────────
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
    if (password !== alumno.password)
      return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
    const token = jwt.sign(
      { id: alumno.id, usuario: alumno.usuario },
      JWT_SECRET,
      { expiresIn: "2h" }
    );
    res.json({ ok: true, token, nombre: alumno.nombre, apellidos: alumno.apellidos, curso: alumno.curso });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ── GET /api/notas ────────────────────────────────────────
app.get("/api/notas", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.codigo, a.nombre AS asignatura, a.curso, a.cuatrimestre, a.creditos,
             n.convocatoria, n.nota, n.calificacion
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
      SELECT a.codigo, a.nombre AS asignatura, a.creditos,
             c.tipo, c.fecha, c.hora_inicio, c.hora_fin, c.aula, c.sede
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
app.get("/api/expediente", authMiddleware, async (req, res) => {
  try {
    const [[alumno]] = await pool.query(`
      SELECT a.nombre, a.apellidos, a.usuario, a.curso, c.nombre AS carrera
      FROM alumnos a JOIN carreras c ON c.id = a.carrera_id
      WHERE a.id = ?
    `, [req.alumno.id]);
    const [notas] = await pool.query(`
      SELECT as2.codigo, as2.nombre AS asignatura, as2.curso, as2.cuatrimestre, as2.creditos,
             n.convocatoria, n.nota, n.calificacion
      FROM notas n JOIN asignaturas as2 ON as2.id = n.asignatura_id
      WHERE n.alumno_id = ?
      ORDER BY as2.curso, as2.cuatrimestre, as2.nombre
    `, [req.alumno.id]);
    const [convocatorias] = await pool.query(`
      SELECT as2.codigo, as2.nombre AS asignatura,
             c.tipo, c.fecha, c.hora_inicio, c.hora_fin, c.aula, c.sede
      FROM convocatorias c JOIN asignaturas as2 ON as2.id = c.asignatura_id
      WHERE c.fecha >= CURDATE()
      ORDER BY c.fecha
    `);
    res.json({ ok: true, alumno, notas, convocatorias });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});

// ── GET /juego ────────────────────────────────────────────
app.get("/juego", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>idUSAL - Identidad digital</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f2f2f2; min-height: 100vh; display: flex; flex-direction: column; }

    .top-bar { background: #ffffff; border-bottom: 1px solid #ddd; padding: 14px 24px 10px; }
    .top-bar .univ-name { font-family: 'Palatino Linotype', Palatino, serif; font-size: 22px; font-weight: bold; color: #444; letter-spacing: 1px; text-transform: uppercase; }
    .top-bar .subtitle { margin-top: 2px; font-size: 15px; }
    .top-bar .subtitle strong { color: #c0392b; font-weight: bold; }
    .top-bar .subtitle em { font-style: normal; color: #555; }

    .page-center { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 16px; }

    .card { background: #fff; border: 1px solid #ddd; border-radius: 4px; padding: 36px 32px 28px; width: 100%; max-width: 520px; }

    .id-logo { font-size: 38px; font-weight: bold; margin-bottom: 28px; color: #555; letter-spacing: -1px; }
    .id-logo span { color: #c0392b; font-style: italic; }

    .exp-header { margin-bottom: 20px; }
    .exp-header h2 { font-size: 17px; color: #003057; margin-bottom: 2px; }
    .exp-header p  { font-size: 13px; color: #666; }

    .exp-section-title { font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px; color: #c0392b; border-bottom: 2px solid #c0392b; padding-bottom: 4px; margin: 18px 0 10px; }

    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { background: #003057; color: #fff; padding: 7px 8px; text-align: left; font-weight: normal; }
    td { padding: 6px 8px; border-bottom: 1px solid #eee; color: #333; }
    tr:last-child td { border-bottom: none; }
    tr:hover td { background: #f5f8ff; }

    .badge { display: inline-block; padding: 2px 7px; border-radius: 3px; font-size: 11px; font-weight: bold; }
    .badge-NP { background: #eee;    color: #666; }
    .badge-SS { background: #fdecea; color: #922b21; }
    .badge-AP { background: #fff8e1; color: #7b5e00; }
    .badge-NT { background: #e3f2fd; color: #1565c0; }
    .badge-SB { background: #e8f5e9; color: #2e7d32; }
    .badge-MH { background: #f3e5f5; color: #6a1b9a; }

    .btn-logout { margin-top: 20px; padding: 8px 18px; background: #003057; color: #fff; font-size: 12px; border: none; border-radius: 3px; cursor: pointer; }
    .btn-logout:hover { background: #004b87; }

    .footer { text-align: center; font-size: 11px; color: #999; padding: 12px; background: #fff; border-top: 1px solid #eee; }
  </style>
</head>
<body>

  <div class="top-bar">
    <div class="univ-name"><span>Vniversidad</span> <span>d</span> <span>Salamanca</span></div>
    <div class="subtitle"><strong>idUSAL</strong> <em>- Identidad digital</em></div>
  </div>

  <div class="page-center">
    <div class="card">
      <div class="id-logo"><span>id</span>VSAL</div>

      <div class="exp-header">
        <h2 id="exp-nombre"></h2>
        <p id="exp-subtitulo"></p>
      </div>

      <div class="exp-section-title">Notas</div>
      <table id="tabla-notas">
        <thead>
          <tr><th>Asignatura</th><th>Cr.</th><th>Conv.</th><th>Nota</th><th>Cal.</th></tr>
        </thead>
        <tbody></tbody>
      </table>

      <div class="exp-section-title">Próximas convocatorias</div>
      <table id="tabla-conv">
        <thead>
          <tr><th>Asignatura</th><th>Tipo</th><th>Fecha</th><th>Hora</th><th>Aula</th></tr>
        </thead>
        <tbody></tbody>
      </table>

      <button class="btn-logout" onclick="cerrarSesion()">Cerrar sesión</button>
    </div>
  </div>

  <div class="footer">
    Servicio de Informática y Comunicaciones · Universidad de Salamanca · 37007 Salamanca
  </div>

  <script>
    const raw = sessionStorage.getItem("usal_alumno");
    if (!raw) { window.location.href = "/"; }

    const d = JSON.parse(raw);

    document.getElementById("exp-nombre").textContent =
      d.nombre + " " + d.apellidos;
    document.getElementById("exp-subtitulo").textContent =
      d.usuario + "@usal.es · " + d.curso + "º curso · Ing. Informática";

    // Notas
    const tbodyNotas = document.querySelector("#tabla-notas tbody");
    tbodyNotas.innerHTML = "";
    (d.notas || []).forEach(function(n) {
      const cal  = n.calificacion || "NP";
      const nota = n.nota !== null && n.nota !== undefined
        ? parseFloat(n.nota).toFixed(2) : "—";
      tbodyNotas.innerHTML += "<tr>" +
        "<td>" + n.asignatura + "</td>" +
        "<td>" + n.creditos + "</td>" +
        "<td>" + n.convocatoria + "</td>" +
        "<td>" + nota + "</td>" +
        "<td><span class='badge badge-" + cal + "'>" + cal + "</span></td>" +
        "</tr>";
    });

    // Convocatorias
    const tbodyConv = document.querySelector("#tabla-conv tbody");
    tbodyConv.innerHTML = "";
    if (!d.convocatorias || d.convocatorias.length === 0) {
      tbodyConv.innerHTML = "<tr><td colspan='5' style='color:#999;text-align:center'>No hay convocatorias próximas</td></tr>";
    } else {
      d.convocatorias.forEach(function(c) {
        tbodyConv.innerHTML += "<tr>" +
          "<td>" + c.asignatura + "</td>" +
          "<td>" + c.tipo + "</td>" +
          "<td>" + c.fecha + "</td>" +
          "<td>" + c.hora_inicio + "–" + c.hora_fin + "</td>" +
          "<td>" + c.aula + "</td>" +
          "</tr>";
      });
    }

    function cerrarSesion() {
      sessionStorage.removeItem("usal_alumno");
      window.location.href = "/";
    }
  </script>
</body>
</html>`);
});

// ── Arranque ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log("API USAL corriendo en http://localhost:" + PORT);
});
