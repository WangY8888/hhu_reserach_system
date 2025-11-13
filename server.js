// server_supabase.js
// HHU Research System - Supabase 后端服务

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// ----------------- Supabase 连接 -----------------
const SUPABASE_URL = 'https://nztdjvwosssevoiukuex.supabase.co';
const SUPABASE_KEY = 'YOUR_SUPABASE_SERVICE_KEY'; // 注意：不要公开给前端
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ----------------- 上传目录 & multer 配置 -----------------
const uploadDir = 'uploads/literature/';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'literature-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// ----------------- 登录接口 -----------------
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { data, error } = await supabase
    .from('"users"')
    .select('"*"')
    .eq('"username"', username)
    .single();

  if (error) return res.status(500).json({ success: false, error: error.message });
  if (!data) return res.json({ success: false, reason: 'no_user' });

  if (data.password === password) {
    return res.json({ success: true, username: data.username, name: data.name });
  } else {
    return res.json({ success: false, reason: 'wrong_password' });
  }
});

// ----------------- 实验记录接口 -----------------
app.post('/addExperiment', async (req, res) => {
  const { username, expName, expDate, expData, expNote } = req.body;

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (userErr) return res.status(500).json({ success: false, error: userErr.message });
  if (!user) return res.status(404).json({ success: false, reason: 'no_user' });

  const { data, error } = await supabase.from('experiments').insert([{
    user_id: user.id,
    expName,
    expDate: expDate || null,
    expData,
    expNote
  }]);

  if (error) return res.status(500).json({ success: false, error: error.message });
  return res.json({ success: true, message: '实验记录已保存', experimentId: data[0].id });
});

app.get('/getExperiments', async (req, res) => {
  const { username } = req.query;
  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (userErr) return res.status(500).json({ success: false, error: userErr.message });
  if (!user) return res.status(404).json({ success: false, reason: 'no_user' });

  const { data, error } = await supabase
    .from('experiments')
    .select('*')
    .eq('user_id', user.id)
    .order('expDate', { ascending: false });

  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, data });
});

// ----------------- 文献管理接口 -----------------
app.post('/addLiterature', upload.single('literatureFile'), async (req, res) => {
  const { username, title, authors, journal, year, keywords, abstract, link, notes } = req.body;

  const { data: user, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('username', username)
    .single();

  if (userErr) return res.status(500).json({ success: false, error: userErr.message });
  if (!user) return res.status(404).json({ success: false, error: '用户不存在' });

  const file_path = req.file ? req.file.path : null;
  const file_name = req.file ? req.file.originalname : null;
  const file_size = req.file ? req.file.size : null;
  const file_type = req.file ? req.file.mimetype : null;

  const { data, error } = await supabase.from('literature').insert([{
    user_id: user.id,
    title, authors, journal, year, keywords, abstract, link,
    file_path, file_name, file_size, file_type, notes
  }]);

  if (error) return res.status(500).json({ success: false, error: error.message });
  res.json({ success: true, literatureId: data[0].id });
});

// ----------------- 启动服务器 -----------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Supabase 服务器运行在端口 ${PORT}`));

