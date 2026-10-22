const db = require('./db');

function requireAuth(req, res, next) {
  const userId = req.session && req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: '未登录' });
  }
  const user = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?').get(userId);
  if (!user) {
    req.session = null;
    return res.status(401).json({ error: '用户不存在' });
  }
  req.user = user;
  next();
}

module.exports = { requireAuth };
