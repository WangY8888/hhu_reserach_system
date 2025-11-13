// server_supabase.js
// HHU Research System - Supabase 后端服务 (使用 Supabase JS + Storage)
// 请通过环境变量提供 SUPABASE_URL 和 SUPABASE_KEY（Service Role Key）以及 SUPABASE_STORAGE_BUCKET。

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));

// --------------- Supabase client ---------------
const SUPABASE_URL = process.env.SUPABASE_URL||"https://nztdjvwosssevoiukuex.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY||"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56dGRqdndvc3NzZXZvaXVrdWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjMwMTY4OTEsImV4cCI6MjA3ODU5Mjg5MX0.AlVX1TAZM_S0Wyv2RTvDzXAfSJYpasCXfA5t3thdgxE";
const STORAGE_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'literature';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('请先设置 SUPABASE_URL 和 SUPABASE_KEY 环境变量（在 Render 设置 Environment Variables）');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// --------------- multer (memory) 用于读取上传文件到内存 ---------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// ---------- helper: uniform response and error ----------
function handleServerError(res, err, ctx = '') {
  console.error(ctx, err);
  const msg = (err && err.message) ? err.message : String(err);
  return res.status(500).json({ success: false, error: msg });
}

// ---------- LOGIN ----------
app.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ success: false, error: 'username_and_password_required' });

    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('username', username)
      .single();

    if (error) {
      // 当用户不存在时 supabase single() 会返回 406 / error; handle gracefully
      if (error.code === 'PGRST116') {
        return res.json({ success: false, reason: 'no_user' });
      }
      return handleServerError(res, error, '/login supabase select');
    }

    if (!data) return res.json({ success: false, reason: 'no_user' });

    // 注意：生产应使用哈希密码（bcrypt），这里只为示例简单对比
    if (data.password === password) {
      return res.json({ success: true, username: data.username, name: data.name || null });
    } else {
      return res.json({ success: false, reason: 'wrong_password' });
    }
  } catch (err) {
    return handleServerError(res, err, '/login catch');
  }
});

// ---------- ADD EXPERIMENT ----------
app.post('/addExperiment', async (req, res) => {
  try {
    const { username, expName, expDate, expData, expNote } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'no_username' });

    // 获取用户 id
    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userErr) {
      if (userErr.code) return handleServerError(res, userErr, '/addExperiment select user');
      return res.status(404).json({ success: false, reason: 'no_user' });
    }
    if (!user) return res.status(404).json({ success: false, reason: 'no_user' });

    // 插入实验记录
    const payload = {
      user_id: user.id,
      expName: expName || null,
      expDate: expDate || null,
      expData: expData || null,
      expNote: expNote || null
    };

    const { data, error } = await supabase
      .from('experiments')
      .insert([payload])
      .select(); // 选回插入记录

    if (error) return handleServerError(res, error, '/addExperiment insert');

    return res.json({ success: true, message: '实验记录已保存', experimentId: data && data[0] ? data[0].id : null });
  } catch (err) {
    return handleServerError(res, err, '/addExperiment catch');
  }
});

// ---------- GET EXPERIMENTS ----------
app.get('/getExperiments', async (req, res) => {
  try {
    const username = req.query.username;
    if (!username) return res.status(400).json({ success: false, error: 'username_required' });

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userErr) {
      if (userErr.code) return handleServerError(res, userErr, '/getExperiments select user');
      return res.status(404).json({ success: false, reason: 'no_user' });
    }
    if (!user) return res.status(404).json({ success: false, reason: 'no_user' });

    // 注意：order 字段名请以你 Supabase 表中实际命名为准（大小写敏感）
    // 我先尝试按 expDate 排序，如果该列不存在会返回 error
    let query = supabase
      .from('experiments')
      .select('*')
      .eq('user_id', user.id);

    // 尝试 order expDate，否则 fallback 到 created_at
    const { data, error } = await query.order('expDate', { ascending: false }).limit(100);

    if (error) {
      // 如果 expDate 不存在或其它错误，尝试用 created_at 排序
      console.warn('/getExperiments order by expDate failed, fallback to created_at:', error.message);
      const { data: data2, error: error2 } = await supabase
        .from('experiments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error2) return handleServerError(res, error2, '/getExperiments fallback');
      return res.json({ success: true, data: data2 || [] });
    }

    return res.json({ success: true, data: data || [] });
  } catch (err) {
    return handleServerError(res, err, '/getExperiments catch');
  }
});

// ---------- SAVE PROGRESS ----------
app.post('/saveProgress', async (req, res) => {
  try {
    const { username, progressSummary, completedItems, resultOutput, problemsEncountered, nextPlan } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'no_username' });

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userErr) return handleServerError(res, userErr, '/saveProgress select user');
    if (!user) return res.status(404).json({ success: false, reason: 'no_user' });

    const payload = {
      user_id: user.id,
      progress_summary: progressSummary || null,
      completed_items: completedItems || null,
      result_output: resultOutput || null,
      problems_encountered: problemsEncountered || null,
      next_plan: nextPlan || null
    };

    const { data, error } = await supabase
      .from('thesis_progress')
      .insert([payload])
      .select();

    if (error) return handleServerError(res, error, '/saveProgress insert');

    return res.json({ success: true, message: '论文进度已保存', progressId: data && data[0] ? data[0].id : null });
  } catch (err) {
    return handleServerError(res, err, '/saveProgress catch');
  }
});

// ---------- GET PROGRESS ----------
app.get('/getProgress', async (req, res) => {
  try {
    const username = req.query.username;
    if (!username) return res.status(400).json({ success: false, error: 'username_required' });

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userErr) return handleServerError(res, userErr, '/getProgress select user');
    if (!user) return res.status(404).json({ success: false, reason: 'no_user' });

    const { data, error } = await supabase
      .from('thesis_progress')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) return handleServerError(res, error, '/getProgress select');
    return res.json({ success: true, data: data || [] });
  } catch (err) {
    return handleServerError(res, err, '/getProgress catch');
  }
});

// ---------- UPLOAD LITERATURE FILE (直接存到 Supabase Storage) ----------
app.post('/uploadLiteratureFile', upload.single('literatureFile'), async (req, res) => {
  try {
    const username = req.body.username || null; // 可选
    if (!req.file) return res.status(400).json({ success: false, error: 'no_file' });

    // 生成存储路径： literatures/<timestamp>-originalname
    const ext = req.file.originalname ? req.file.originalname.split('.').pop() : '';
    const filename = `literature-${Date.now()}-${Math.round(Math.random()*1e6)}.${ext}`;
    const objectPath = filename; // 也可以加目录： `uploads/${filename}`

    // 将内存 buffer 上传到 Supabase Storage
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) {
      console.error('supabase storage upload error', error);
      return res.status(500).json({ success: false, error: error.message || JSON.stringify(error) });
    }

    // 获取公共 URL（如果 bucket 是 public）或使用 signed URL
    // 这里尝试获取公开 URL（如果 bucket 是 public）
    const { publicURL } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath);

    return res.json({
      success: true,
      message: '文件上传成功',
      storagePath: objectPath,
      publicURL: publicURL || null,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      fileSize: req.file.size
    });
  } catch (err) {
    return handleServerError(res, err, '/uploadLiteratureFile catch');
  }
});

// ---------- ADD LITERATURE (metadata + optional storage info) ----------
app.post('/addLiterature', async (req, res) => {
  try {
    const { username, title, authors, journal, year, keywords, abstract, link, notes, storagePath, fileName, fileSize, fileType } = req.body;

    if (!username || !title || !authors) return res.status(400).json({ success: false, error: 'username_title_authors_required' });

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userErr) return handleServerError(res, userErr, '/addLiterature select user');
    if (!user) return res.status(404).json({ success: false, error: 'no_user' });

    const payload = {
      user_id: user.id,
      title,
      authors,
      journal: journal || null,
      year: year ? parseInt(year, 10) : null,
      keywords: keywords || null,
      abstract: abstract || null,
      link: link || null,
      file_path: storagePath || null,
      file_name: fileName || null,
      file_size: fileSize || null,
      file_type: fileType || null,
      notes: notes || null
    };

    const { data, error } = await supabase
      .from('literature')
      .insert([payload])
      .select();

    if (error) return handleServerError(res, error, '/addLiterature insert');

    return res.json({ success: true, literatureId: data && data[0] ? data[0].id : null });
  } catch (err) {
    return handleServerError(res, err, '/addLiterature catch');
  }
});

// ---------- GET LITERATURE ----------
app.get('/getLiterature', async (req, res) => {
  try {
    const username = req.query.username;
    if (!username) return res.status(400).json({ success: false, error: 'username_required' });

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userErr) return handleServerError(res, userErr, '/getLiterature select user');
    if (!user) return res.status(404).json({ success: false, error: 'no_user' });

    const { data, error } = await supabase
      .from('literature')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) return handleServerError(res, error, '/getLiterature select');
    return res.json({ success: true, data: data || [] });
  } catch (err) {
    return handleServerError(res, err, '/getLiterature catch');
  }
});

// ---------- ADD LOG ----------
app.post('/addLog', async (req, res) => {
  try {
    const { username, title, content } = req.body;
    if (!username) return res.status(400).json({ success: false, error: 'no_username' });
    if (!content || content.trim() === '') return res.status(400).json({ success: false, error: 'content_required' });

    const { data: user, error: userErr } = await supabase
      .from('users')
      .select('id')
      .eq('username', username)
      .single();

    if (userErr) return handleServerError(res, userErr, '/addLog select user');
    if (!user) return res.status(404).json({ success: false, error: 'no_user' });

    const payload = {
      user_id: user.id,
      username,
      title: title || null,
      content
    };

    const { data, error } = await supabase
      .from('user_logs')
      .insert([payload])
      .select();

    if (error) return handleServerError(res, error, '/addLog insert');

    return res.json({ success: true, log: data && data[0] ? data[0] : null });
  } catch (err) {
    return handleServerError(res, err, '/addLog catch');
  }
});

// ---------- GET LOGS ----------
app.get('/getLogs', async (req, res) => {
  try {
    const username = req.query.username;
    if (!username) return res.status(400).json({ success: false, error: 'username_required' });

    const { data, error } = await supabase
      .from('user_logs')
      .select('id, user_id, username, title, content, log_date, created_at')
      .eq('username', username)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return handleServerError(res, error, '/getLogs select');
    return res.json({ success: true, data: data || [] });
  } catch (err) {
    return handleServerError(res, err, '/getLogs catch');
  }
});

// ---------- GET LOGS BY DATE ----------
app.get('/getLogsByDate', async (req, res) => {
  try {
    const username = req.query.username;
    const dateStr = req.query.date; // YYYY-MM-DD
    if (!username || !dateStr) return res.status(400).json({ success: false, error: 'username_and_date_required' });

    const from = `${dateStr}T00:00:00Z`;
    const to = `${dateStr}T23:59:59Z`;

    const { data, error } = await supabase
      .from('user_logs')
      .select('id, user_id, username, title, content, log_date, created_at')
      .eq('username', username)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false });

    if (error) return handleServerError(res, error, '/getLogsByDate select');
    return res.json({ success: true, data: data || [] });
  } catch (err) {
    return handleServerError(res, err, '/getLogsByDate catch');
  }
});

// ---------- generic health check ----------
app.get('/', (req, res) => res.json({ success: true, message: 'Supabase backend running' }));

// ---------- start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Supabase server running on port ${PORT}`);
});
