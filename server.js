// server_cleaned.js
// HHU Research System - 本地开发用后端服务

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const mysql = require('mysql');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ----------------- MySQL 数据库连接 -----------------
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '1234',
  database: 'hhu_research_system',
  charset: 'utf8mb4' // 确保支持 UTF-8（含 emoji 等）
});

db.connect(err => {
  if (err) {
    console.error('数据库连接失败', err);
  } else {
    console.log('数据库连接成功');
  }
});

// ----------------- 上传目录 & multer 配置 -----------------
const uploadDir = 'uploads/literature/';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const fileExtension = path.extname(file.originalname);
    cb(null, 'literature-' + uniqueSuffix + fileExtension);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('不支持的文件类型。请上传 PDF、Word、TXT、PPT 或图片文件。'), false);
    }
  }
});

// 注意：Multer 的错误处理使用标准的 express 错误处理中间件，
// 推荐将其放置在路由定义之后，以便捕获上传过程中的错误（见文件底部）。

// ----------------- 登录接口 -----------------
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const sql = 'SELECT * FROM users WHERE username = ?';
  db.query(sql, [username], (err, results) => {
    if (err) {
      console.error('查询出错：', err);
      return res.status(500).json({ success: false, error: 'db_error' });
    }

    if (results.length === 0) {
      return res.json({ success: false, reason: 'no_user' });
    }

    const user = results[0];
    if (user.password === password) {
      return res.json({ success: true, username: user.username, name: user.name });
    } else {
      return res.json({ success: false, reason: 'wrong_password' });
    }
  });
});

// ----------------- 实验记录接口 -----------------
app.post('/addExperiment', (req, res) => {
  const { username, expName, expDate, expData, expNote } = req.body;
  if (!username) return res.status(400).json({ success: false, error: 'no_username' });

  const findUserSql = 'SELECT id FROM users WHERE username = ?';
  db.query(findUserSql, [username], (err, results) => {
    if (err) return res.status(500).json({ success: false, error: 'db_error' });
    if (results.length === 0) return res.status(404).json({ success: false, reason: 'no_user' });

    const userId = results[0].id;
    const insertSql = `INSERT INTO experiments (user_id, expName, expDate, expData, expNote) VALUES (?, ?, ?, ?, ?)`;
    const expDateVal = expDate ? expDate : null;

    db.query(insertSql, [userId, expName, expDateVal, expData, expNote], (err, result) => {
      if (err) return res.status(500).json({ success: false, error: 'db_error' });
      return res.json({ success: true, message: '实验记录已保存', experimentId: result.insertId });
    });
  });
});

app.get('/getExperiments', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ success: false, error: '用户名不能为空' });

  const getUserSql = 'SELECT id FROM users WHERE username = ?';
  db.query(getUserSql, [username], (err, userResults) => {
    if (err) return res.status(500).json({ success: false, error: 'db_error' });
    if (!userResults || userResults.length === 0) return res.status(404).json({ success: false, reason: 'no_user' });

    const userId = userResults[0].id;
    const sql = `SELECT id, expName, expDate, expData, expNote FROM experiments WHERE user_id = ? ORDER BY expDate DESC, id DESC`;
    db.query(sql, [userId], (err, results) => {
      if (err) return res.status(500).json({ success: false, error: 'db_error' });
      res.json({ success: true, data: results });
    });
  });
});

// ----------------- 论文进度接口 -----------------
app.post('/saveProgress', (req, res) => {
  const { username, progressSummary, completedItems, resultOutput, problemsEncountered, nextPlan } = req.body;
  if (!username) return res.status(400).json({ success: false, error: 'no_username' });

  const findUserSql = 'SELECT id FROM users WHERE username = ?';
  db.query(findUserSql, [username], (err, users) => {
    if (err) return res.status(500).json({ success: false, error: 'db_error' });
    if (users.length === 0) return res.status(404).json({ success: false, reason: 'no_user' });

    const userId = users[0].id;
    const insertSql = `INSERT INTO thesis_progress (user_id, progress_summary, completed_items, result_output, problems_encountered, next_plan) VALUES (?, ?, ?, ?, ?, ?)`;

    db.query(insertSql, [userId, progressSummary, completedItems, resultOutput, problemsEncountered, nextPlan], (err, result) => {
      if (err) return res.status(500).json({ success: false, error: 'db_error' });
      return res.json({ success: true, message: '论文进度已保存', progressId: result.insertId });
    });
  });
});

app.get('/getProgress', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ success: false, error: '用户名不能为空' });

  const sql = `SELECT tp.*, u.username FROM thesis_progress tp JOIN users u ON tp.user_id = u.id WHERE u.username = ? ORDER BY tp.created_at DESC`;
  db.query(sql, [username], (err, results) => {
    if (err) return res.status(500).json({ success: false, error: '数据库查询错误' });
    res.json({ success: true, data: results });
  });
});

// ----------------- 文献管理接口 -----------------
// 上传文件（multipart/form-data）
app.post('/uploadLiteratureFile', upload.single('literatureFile'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: '没有上传文件' });

    res.json({
      success: true,
      filePath: req.file.path,
      fileName: req.file.originalname,
      storedName: req.file.filename,
      fileSize: req.file.size,
      fileType: req.file.mimetype,
      message: '文件上传成功'
    });
  } catch (error) {
    console.error('文件上传错误:', error);
    res.status(500).json({ success: false, error: '文件上传失败' });
  }
});

app.post('/addLiterature', (req, res) => {
  const {
    username, title, authors, journal, year, keywords, abstract, link,
    file_path, file_name, file_size, file_type, notes
  } = req.body;

  if (!username || !title || !authors) return res.status(400).json({ success: false, error: '用户名、标题和作者为必填字段' });

  const getUserSql = 'SELECT id FROM users WHERE username = ?';
  db.query(getUserSql, [username], (err, userResults) => {
    if (err) return res.status(500).json({ success: false, error: '数据库查询错误' });
    if (userResults.length === 0) return res.status(404).json({ success: false, error: '用户不存在' });

    const userId = userResults[0].id;
    const sql = `INSERT INTO literature (user_id, title, authors, journal, year, keywords, abstract, link, file_path, file_name, file_size, file_type, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const values = [userId, title, authors, journal, year, keywords, abstract, link, file_path, file_name, file_size, file_type, notes];

    db.query(sql, values, (err, results) => {
      if (err) return res.status(500).json({ success: false, error: '数据库插入错误' });

      const literatureId = results.insertId;
      console.log('raw file_name:', req.body.file_name);
      console.log('hex:', Buffer.from(req.body.file_name || '').toString('hex'));

      res.json({ success: true, literatureId: literatureId, message: '文献添加成功' });
    });
  });
});

// ----------------- 获取文献历史 -----------------
app.get('/getLiterature', (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ success: false, error: '用户名不能为空' });

  const getUserSql = 'SELECT id FROM users WHERE username = ?';
  db.query(getUserSql, [username], (err, userResults) => {
    if (err) return res.status(500).json({ success: false, error: '数据库查询错误' });
    if (!userResults || userResults.length === 0) return res.status(404).json({ success: false, error: '用户不存在' });

    const userId = userResults[0].id;
    const sql = `
      SELECT id, title, authors, journal, year, keywords, abstract, link,
             file_path, file_name, file_size, file_type, notes, created_at
      FROM literature
      WHERE user_id = ?
      ORDER BY created_at DESC
    `;

    db.query(sql, [userId], (err2, results) => {
      if (err2) return res.status(500).json({ success: false, error: '数据库查询失败' });
      res.json({ success: true, data: results });
    });
  });
});

// ----------------- 个人日志接口 -----------------
// POST /addLog
// body: { username, title, content }
// 返回：{ success: true, log: {...} }
app.post('/addLog', (req, res) => {
  const { username, title, content } = req.body;
  if (!username) return res.status(400).json({ success: false, error: '缺少 username' });
  if (!content || content.trim() === '') return res.status(400).json({ success: false, error: '日志内容不能为空' });

  const findUserSql = 'SELECT id FROM users WHERE username = ?';
  db.query(findUserSql, [username], (err, users) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    if (!users || users.length === 0) return res.status(404).json({ success: false, error: '用户不存在' });

    const userId = users[0].id;
    const insertSql = 'INSERT INTO user_logs (user_id, username, title, content) VALUES (?, ?, ?, ?)';

    db.query(insertSql, [userId, username, title || null, content], (err2, result) => {
      if (err2) return res.status(500).json({ success: false, error: err2.message });

      const insertedId = result.insertId;
      db.query('SELECT id, user_id, username, title, content, log_date, created_at FROM user_logs WHERE id = ?', [insertedId], (err3, rows) => {
        if (err3) return res.status(500).json({ success: false, error: err3.message });
        return res.json({ success: true, log: rows[0] });
      });
    });
  });
});

// GET /getLogs?username=xxx
app.get('/getLogs', (req, res) => {
  const username = req.query.username;
  if (!username) return res.status(400).json({ success: false, error: '缺少 username 参数' });

  const sql = 'SELECT id, user_id, username, title, content, log_date, created_at FROM user_logs WHERE username = ? ORDER BY created_at DESC LIMIT 500';
  db.query(sql, [username], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    return res.json({ success: true, data: rows });
  });
});

// GET /getLogsByDate?username=xxx&date=YYYY-MM-DD
// 按天筛选日志
app.get('/getLogsByDate', (req, res) => {
  const username = req.query.username;
  const dateStr = req.query.date; // e.g. 2025-11-13
  if (!username || !dateStr) return res.status(400).json({ success: false, error: '缺少参数' });

  const from = dateStr + ' 00:00:00';
  const to = dateStr + ' 23:59:59';
  const sql = 'SELECT id, user_id, username, title, content, log_date, created_at FROM user_logs WHERE username = ? AND created_at BETWEEN ? AND ? ORDER BY created_at DESC';

  db.query(sql, [username, from, to], (err, rows) => {
    if (err) return res.status(500).json({ success: false, error: err.message });
    return res.json({ success: true, data: rows });
  });
});

// ----------------- Multer 错误处理（放在路由之后） -----------------
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: '文件太大，请上传小于10MB的文件' });
    }
  }
  res.status(500).json({ success: false, error: error.message });
});

// ----------------- 启动服务器 -----------------
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`服务器运行在端口${PORT}`);
});
