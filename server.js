require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieSession = require('cookie-session');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const db = require('./lib/db');
const { requireAuth } = require('./lib/auth');
const { parseResume } = require('./lib/resume');
const { generateQuestions, evaluateInterview } = require('./lib/deepseek');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(cookieSession({
  name: 'mi_session',
  keys: [process.env.SESSION_SECRET || 'dev-secret'],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function isEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s || '');
}

// ============ 认证 ============
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body || {};
  if (!isEmail(email)) return res.status(400).json({ error: '邮箱格式不正确' });
  if (!password || password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });

  const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (exists) return res.status(409).json({ error: '该邮箱已注册' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email, hash);
  req.session.userId = info.lastInsertRowid;
  res.json({ id: info.lastInsertRowid, email });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email || '');
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }
  req.session.userId = user.id;
  res.json({ id: user.id, email: user.email });
});

app.post('/api/auth/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: '未登录' });
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(req.session.userId);
  if (!user) return res.status(401).json({ error: '未登录' });
  res.json(user);
});

// ============ 简历解析 ============
app.post('/api/resume/parse', requireAuth, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: '请上传文件' });
    const text = await parseResume(req.file.buffer, req.file.mimetype, req.file.originalname);
    res.json({ text });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ============ 面试 ============
app.post('/api/interview/questions', requireAuth, async (req, res) => {
  const { resumeText, company, role, jd } = req.body || {};
  try {
    const questions = await generateQuestions({ resumeText, company, role, jd });
    res.json({ questions });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/interview/evaluate', requireAuth, async (req, res) => {
  const { resumeText, company, role, jd, questions, answers } = req.body || {};
  try {
    if (!Array.isArray(questions) || !Array.isArray(answers)) {
      return res.status(400).json({ error: '缺少题目或回答数据' });
    }
    const report = await evaluateInterview({ resumeText, company, role, questions, answers });

    const info = db.prepare(
      `INSERT INTO interviews (user_id, company, role, jd, resume_text, questions, answers, report, overall_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.user.id,
      company || '',
      role || '',
      jd || '',
      resumeText || '',
      JSON.stringify(questions),
      JSON.stringify(answers),
      JSON.stringify(report),
      Number(report.overall_score) || 0
    );

    res.json({ report, interviewId: info.lastInsertRowid });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/interview/history', requireAuth, (req, res) => {
  const rows = db.prepare(
    `SELECT id, company, role, overall_score, created_at FROM interviews
     WHERE user_id = ? ORDER BY id DESC LIMIT 50`
  ).all(req.user.id);
  res.json({ history: rows });
});

// ============ 静态文件 ============
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ============ 错误处理 ============
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  console.log(`MockInterview server running at http://localhost:${PORT}/`);
});
