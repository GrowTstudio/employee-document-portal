require('dotenv').config();
const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD === 'change-this-to-a-long-unique-password') {
  console.warn('WARNING: Set a strong ADMIN_PASSWORD in .env before using this app with real employee data.');
}
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  console.warn('WARNING: Set SESSION_SECRET to a random secret of at least 32 characters in .env.');
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// Pure Node.js JSON storage: no native database addon and no Python/build tools required.
const STORE_FILE = path.join(DATA_DIR, 'portal-data.json');
let store = { nextId: 1, submissions: [], settings: {} };
try {
  if (fs.existsSync(STORE_FILE)) {
    const loaded = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    store = { ...store, ...loaded, submissions: Array.isArray(loaded.submissions) ? loaded.submissions : [], settings: loaded.settings || {} };
    if (!Number.isInteger(store.nextId) || store.nextId < 1) store.nextId = store.submissions.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
  }
} catch (e) {
  console.error('Could not read data/portal-data.json. Make a copy of the file before repairing it.', e);
  throw e;
}
function saveStore() {
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf8');
}
const getSetting = key => store.settings[key];
const setSetting = (key, value) => { store.settings[key] = value; saveStore(); };
const getSubmission = id => store.submissions.find(r => Number(r.id) === Number(id));
const getSubmissions = () => [...store.submissions].sort((a, b) => b.id - a.id);

const defaultRequirements = {
  fields: [
    { id: 'employee_id', label: 'Employee ID', type: 'text', required: false },
    { id: 'full_name', label: 'Full Name', type: 'text', required: true },
    { id: 'phone', label: 'Mobile Number', type: 'tel', required: true },
    { id: 'email', label: 'Email Address', type: 'email', required: true },
    { id: 'department', label: 'Department / Process', type: 'text', required: false },
    { id: 'designation', label: 'Designation', type: 'text', required: false },
    { id: 'date_of_joining', label: 'Date of Joining', type: 'date', required: false },
    { id: 'address', label: 'Current Address', type: 'textarea', required: false }
  ],
  documents: [
    { id: 'aadhaar', label: 'Aadhaar Card', required: false },
    { id: 'pan', label: 'PAN Card', required: false },
    { id: 'photo', label: 'Passport-size Photo', required: false },
    { id: 'education', label: 'Education Certificate', required: false }
  ]
};
if (!getSetting('requirements')) setSetting('requirements', JSON.stringify(defaultRequirements));
const getRequirements = () => {
  try { return JSON.parse(getSetting('requirements') || JSON.stringify(defaultRequirements)); }
  catch { return defaultRequirements; }
};

app.disable('x-powered-by');
// Render and other reverse-proxy hosts need this for secure HTTPS session cookies.
if (isProduction) app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(session({
  name: 'employee_portal_admin',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'strict', secure: isProduction, maxAge: 2 * 60 * 60 * 1000 }
}));
app.use(express.static(path.join(__dirname, 'public')));
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many login attempts. Try again after 15 minutes.' } });
function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ error: 'Admin login required.' });
}
function safeSlug(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '_').slice(0, 45); }
const allowedExt = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.doc', '.docx']);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${path.extname(file.originalname).toLowerCase()}`)
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 20 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExt.has(ext)) return cb(new Error('Unsupported file type. Use PDF, PNG, JPG, DOC or DOCX.'));
    cb(null, true);
  }
});

app.get('/api/requirements', (_req, res) => res.json(getRequirements()));
app.post('/api/submit', (req, res) => {
  upload.any()(req, res, err => {
    if (err) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Each file must be 10 MB or smaller.' : err.message || 'Upload failed.' });
    try {
      const requirements = getRequirements();
      const details = {};
      for (const field of requirements.fields) {
        const value = req.body[field.id];
        if (field.required && (!value || !String(value).trim())) throw new Error(`${field.label} is required.`);
        details[field.id] = typeof value === 'string' ? value.trim().slice(0, 5000) : '';
      }
      const uploaded = {};
      for (const file of (req.files || [])) {
        const key = safeSlug(file.fieldname);
        uploaded[key] = { originalName: path.basename(file.originalname), storedName: file.filename, size: file.size };
      }
      for (const doc of requirements.documents) {
        if (doc.required && !uploaded[doc.id]) throw new Error(`${doc.label} document is required.`);
      }
      const nameField = requirements.fields.find(f => f.id === 'full_name') || requirements.fields[0];
      const emailField = requirements.fields.find(f => f.type === 'email' || f.id === 'email');
      const phoneField = requirements.fields.find(f => f.type === 'tel' || f.id === 'phone');
      const employeeName = String(details[nameField?.id] || 'Employee').slice(0, 200);
      const email = String(details[emailField?.id] || '').slice(0, 250);
      const phone = String(details[phoneField?.id] || '').slice(0, 50);
      store.submissions.push({
        id: store.nextId++, employee_name: employeeName, email, phone,
        details_json: JSON.stringify(details), documents_json: JSON.stringify(uploaded),
        submitted_at: new Date().toISOString()
      });
      saveStore();
      res.json({ success: true, message: 'Your details and documents have been submitted successfully.' });
    } catch (e) {
      for (const f of (req.files || [])) { try { fs.unlinkSync(f.path); } catch {} }
      res.status(400).json({ error: e.message || 'Could not save submission.' });
    }
  });
});

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const supplied = String(req.body.password || '');
  if (!process.env.ADMIN_PASSWORD || supplied.length === 0 || supplied !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }
  req.session.regenerate(err => {
    if (err) return res.status(500).json({ error: 'Could not start secure session.' });
    req.session.isAdmin = true;
    res.json({ success: true });
  });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => req.session.destroy(() => res.json({ success: true })));
app.get('/api/admin/me', (req, res) => res.json({ authenticated: Boolean(req.session && req.session.isAdmin) }));
app.get('/api/admin/submissions', requireAdmin, (_req, res) => {
  const rows = getSubmissions().map(r => ({
    id: r.id, employee_name: r.employee_name, email: r.email, phone: r.phone, submitted_at: r.submitted_at,
    details: JSON.parse(r.details_json), documents: JSON.parse(r.documents_json)
  }));
  res.json({ rows, requirements: getRequirements() });
});

app.put('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const row = getSubmission(req.params.id);
  if (!row) return res.status(404).json({ error: 'Submission not found.' });
  const incoming = req.body && req.body.details;
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
    return res.status(400).json({ error: 'Employee details are required.' });
  }
  const requirements = getRequirements();
  const details = {};
  for (const field of requirements.fields) {
    const value = incoming[field.id];
    const cleaned = typeof value === 'string' ? value.trim().slice(0, 5000) : '';
    if (field.required && !cleaned) {
      return res.status(400).json({ error: `${field.label} is required.` });
    }
    details[field.id] = cleaned;
  }
  const nameField = requirements.fields.find(f => f.id === 'full_name') || requirements.fields[0];
  const emailField = requirements.fields.find(f => f.type === 'email' || f.id === 'email');
  const phoneField = requirements.fields.find(f => f.type === 'tel' || f.id === 'phone');
  row.employee_name = String(details[nameField?.id] || 'Employee').slice(0, 200);
  row.email = String(details[emailField?.id] || '').slice(0, 250);
  row.phone = String(details[phoneField?.id] || '').slice(0, 50);
  row.details_json = JSON.stringify(details);
  saveStore();
  res.json({ success: true, message: 'Employee details updated successfully.' });
});

app.get('/api/admin/documents/:id/:docId', requireAdmin, (req, res) => {
  const row = getSubmission(req.params.id);
  if (!row) return res.status(404).send('Submission not found.');
  let docs; try { docs = JSON.parse(row.documents_json); } catch { docs = {}; }
  const doc = docs[safeSlug(req.params.docId)];
  if (!doc || !doc.storedName || path.basename(doc.storedName) !== doc.storedName) return res.status(404).send('Document not found.');
  const filePath = path.join(UPLOAD_DIR, doc.storedName);
  if (!fs.existsSync(filePath)) return res.status(404).send('File missing from storage.');
  res.download(filePath, doc.originalName);
});
app.put('/api/admin/requirements', requireAdmin, (req, res) => {
  const { fields, documents } = req.body || {};
  if (!Array.isArray(fields) || !Array.isArray(documents)) return res.status(400).json({ error: 'Fields and documents must be lists.' });
  if (fields.length > 40 || documents.length > 30) return res.status(400).json({ error: 'Maximum 40 detail fields and 30 document requirements are allowed.' });
  const ids = new Set();
  const cleanFields = [];
  for (const f of fields) {
    const id = safeSlug(f.id); const label = String(f.label || '').trim().slice(0, 100); const type = ['text','email','tel','date','number','textarea'].includes(f.type) ? f.type : 'text';
    if (!id || !label || ids.has(id)) return res.status(400).json({ error: 'Each field needs a unique ID and a label.' });
    ids.add(id); cleanFields.push({ id, label, type, required: Boolean(f.required) });
  }
  const docIds = new Set(); const cleanDocs = [];
  for (const d of documents) {
    const id = safeSlug(d.id); const label = String(d.label || '').trim().slice(0, 100);
    if (!id || !label || docIds.has(id)) return res.status(400).json({ error: 'Each document needs a unique ID and a label.' });
    docIds.add(id); cleanDocs.push({ id, label, required: Boolean(d.required) });
  }
  if (!cleanFields.length) return res.status(400).json({ error: 'Keep at least one employee detail field.' });
  setSetting('requirements', JSON.stringify({ fields: cleanFields, documents: cleanDocs }));
  res.json({ success: true, message: 'Requirements updated.' });
});
app.get('/api/admin/export.xlsx', requireAdmin, (_req, res) => {
  const requirements = getRequirements();
  const rows = getSubmissions();
  const data = rows.map(r => {
    const details = JSON.parse(r.details_json); const docs = JSON.parse(r.documents_json);
    const out = { 'Submission ID': r.id, 'Submitted At': r.submitted_at };
    for (const f of requirements.fields) out[f.label] = details[f.id] || '';
    for (const d of requirements.documents) out[`${d.label} - Uploaded`] = docs[d.id] ? 'Yes' : 'No';
    for (const d of requirements.documents) out[`${d.label} - File Name`] = docs[d.id]?.originalName || '';
    return out;
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data.length ? data : [{ Message: 'No employee submissions yet' }]), 'Employees');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Disposition', `attachment; filename="employee-submissions-${new Date().toISOString().slice(0,10)}.xlsx"`);
  res.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').send(buffer);
});
app.delete('/api/admin/submissions/:id', requireAdmin, (req, res) => {
  const row = getSubmission(req.params.id);
  if (!row) return res.status(404).json({ error: 'Submission not found.' });
  try { for (const doc of Object.values(JSON.parse(row.documents_json))) if (doc.storedName) { const p = path.join(UPLOAD_DIR, path.basename(doc.storedName)); if (fs.existsSync(p)) fs.unlinkSync(p); } } catch {}
  store.submissions = store.submissions.filter(r => Number(r.id) !== Number(req.params.id));
  saveStore();
  res.json({ success: true });
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Unexpected server error.' }); });
app.listen(PORT, () => console.log(`Employee portal running at http://localhost:${PORT}`));
