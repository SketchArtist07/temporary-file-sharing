/*
TempShare — QR Camera-First Upload (Snapdrop-style)

Features:
- QR visible immediately
- Camera/gallery opens instantly on phone
- Auto-upload (no button)
- Live upload progress
- No login / no signup

Run:
  npm init -y
  npm install express multer mime-types
  node temp-share-server.js
*/

const express = require('express');
const multer = require('multer');
const fs = require('fs');

const path = require('path');
require('dotenv').config({
  path: path.join(__dirname, '../config/.env')
});
const mime = require('mime-types');
const { randomUUID } = require('crypto');

const PORT = process.env.PORT || 3000;
const UPLOAD_ROOT = path.join(__dirname, 'tmp_uploads');
const DEFAULT_EXPIRY_MS = 30 * 60 * 1000; // 24 hour
const tokenMeta = {}; 

if (!fs.existsSync(UPLOAD_ROOT)) fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const app = express();

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
  console.error('⨉ Telegram ENV variables missing');
  process.exit(1);
}


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/assets', express.static(path.join(__dirname,'..', 'assets')));

/* -------------------- API -------------------- */
app.post('/upload',(req,res)=>{
  const token=req.query.token;
  if(!token||!tokenMeta[token]) return res.status(400).send('Invalid token');
  req.uploadDir=tokenDir(token);

  upload.array('files')(req, res, err => {
    if (err) return res.status(500).send(err.message);

    const nf = req.files.map(f => ({ name: f.originalname, size: f.size }));
    tokenMeta[token].files.push(...nf);

    // 🔥 THIS IS THE KEY LINE
    fs.utimes(req.uploadDir, new Date(), new Date(), () => {});
    res.json({ ok: true });
  });
});


app.post('/contact', async (req, res) => {
  try {
    const { firstName, lastName, email, message, honeypot } = req.body;

    // Anti-spam honeypot
    if (honeypot) {
      return res.status(200).json({ ok: true });
    }

    if (!email || !message) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // Save locally
    const data = {
      time: new Date().toISOString(),
      firstName,
      lastName,
      email,
      message
    };

    fs.appendFileSync(
      'contact-messages.json',
      JSON.stringify(data) + ',\n'
    );

    // Telegram send (Node 18+ has fetch)
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: `📩 New Message\n\n${firstName} ${lastName}\n${email}\n\n${message}`
      })
    });

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* -------------------- STORAGE -------------------- */

const tokenDir=t=>path.join(UPLOAD_ROOT,t);

const storage=multer.diskStorage({
  destination(req,file,cb){cb(null,req.uploadDir);},
  filename(req,file,cb){cb(null,file.originalname);}
});

const upload=multer({storage,limits:{fileSize:2 * 1024 * 1024 * 1024}});

/* -------------------- TOKEN INIT -------------------- */
app.get('/new-token', (req, res) => {
  const token = randomUUID();
  const dir = tokenDir(token);

  fs.mkdirSync(dir, { recursive: true });
  // optional: keep file list in memory (NOT expiry)
  tokenMeta[token] = { files: [] };
  res.json({ token });
});

/* -------------------- MOBILE CAMERA-FIRST -------------------- */
app.get('/mobile',(req,res)=>{
  const token=req.query.token;
  if(!token) return res.send('Invalid QR');

  res.send(`<!DOCTYPE html>
<html>
<head>
<title>Send Photos</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="icon" href="/assets/images/favicon.ico" type="image/x-icon">
<link rel="icon" href="/assets/images/favicon-32x32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/images/apple-touch-icon.png">
<link rel="stylesheet"
  href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css"/>
<style>
:root {
  --card-bg: rgba(255, 255, 255, 0.75);
  --card-radius: 20px;
  --border-dash: 2px dashed #c7d2fe;
  --gap: 24px;
  --text: #1f2a44;
  --muted: #64748b;
  --shadow: 0 20px 40px rgba(15, 23, 42, 0.08);
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial;
  color: var(--text);
  background: #f4f6fb;
}
.card {background: rgba(255,255,255,0.75);align-items: center;backdrop-filter: blur(14px);border-radius: 20px;padding: 24px;box-shadow: 0 20px 40px rgba(15,23,42,0.08);width: max-content;margin: 0 auto;}
.box{background:#fff;padding:20px;border-radius:12px;text-align:center}
input{font-size:18px}
.upload-box {display: flex;flex-direction: column;align-items: center;gap: 14px;}
.upload-box input {width: 100%;}

.file-input {display: flex;align-items: center;gap: 10px;padding: 14px 18px;border: 2px dashed #c7d2fe;border-radius: 14px;cursor: pointer;
  color: #475569;transition: background 0.2s ease, border-color 0.2s ease;}

.file-input:hover {background: #eef2ff;border-color: #6366f1;}

.file-input i {font-size: 20px;color: #6366f1;}

/* ===== HERO ===== */
.brand {display: flex;align-items: center;justify-content: center;gap: 14px;gap: 14px;}
.brand h1 {font-family: 'Poppins', sans-serif;font-size: 42px;margin: 0;color: #475569;}
.hero {margin-top: 45px;text-align: center;margin-bottom: 22px;}
.hero h1 {font-family: 'Poppins', 'Inter', system-ui, sans-serif;font-size: 34px;font-weight: 700;}
.hero p {color: #475569;font-size: 15px;font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, sans-serif;}

/* ===== GLASS CARD ===== */
.card {
  background: var(--card-bg);
  backdrop-filter: blur(14px);
  border-radius: var(--card-radius);
  padding: 28px;
  box-shadow: var(--shadow);
  max-width: 920px;
  margin: 40px auto;
  width: calc(100% - 40px);
  /* Ensure the card remains a neat rectangle on all devices */
  border: 1px solid rgba(2, 6, 23, 0.05);
}
.site-header {display: flex;align-items: center;gap: 14px;}
.site-logo {width: 44px;height: 44px;object-fit: contain;filter: drop-shadow(0 6px 14px rgba(0,0,0,.15));}
.site-header h1 {font-family: 'Poppins', sans-serif;font-size: 42px;margin: 0;}
@media (max-width: 480px) {
  .site-logo {width: 36px;height: 36px;}
  .site-header h1 {font-size: 32px;}
}

/* ===== GRID ===== */
.grid {
  gap: var(--gap);
  grid-template-columns: repeat(2, 1fr); /* two columns by default */
  align-items: stretch;
}

.grid > div {
  border: var(--border-dash);
  border-radius: 18px;
  padding: 24px;
  min-height: 140px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  background: rgba(255,255,255,0.65);
}
/* Subtle helper text */
.hint { margin: 8px 0 0; font-size: 0.9rem; color: var(--muted); }

.section-divider { height: 1px; background: #e5e7eb; margin: 8px 0; }

/* Footer styling if needed */
.footer-bottom {
  text-align: center;
  padding: 14px 10px;
  font-size: 13px;
  color: var(--muted);
}

/* Responsive behavior: stack on small screens */
@media (max-width: 900px) {
  .grid {
    grid-template-columns: 1fr; /* single column on tablets/phones */
  }
}

</style>
</head>
<body>
<header>
<section class="hero">
  <div class="brand">
    <img src="/assets/images/logo.png" alt="tempShare Logo" class="site-logo">
    <h1>tempShare</h1>  
  </div>
  <p style="text-align: center;">Instantly Send Files from Phone to PC — No App, No Login<br>tempShare lets you send files securely between devices using QR codes —
      without accounts, tracking, or permanent storage.</p>
</section>
</header>
<main>
<section class="card">
<section class="grid">
<div class="upload-box">
<h2>Upload your Files</h2>
<p class="hint">SVG, PNG, JPG, DOCX, XLSX, .JS, .PY, GIF, etc. (max. 2.1GB)</p>
<label class="file-input">
<i class="fa-solid fa-cloud-arrow-up"></i>
<span id="fileLabel">Choose files</span>
<input type="file" id="f" multiple hidden />
</label>
<p id="s" class="hint"></p>
</div>
</section>
</section>
</main>
<footer>
<div class="footer-bottom">
<p>
  © <span id="year"></span>2025 TempShare • Temporary QR-Based File Sharing & OCR •
  Provided By <a href="https://github.com/SketchArtist07"><i class="fa-brands fa-github"></i> SketchArtist07</a> 
</p>
</div>
</footer>
<script>
const input=document.getElementById('f');
const status=document.getElementById('s');

document.getElementById('f').addEventListener('change', function (e) {
  const label = document.getElementById('fileLabel');

  if (!e.target.files.length) {
    label.textContent = 'Choose files';
    return;
  }

  label.textContent = e.target.files.length + ' file(s) selected';
});


input.addEventListener('change',()=>{
  if(!input.files.length) return;
  const fd=new FormData();
  for(const x of input.files) fd.append('files',x);

  const xhr=new XMLHttpRequest();
  xhr.open('POST','/upload?token=${token}');

  xhr.upload.onprogress=e=>{
    if(e.lengthComputable){
      const p=Math.round((e.loaded/e.total)*100);
      status.innerText='Uploading '+p+'%';
    }
  };

  xhr.onload=()=>status.innerText='Uploaded ✔ You can close this tab';
  xhr.send(fd);
});
</script>
</body>
</html>`);
});


app.get('/pages/:file', (req, res) => {
  res.redirect(301, '/' + req.params.file);
});

/* -------------------- FRONTEND -------------------- */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname,'..', 'index.html'));
});

app.get('/docs', (req, res) => {
  res.sendFile(path.join(__dirname,'..', 'pages/docs.html'));
});

app.get('/image-to-text', (req, res) => {
  res.sendFile(path.join(__dirname,'..', 'pages/image-to-text.html'));
});

app.get('/secure-file-transfer', (req, res) => {
  res.sendFile(path.join(__dirname,'..', 'pages/secure-file-transfer.html'));
});

app.get('/best-tools-online', (req, res) => {
  res.sendFile(path.join(__dirname,'..', 'pages/best-tools-online.html'));
});

app.get('/privacy-focused-sharing', (req, res) => {
  res.sendFile(path.join(__dirname,'..', 'pages/privacy-focused-sharing.html'));
});

app.get('/qrsharing-working', (req, res) => {
  res.sendFile(path.join(__dirname,'..', 'pages/qrsharing-working.html'));
});

app.get('/temp-file-sharing', (req, res) => {
  res.sendFile(path.join(__dirname,'..', 'pages/temp-file-sharing.html'));
});

app.get('/api/recover/:token', (req, res) => {
  const token = req.params.token;

  // Validate token format (UUID)
  if (!/^[a-f0-9-]{36}$/.test(token)) {
    return res.status(400).json({ error: 'Invalid token format' });
  }

  const dir = path.join(UPLOAD_ROOT, token);

  if (!fs.existsSync(dir)) {
    return res.status(404).json({ error: 'Session not found or expired' });
  }

  // Enforce 24h expiry
  const stat = fs.statSync(dir);
  const age = Date.now() - stat.mtimeMs;
  if (age > 24 * 60 * 60 * 1000) {
    return res.status(410).json({ error: 'Session expired' });
  }

  const files = fs.readdirSync(dir)
    .filter(f => fs.statSync(path.join(dir, f)).isFile())
    .map(name => ({
      name,
      size: fs.statSync(path.join(dir, name)).size
    }));

  res.json({ files });
});

app.get('/api/download/:token/:filename', (req, res) => {
  const { token, filename } = req.params;

  if (!/^[a-f0-9-]{36}$/.test(token)) {
    return res.status(400).send('Invalid token');
  }

  if (filename.includes('..')) {
    return res.status(400).send('Invalid filename');
  }

  const filePath = path.join(UPLOAD_ROOT, token, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  res.download(filePath);
});


app.get('/files', (req, res) => {
  const t = req.query.token;
  const dir = tokenDir(t);

  if (!fs.existsSync(dir)) return res.sendStatus(404);

  res.json({ files: tokenMeta[t]?.files || [] });
});

app.get('/download/:token/:file',(req,res)=>{
  const {token,file}=req.params;
  const m=tokenMeta[token];
  const p=path.join(tokenDir(token),file);
  if(!fs.existsSync(p)) return res.sendStatus(404);
  res.download(p);
});

app.use(express.static(path.join(__dirname, '../pages')));

/* -------------------- CLEANUP -------------------- */
setInterval(() => {
  const now = Date.now();
  //console.log('→ Cleanup job running...');

  fs.readdir(UPLOAD_ROOT, (err, folders) => {
    if (err) return;

    folders.forEach(folder => {
      const folderPath = path.join(UPLOAD_ROOT, folder);

      try {
        const stats = fs.statSync(folderPath);
        const age = now - stats.mtimeMs;

        if (age > DEFAULT_EXPIRY_MS) {
          fs.rmSync(folderPath, { recursive: true, force: true });
          console.log('◒ Deleted Expired Session:', folder);
        }
      } catch (e) {
        console.error('Cleanup error:', e.message);
      }
    });
  });
}, 2 * 60 * 1000); // runs every minute

app.listen(PORT,()=>console.log('TempShare running → http://localhost:'+PORT));
