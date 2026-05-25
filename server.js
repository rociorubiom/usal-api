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
    const [[alumno]] = await pool.query(`
      SELECT a.nombre, a.apellidos, a.usuario, a.curso, c.nombre AS carrera
      FROM alumnos a
      JOIN carreras c ON c.id = a.carrera_id
      WHERE a.id = ?
    `, [req.alumno.id]);

    const [notas] = await pool.query(`
      SELECT
        as2.codigo, as2.nombre AS asignatura, as2.curso, as2.cuatrimestre, as2.creditos,
        n.convocatoria, n.nota, n.calificacion
      FROM notas n
      JOIN asignaturas as2 ON as2.id = n.asignatura_id
      WHERE n.alumno_id = ?
      ORDER BY as2.curso, as2.cuatrimestre, as2.nombre
    `, [req.alumno.id]);

    const [convocatorias] = await pool.query(`
      SELECT
        as2.codigo, as2.nombre AS asignatura,
        c.tipo, c.fecha, c.hora_inicio, c.hora_fin, c.aula, c.sede
      FROM convocatorias c
      JOIN asignaturas as2 ON as2.id = c.asignatura_id
      WHERE c.fecha >= CURDATE()
      ORDER BY c.fecha
    `);

    res.json({ ok: true, alumno, notas, convocatorias });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error del servidor" });
  }
});
app.get("/juego", (req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>idUSAL · Expediente</title>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=IBM+Plex+Sans:wght@300;400;600&display=swap" rel="stylesheet"/>
  <style>
    :root {
      --rojo:    #c0392b;
      --azul:    #003057;
      --gris-bg: #f0f2f5;
      --blanco:  #ffffff;
      --borde:   #dde2ea;
      --texto:   #1a1a2e;
      --sub:     #6b7280;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'IBM Plex Sans', sans-serif;
      background: var(--gris-bg);
      color: var(--texto);
      min-height: 100vh;
    }

    /* ── Header ── */
    header {
      background: var(--azul);
      padding: 0 32px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 56px;
    }
    .header-left {
      display: flex;
      align-items: center;
      gap: 18px;
    }
    .logo-word {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 20px;
      font-weight: 600;
      color: #fff;
      letter-spacing: -0.5px;
    }
    .logo-word span { color: #e74c3c; font-style: italic; }
    .divider-v {
      width: 1px; height: 24px;
      background: rgba(255,255,255,0.2);
    }
    .header-title {
      font-size: 13px;
      color: rgba(255,255,255,0.65);
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .header-user {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: rgba(255,255,255,0.8);
    }
    .avatar {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--rojo);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 600; color: #fff;
    }
    .btn-salir {
      margin-left: 14px;
      padding: 5px 14px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.35);
      border-radius: 4px;
      color: rgba(255,255,255,0.75);
      font-size: 12px;
      cursor: pointer;
      font-family: 'IBM Plex Sans', sans-serif;
      transition: all .15s;
    }
    .btn-salir:hover {
      background: rgba(255,255,255,0.1);
      border-color: rgba(255,255,255,0.6);
      color: #fff;
    }

    /* ── Layout ── */
    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 32px 20px 60px;
    }

    /* ── Perfil banner ── */
    .perfil {
      background: var(--blanco);
      border: 1px solid var(--borde);
      border-radius: 8px;
      padding: 22px 28px;
      display: flex;
      align-items: center;
      gap: 20px;
      margin-bottom: 28px;
    }
    .perfil-avatar {
      width: 52px; height: 52px;
      border-radius: 50%;
      background: var(--azul);
      display: flex; align-items: center; justify-content: center;
      font-size: 20px; font-weight: 600; color: #fff;
      flex-shrink: 0;
    }
    .perfil-info h1 {
      font-size: 18px; font-weight: 600; color: var(--azul);
    }
    .perfil-info p {
      font-size: 13px; color: var(--sub); margin-top: 3px;
    }
    .perfil-stats {
      margin-left: auto;
      display: flex;
      gap: 32px;
    }
    .stat { text-align: center; }
    .stat-val {
      font-family: 'IBM Plex Mono', monospace;
      font-size: 22px; font-weight: 600; color: var(--azul);
    }
    .stat-lbl { font-size: 11px; color: var(--sub); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }

    /* ── Sección ── */
    .seccion-titulo {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--sub);
      margin-bottom: 12px;
    }
    .seccion-titulo::after {
      content: '';
      flex: 1;
      height: 1px;
      background: var(--borde);
    }
    .seccion-titulo .dot {
      width: 8px; height: 8px;
      border-radius: 50%;
      background: var(--rojo);
    }

    /* ── Tabla ── */
    .tabla-wrap {
      background: var(--blanco);
      border: 1px solid var(--borde);
      border-radius: 8px;
      overflow: hidden;
      margin-bottom: 32px;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    thead tr { background: #f8f9fb; border-bottom: 2px solid var(--borde); }
    th {
      padding: 10px 14px;
      text-align: left;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--sub);
    }
    td { padding: 10px 14px; border-bottom: 1px solid #f0f2f5; color: var(--texto); }
    tbody tr:last-child td { border-bottom: none; }
    tbody tr:hover td { background: #fafbff; }

    .nota-num {
      font-family: 'IBM Plex Mono', monospace;
      font-weight: 600;
      font-size: 13px;
    }

    /* ── Badges ── */
    .badge {
      display: inline-flex; align-items: center;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      font-family: 'IBM Plex Mono', monospace;
    }
    .badge-NP { background: #f0f2f5;   color: #6b7280; }
    .badge-SS { background: #fde8e8;   color: #b91c1c; }
    .badge-AP { background: #fef9c3;   color: #92400e; }
    .badge-NT { background: #dbeafe;   color: #1e40af; }
    .badge-SB { background: #dcfce7;   color: #15803d; }
    .badge-MH { background: #f3e8ff;   color: #6b21a8; }

    /* ── Media color en nota numérica ── */
    .nota-ss { color: #b91c1c; }
    .nota-ap { color: #92400e; }
    .nota-nt { color: #1e40af; }
    .nota-sb { color: #15803d; }
    .nota-mh { color: #6b21a8; }

    /* ── Convocatorias: tarjetas ── */
    .conv-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      gap: 14px;
      margin-bottom: 32px;
    }
    .conv-card {
      background: var(--blanco);
      border: 1px solid var(--borde);
      border-radius: 8px;
      padding: 16px 18px;
      border-left: 4px solid var(--rojo);
      transition: box-shadow .15s;
    }
    .conv-card:hover { box-shadow: 0 4px 16px rgba(0,48,87,0.09); }
    .conv-asig {
      font-size: 14px; font-weight: 600;
      color: var(--azul); margin-bottom: 6px;
      line-height: 1.3;
    }
    .conv-meta {
      display: flex; flex-wrap: wrap; gap: 8px;
      font-size: 12px; color: var(--sub);
    }
    .conv-meta span {
      display: flex; align-items: center; gap: 4px;
    }
    .conv-tipo {
      display: inline-block;
      margin-top: 8px;
      padding: 2px 8px;
      background: #f0f2f5;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 600;
      color: var(--sub);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .empty-state {
      text-align: center;
      padding: 32px;
      color: var(--sub);
      font-size: 13px;
    }

    footer {
      text-align: center;
      font-size: 11px;
      color: #aaa;
      padding: 16px;
      border-top: 1px solid var(--borde);
      background: var(--blanco);
    }

    /* ── Animación de entrada ── */
    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .perfil     { animation: fadeUp .35s ease both; }
    .tabla-wrap { animation: fadeUp .4s .08s ease both; }
    .conv-grid  { animation: fadeUp .4s .12s ease both; }
  </style>
</head>
<body>

<header>
  <div class="header-left">
    <div class="logo-word"><span>id</span>VSAL</div>
    <div class="divider-v"></div>
    <div class="header-title">Expediente Académico</div>
  </div>
  <div class="header-user">
    <div class="avatar" id="hdr-avatar">?</div>
    <span id="hdr-nombre">—</span>
    <button class="btn-salir" onclick="cerrarSesion()">Salir</button>
  </div>
</header>

<main>

  <!-- Perfil -->
  <div class="perfil">
    <div class="perfil-avatar" id="prf-avatar">?</div>
    <div class="perfil-info">
      <h1 id="prf-nombre">Cargando…</h1>
      <p id="prf-sub"></p>
    </div>
    <div class="perfil-stats">
      <div class="stat">
        <div class="stat-val" id="stat-asig">—</div>
        <div class="stat-lbl">Asignaturas</div>
      </div>
      <div class="stat">
        <div class="stat-val" id="stat-media">—</div>
        <div class="stat-lbl">Media</div>
      </div>
      <div class="stat">
        <div class="stat-val" id="stat-conv">—</div>
        <div class="stat-lbl">Convoc.</div>
      </div>
    </div>
  </div>

  <!-- Notas -->
  <div class="seccion-titulo"><div class="dot"></div>Notas</div>
  <div class="tabla-wrap">
    <table>
      <thead>
        <tr>
          <th>Asignatura</th>
          <th>Cr.</th>
          <th>Curso</th>
          <th>Conv.</th>
          <th>Nota</th>
          <th>Calificación</th>
        </tr>
      </thead>
      <tbody id="tbody-notas"></tbody>
    </table>
  </div>

  <!-- Convocatorias -->
  <div class="seccion-titulo"><div class="dot"></div>Próximas convocatorias</div>
  <div class="conv-grid" id="conv-grid"></div>

</main>

<footer>Servicio de Informática y Comunicaciones · Universidad de Salamanca · 37007 Salamanca</footer>

<script>
  const COLOR_CLASS = { SS: 'nota-ss', AP: 'nota-ap', NT: 'nota-nt', SB: 'nota-sb', MH: 'nota-mh' };

  function iniciales(nombre, apellidos) {
    const n = (nombre || '').trim()[0] || '';
    const a = (apellidos || '').trim()[0] || '';
    return (n + a).toUpperCase() || '?';
  }

  function cerrarSesion() {
    sessionStorage.removeItem('usal_alumno');
    window.location.href = '/';
  }

  const raw = sessionStorage.getItem('usal_alumno');
  if (!raw) { window.location.href = '/'; }

  const d = JSON.parse(raw);
  const ini = iniciales(d.nombre, d.apellidos);

  // Header & perfil
  document.getElementById('hdr-avatar').textContent = ini;
  document.getElementById('hdr-nombre').textContent = d.nombre + ' ' + d.apellidos;
  document.getElementById('prf-avatar').textContent = ini;
  document.getElementById('prf-nombre').textContent = d.nombre + ' ' + d.apellidos;
  document.getElementById('prf-sub').textContent    =
    d.usuario + '@usal.es  ·  ' + d.curso + 'º curso  ·  Ing. Informática';

  // Stats
  const notasConNota = (d.notas || []).filter(n => n.nota !== null && n.nota !== undefined);
  const media = notasConNota.length
    ? (notasConNota.reduce((s, n) => s + parseFloat(n.nota), 0) / notasConNota.length).toFixed(2)
    : '—';
  const asigUnicas = new Set((d.notas || []).map(n => n.asignatura)).size;
  document.getElementById('stat-asig').textContent  = asigUnicas || '—';
  document.getElementById('stat-media').textContent = media;
  document.getElementById('stat-conv').textContent  = (d.convocatorias || []).length;

  // Tabla notas
  const tbody = document.getElementById('tbody-notas');
  if (!d.notas || d.notas.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty-state">Sin notas registradas</td></tr>';
  } else {
    d.notas.forEach(function(n) {
      const cal  = n.calificacion || 'NP';
      const nota = n.nota !== null && n.nota !== undefined
        ? parseFloat(n.nota).toFixed(2) : '—';
      const cls  = COLOR_CLASS[cal] || '';
      tbody.innerHTML += \`<tr>
        <td>\${n.asignatura}</td>
        <td>\${n.creditos}</td>
        <td>\${n.curso || '—'}</td>
        <td>\${n.convocatoria}</td>
        <td class="nota-num \${cls}">\${nota}</td>
        <td><span class="badge badge-\${cal}">\${cal}</span></td>
      </tr>\`;
    });
  }

  // Tarjetas convocatorias
  const grid = document.getElementById('conv-grid');
  if (!d.convocatorias || d.convocatorias.length === 0) {
    grid.innerHTML = '<p class="empty-state" style="grid-column:1/-1">No hay convocatorias próximas</p>';
  } else {
    d.convocatorias.forEach(function(c) {
      const fecha = c.fecha ? new Date(c.fecha).toLocaleDateString('es-ES',
        { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
      grid.innerHTML += \`<div class="conv-card">
        <div class="conv-asig">\${c.asignatura}</div>
        <span class="conv-tipo">\${c.tipo}</span>
        <div class="conv-meta" style="margin-top:10px">
          <span>📅 \${fecha}</span>
          <span>🕐 \${c.hora_inicio}–\${c.hora_fin}</span>
          <span>📍 \${c.aula}\${c.sede ? ' · ' + c.sede : ''}</span>
        </div>
      </div>\`;
    });
  }
</script>
</body>
</html>`);
});
// ── Arranque ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`API USAL corriendo en http://localhost:${PORT}`);
});
