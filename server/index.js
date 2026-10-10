const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const multer = require('multer');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const AdmZip = require('adm-zip');
const { randomUUID } = require('crypto');

const rootDir = path.resolve(__dirname, '..');
const envPath = path.join(rootDir, '.env');
const projectsRoot = path.join(rootDir, 'projects');
const backupsRoot = path.join(rootDir, 'backups');
const dataRoot = path.join(rootDir, 'data');

fs.mkdirSync(projectsRoot, { recursive: true });
fs.mkdirSync(backupsRoot, { recursive: true });
fs.mkdirSync(dataRoot, { recursive: true });

dotenv.config({ path: envPath });

const app = express();
const PORT = process.env.PORT || 3001;

const defaultSettings = {
  provider: process.env.AI_PROVIDER || 'openrouter',
  model: process.env.AI_MODEL || 'google/gemini-2.0-flash-001',
  baseUrl: process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.AI_API_KEY || ''
};

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true }));

const upload = multer({ dest: path.join(rootDir, 'tmp') });

function loadEnvSettings() {
  return {
    provider: process.env.AI_PROVIDER || defaultSettings.provider,
    model: process.env.AI_MODEL || defaultSettings.model,
    baseUrl: process.env.AI_BASE_URL || defaultSettings.baseUrl,
    apiKey: process.env.AI_API_KEY || defaultSettings.apiKey,
  };
}

function writeSettingsToEnv(nextSettings) {
  const envLines = [];
  const current = { ...process.env };
  const keys = ['AI_PROVIDER', 'AI_MODEL', 'AI_BASE_URL', 'AI_API_KEY'];

  for (const key of keys) {
    if (key === 'AI_API_KEY') {
      envLines.push(`${key}=${(nextSettings.apiKey || '').replace(/\n/g, '')}`);
    } else if (key === 'AI_PROVIDER') {
      envLines.push(`${key}=${nextSettings.provider || current.AI_PROVIDER || 'openrouter'}`);
    } else if (key === 'AI_MODEL') {
      envLines.push(`${key}=${nextSettings.model || current.AI_MODEL || 'google/gemini-2.0-flash-001'}`);
    } else if (key === 'AI_BASE_URL') {
      envLines.push(`${key}=${nextSettings.baseUrl || current.AI_BASE_URL || 'https://openrouter.ai/api/v1'}`);
    }
  }

  const output = ['# Metodotsint AI configuration', ...envLines].join('\n');
  fs.writeFileSync(envPath, output + '\n', 'utf8');

  process.env.AI_PROVIDER = nextSettings.provider || process.env.AI_PROVIDER || 'openrouter';
  process.env.AI_MODEL = nextSettings.model || process.env.AI_MODEL || 'google/gemini-2.0-flash-001';
  process.env.AI_BASE_URL = nextSettings.baseUrl || process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1';
  process.env.AI_API_KEY = nextSettings.apiKey || process.env.AI_API_KEY || '';
}

function ensureProjectDir(projectId) {
  const dir = path.join(projectsRoot, projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function makeProjectMeta(project) {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    path: project.path,
  };
}

function walkFiles(dir, base = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const relativePath = path.join(base, entry.name).replace(/\\/g, '/');
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath, relativePath));
    } else {
      files.push({
        path: relativePath,
        name: entry.name,
        fullPath,
      });
    }
  }
  return files;
}

function readFileContent(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function buildSnapshot(projectId) {
  const projectDir = path.join(projectsRoot, projectId);
  const snapshotDir = path.join(backupsRoot, projectId);
  fs.mkdirSync(snapshotDir, { recursive: true });
  const zip = new AdmZip();
  zip.addLocalFolder(projectDir, 'project');
  const fileName = `backup-${Date.now()}.zip`;
  const zipPath = path.join(snapshotDir, fileName);
  zip.writeZip(zipPath);
  return zipPath;
}

function providerClient(provider, apiKey, baseUrl) {
  switch (provider) {
    case 'openai':
      return new OpenAI({ apiKey, baseURL: baseUrl || 'https://api.openai.com/v1' });
    case 'openrouter':
      return new OpenAI({ apiKey, baseURL: baseUrl || 'https://openrouter.ai/api/v1' });
    case 'gemini':
      return new OpenAI({ apiKey, baseURL: baseUrl || 'https://generativelanguage.googleapis.com/v1beta/openai' });
    case 'claude':
      return new Anthropic({ apiKey });
    default:
      return new OpenAI({ apiKey, baseURL: baseUrl || 'https://openrouter.ai/api/v1' });
  }
}

async function callProviderChat({ provider, apiKey, baseUrl, model, message, systemPrompt = 'Ты русскоязычный ассистент для Godot и GDScript.' }) {
  if (!apiKey) {
    throw new Error('API key отсутствует. Вставьте ключ в Настройках.');
  }

  if (provider === 'claude') {
    const client = providerClient(provider, apiKey, baseUrl);
    const response = await client.messages.create({
      model: model || 'claude-3-5-haiku-20241022',
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: message }],
    });
    const text = response.content?.map(part => part.text).join('\n') || '';
    return text;
  }

  const client = providerClient(provider, apiKey, baseUrl);
  const completion = await client.chat.completions.create({
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message },
    ],
    temperature: 0.7,
  });

  return completion.choices?.[0]?.message?.content || 'Нет ответа';
}

async function callProviderCode({ provider, apiKey, baseUrl, model, prompt, mode = 'generate' }) {
  if (!apiKey) {
    throw new Error('API key отсутствует. Вставьте ключ в Настройках.');
  }

  if (provider === 'claude') {
    const client = providerClient(provider, apiKey, baseUrl);
    const instruction = mode === 'fix'
      ? 'Исправь GDScript, сохрани логику, верни только исправленный код.'
      : 'Сгенерируй GDScript для Godot 4. Верни только код без лишнего текста.';

    const response = await client.messages.create({
      model: model || 'claude-3-5-haiku-20241022',
      max_tokens: 2000,
      system: instruction,
      messages: [{ role: 'user', content: prompt }],
    });
    return response.content?.map(part => part.text).join('\n') || '';
  }

  const client = providerClient(provider, apiKey, baseUrl);
  const completion = await client.chat.completions.create({
    model: model || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: mode === 'fix' ? 'Исправь GDScript и верни полностью готовый код.' : 'Генерируй GDScript для Godot. Верни только код.' },
      { role: 'user', content: prompt },
    ],
    temperature: mode === 'fix' ? 0.2 : 0.5,
  });

  return completion.choices?.[0]?.message?.content || '';
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, status: 'running', settings: loadEnvSettings() });
});

app.get('/api/settings', (req, res) => {
  res.json({
    provider: process.env.AI_PROVIDER || defaultSettings.provider,
    model: process.env.AI_MODEL || defaultSettings.model,
    baseUrl: process.env.AI_BASE_URL || defaultSettings.baseUrl,
    apiKeyConfigured: Boolean(process.env.AI_API_KEY),
  });
});

app.post('/api/settings', (req, res) => {
  const { provider, model, baseUrl, apiKey } = req.body || {};
  const nextSettings = {
    provider: provider || 'openrouter',
    model: model || 'google/gemini-2.0-flash-001',
    baseUrl: baseUrl || 'https://openrouter.ai/api/v1',
    apiKey: apiKey || '',
  };

  writeSettingsToEnv(nextSettings);
  res.json({ ok: true, settings: nextSettings, apiKeyConfigured: Boolean(nextSettings.apiKey) });
});

app.get('/api/projects', (req, res) => {
  const entries = fs.readdirSync(projectsRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => {
      const metaPath = path.join(projectsRoot, entry.name, '.metodotsint.json');
      let meta = { id: entry.name, name: entry.name, createdAt: null, updatedAt: null, path: path.join(projectsRoot, entry.name) };
      if (fs.existsSync(metaPath)) {
        meta = { ...meta, ...JSON.parse(fs.readFileSync(metaPath, 'utf8')) };
      }
      return meta;
    });
  res.json(entries);
});

app.post('/api/projects', (req, res) => {
  const { name } = req.body || {};
  const id = randomUUID();
  const projectPath = ensureProjectDir(id);
  const meta = {
    id,
    name: name || `project-${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    path: projectPath,
  };

  fs.writeFileSync(path.join(projectPath, '.metodotsint.json'), JSON.stringify(meta, null, 2));
  res.json({ ok: true, project: meta });
});

app.get('/api/projects/:id/files', (req, res) => {
  const projectDir = path.join(projectsRoot, req.params.id);
  if (!fs.existsSync(projectDir)) {
    return res.status(404).json({ error: 'Project not found' });
  }
  const files = walkFiles(projectDir);
  res.json(files);
});

app.get('/api/projects/:id/file', (req, res) => {
  const projectDir = path.join(projectsRoot, req.params.id);
  const filePath = path.join(projectDir, req.query.path || '');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.json({ content: readFileContent(filePath), path: req.query.path });
});

app.post('/api/projects/:id/file', (req, res) => {
  const { path: relPath, content } = req.body || {};
  const projectDir = path.join(projectsRoot, req.params.id);
  const filePath = path.join(projectDir, relPath || '');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content || '', 'utf8');
  buildSnapshot(req.params.id);
  res.json({ ok: true, path: relPath });
});

app.post('/api/projects/:id/create-file', (req, res) => {
  const { path: relPath, content = '' } = req.body || {};
  const projectDir = path.join(projectsRoot, req.params.id);
  const filePath = path.join(projectDir, relPath || '');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  res.json({ ok: true, path: relPath });
});

app.delete('/api/projects/:id/file', (req, res) => {
  const projectDir = path.join(projectsRoot, req.params.id);
  const relPath = req.query.path;
  const filePath = path.join(projectDir, relPath || '');
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }
  fs.unlinkSync(filePath);
  res.json({ ok: true });
});

app.post('/api/projects/:id/export-zip', (req, res) => {
  const projectDir = path.join(projectsRoot, req.params.id);
  const zipPath = path.join(backupsRoot, `${req.params.id}-${Date.now()}.zip`);
  const zip = new AdmZip();
  zip.addLocalFolder(projectDir, 'project');
  zip.writeZip(zipPath);
  res.json({ ok: true, downloadUrl: `/api/projects/${req.params.id}/download/${path.basename(zipPath)}` });
});

app.get('/api/projects/:id/download/:file', (req, res) => {
  const zipPath = path.join(backupsRoot, req.params.file);
  if (!fs.existsSync(zipPath)) {
    return res.status(404).json({ error: 'Archive not found' });
  }
  res.download(zipPath);
});

app.post('/api/projects/:id/import-zip', upload.single('zip'), (req, res) => {
  const projectDir = path.join(projectsRoot, req.params.id);
  const archivePath = req.file.path;
  if (!fs.existsSync(archivePath)) {
    return res.status(400).json({ error: 'zip file missing' });
  }
  const zip = new AdmZip(archivePath);
  zip.extractAllTo(projectDir, true);
  fs.unlinkSync(archivePath);
  res.json({ ok: true, message: 'ZIP imported' });
});

app.get('/api/projects/:id/backups', (req, res) => {
  const backupDir = path.join(backupsRoot, req.params.id);
  if (!fs.existsSync(backupDir)) return res.json([]);
  const files = fs.readdirSync(backupDir)
    .filter(file => file.endsWith('.zip'))
    .map(file => ({
      file,
      size: fs.statSync(path.join(backupDir, file)).size,
      updatedAt: new Date(fs.statSync(path.join(backupDir, file)).mtime).toISOString(),
    }));
  res.json(files);
});

app.post('/api/chat', async (req, res) => {
  try {
    const { message, systemPrompt } = req.body || {};
    const settings = loadEnvSettings();
    const reply = await callProviderChat({
      provider: settings.provider,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      message,
      systemPrompt: systemPrompt || 'Ты русскоязычный ассистент для Godot 4 и GDScript. Отвечай кратко, по делу, с примерами кода.'
    });
    res.json({ reply });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post('/api/generate-gdscript', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    const settings = loadEnvSettings();
    const code = await callProviderCode({
      provider: settings.provider,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      prompt,
      mode: 'generate'
    });
    res.json({ code });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.post('/api/fix-gdscript', async (req, res) => {
  try {
    const { prompt } = req.body || {};
    const settings = loadEnvSettings();
    const code = await callProviderCode({
      provider: settings.provider,
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
      prompt,
      mode: 'fix'
    });
    res.json({ code });
  } catch (error) {
    res.status(500).json({ error: String(error.message || error) });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Metodotsint AI server running on http://0.0.0.0:${PORT}`);
});
