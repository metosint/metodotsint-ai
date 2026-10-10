import { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import {
  FolderOpen,
  FileCode2,
  Sparkles,
  FolderPlus,
  HardDriveUpload,
  Download,
  Save,
  Undo2,
  Redo2,
  Settings,
  Plus,
  Folder,
  MessageSquareText,
  ArrowLeft,
  Copy,
  Trash2,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  FileText,
  Bot,
  Smartphone,
  History
} from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TABS = [
  { key: 'code', label: 'Код', icon: FileCode2 },
  { key: 'projects', label: 'Проекты', icon: FolderKanban },
  { key: 'settings', label: 'Настройки', icon: Settings },
];

const providerOptions = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'claude', label: 'Claude' },
];

const DEMO_MODE = {
  welcome: 'Привет. Опиши механику или покажи участок кода — разберём вместе.'
};

async function request(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || 'Request failed');
  }
  return body;
}

function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [files, setFiles] = useState([]);
  const [activeFile, setActiveFile] = useState(null);
  const [codeValue, setCodeValue] = useState('');
  const [editorDirty, setEditorDirty] = useState(false);
  const [tab, setTab] = useState('code');
  const [aiMode, setAiMode] = useState('chat');
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: DEMO_MODE.welcome }
  ]);
  const [settings, setSettings] = useState({ provider: 'openrouter', model: 'google/gemini-2.0-flash-001', apiKey: '', baseUrl: 'https://openrouter.ai/api/v1' });
  const [projectName, setProjectName] = useState('');
  const [loading, setLoading] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [backups, setBackups] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const editorRef = useRef(null);

  useEffect(() => { fetchProjects(); fetchSettings(); }, []);

  useEffect(() => {
    if (!selectedProjectId) return;
    fetchProjectFiles(selectedProjectId);
    loadBackups(selectedProjectId);
  }, [selectedProjectId]);

  useEffect(() => {
    if (!activeFile && files.length) {
      setActiveFile(files[0].path);
    }
  }, [files, activeFile]);

  useEffect(() => {
    if (!activeFile || !selectedProjectId) return;
    loadFile(selectedProjectId, activeFile);
  }, [selectedProjectId, activeFile]);

  const projectLabel = useMemo(() => {
    const p = projects.find(item => item.id === selectedProjectId);
    return p?.name || 'Методсинт';
  }, [projects, selectedProjectId]);

  async function fetchProjects() {
    try {
      const data = await request('/api/projects');
      setProjects(data);
      if (data.length && !selectedProjectId) {
        setSelectedProjectId(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchSettings() {
    try {
      const data = await request('/api/settings');
      setSettings(prev => ({ ...prev, provider: data.provider, model: data.model, baseUrl: data.baseUrl }));
    } catch (e) {
      console.error(e);
    }
  }

  async function fetchProjectFiles(projectId) {
    try {
      const data = await request(`/api/projects/${projectId}/files`);
      setFiles(data);
      if (data.length && !activeFile) setActiveFile(data[0].path);
    } catch (e) {
      console.error(e);
    }
  }

  async function loadFile(projectId, filePath) {
    try {
      const data = await request(`/api/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`);
      setCodeValue(data.content || '');
      setEditorDirty(false);
      setHistory(prev => {
        const next = [...prev, data.content];
        return next.slice(-50);
      });
      setHistoryIndex(prev => Math.max(prev, 0));
    } catch (e) {
      console.error(e);
      setCodeValue('');
    }
  }

  async function saveCurrentFile() {
    if (!selectedProjectId || !activeFile) return;
    try {
      const payload = { path: activeFile, content: codeValue };
      await request(`/api/projects/${selectedProjectId}/file`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      setEditorDirty(false);
      setStatusText('Сохранено локально');
    } catch (e) {
      setStatusText('Ошибка сохранения');
      console.error(e);
    }
  }

  async function createProject() {
    const name = projectName.trim() || `project-${Date.now()}`;
    try {
      const data = await request('/api/projects', {
        method: 'POST',
        body: JSON.stringify({ name })
      });
      setProjectName('');
      setSelectedProjectId(data.project.id);
      await fetchProjects();
      setTab('code');
    } catch (e) {
      console.error(e);
    }
  }

  async function importZip(file) {
    if (!selectedProjectId) return;
    const form = new FormData();
    form.append('zip', file);
    try {
      await fetch(`${API_URL}/api/projects/${selectedProjectId}/import-zip`, {
        method: 'POST',
        body: form
      });
      fetchProjectFiles(selectedProjectId);
      setStatusText('ZIP импортирован');
    } catch (e) {
      console.error(e);
    }
  }

  async function exportZip() {
    if (!selectedProjectId) return;
    try {
      const data = await request(`/api/projects/${selectedProjectId}/export-zip`, { method: 'POST' });
      const url = `${API_URL}${data.downloadUrl}`;
      window.open(url, '_blank');
    } catch (e) {
      console.error(e);
    }
  }

  async function loadBackups(projectId) {
    try {
      const data = await request(`/api/projects/${projectId}/backups`);
      setBackups(data);
    } catch (e) {
      console.error(e);
    }
  }

  async function saveSettings() {
    try {
      await request('/api/settings', {
        method: 'POST',
        body: JSON.stringify(settings)
      });
      setStatusText('Настройки сохранены на сервере');
    } catch (e) {
      setStatusText('Ошибка сохранения настроек');
      console.error(e);
    }
  }

  async function handleAiAction(type) {
    if (!chatInput.trim()) return;
    const prompt = chatInput.trim();
    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', text: prompt }]);
    setLoading(true);

    try {
      const endpoint = type === 'generate' ? '/api/generate-gdscript' : type === 'fix' ? '/api/fix-gdscript' : '/api/chat';
      const body = type === 'chat'
        ? { message: prompt, systemPrompt: 'Ты русскоязычный ассистент для Godot 4 и GDScript.' }
        : { prompt: type === 'fix' ? `Исправь код:\n${codeValue}\n\nЗапрос:\n${prompt}` : prompt };

      const response = await request(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const replyText = response.reply || response.code || 'Готово.';
      setChatMessages(prev => [...prev, { role: 'assistant', text: replyText }]);

      if (type === 'generate' || type === 'fix') {
        setCodeValue(replyText);
        setEditorDirty(true);
      }
    } catch (e) {
      setChatMessages(prev => [...prev, { role: 'assistant', text: `Ошибка: ${e.message}` }]);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handleEditorChange(newValue) {
    setCodeValue(newValue);
    setEditorDirty(true);
  }

  function undoHistory() {
    setHistoryIndex(prev => {
      const next = Math.max(prev - 1, 0);
      const value = history[next] ?? codeValue;
      setCodeValue(value);
      return next;
    });
  }

  function redoHistory() {
    setHistoryIndex(prev => {
      const next = Math.min(prev + 1, history.length - 1);
      const value = history[next] ?? codeValue;
      setCodeValue(value);
      return next;
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="logo-wrap">
          <div className="brand">Metodotsint</div>
          <div className="brand accent">AI</div>
          <div className="sl">/</div>
        </div>

        <button className="projects-button" onClick={() => setTab('projects')}>
          <FolderOpen size={18} />
          <span>Мои проекты</span>
        </button>
      </header>

      {tab === 'projects' && (
        <main className="workspace projects-screen">
          <div className="title-block">
            <p className="eyebrow">МАСТЕРСКАЯ</p>
            <h1>Ваши проекты</h1>
            <p className="muted">Проекты и резервные копии сохраняются в IndexedDB этого браузера.</p>
          </div>

          <div className="toolbar-row">
            <label className="pill ghost file-upload">
              <HardDriveUpload size={18} />
              <span>Импорт ZIP</span>
              <input type="file" accept=".zip" onChange={(e) => importZip(e.target.files?.[0])} />
            </label>
            <button className="pill primary" onClick={createProject}>
              <Plus size={18} />
              <span>Новый проект</span>
            </button>
          </div>

          <div className="project-list-header">
            {projects.length} проектов • локальное хранилище
          </div>

          <div className="project-card-list">
            {projects.length === 0 ? (
              <div className="empty-box">Создайте первый проект</div>
            ) : (
              projects.map(project => (
                <div className="project-card" key={project.id} onClick={() => { setSelectedProjectId(project.id); setTab('code'); }}>
                  <div className="project-badge">{project.name.slice(0, 2).toUpperCase() || 'IS'}</div>
                  <div className="project-meta">
                    <div className="project-title">{project.name}</div>
                    <div className="project-sub">Обновлён {new Date(project.updatedAt || project.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div className="project-actions">
                    <button onClick={(e) => { e.stopPropagation(); setSelectedProjectId(project.id); setTab('code'); }}>Открыть</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </main>
      )}

      {tab === 'code' && (
        <main className="workspace editor-shell">
          <div className="editor-header">
            <div className="editor-brand-row">
              <div className="brand mini">Metodotsint</div>
              <div className="accent mini">AI</div>
            </div>

            <div className="status-row">
              <div className="save-pill green">{editorDirty ? 'Есть несохранённые изменения' : 'Сохранено локально'}</div>
              <button className="icon-button" onClick={saveCurrentFile} title="Сохранить"><Save size={18} /></button>
            </div>
          </div>

          <div className="file-toolbar">
            <div className="file-list-wrap">
              <div className="file-list-title">Файлы проекта</div>
              <div className="file-list-row">
                {files.map(file => (
                  <button
                    key={file.path}
                    className={`file-tab ${activeFile === file.path ? 'active' : ''}`}
                    onClick={() => setActiveFile(file.path)}
                  >
                    <FileText size={16} />
                    <span>{file.name}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="create-file-box">
              <button className="small-action" onClick={() => {
                const fileName = window.prompt('Название файла', 'new_file.gd');
                if (!fileName || !selectedProjectId) return;
                request(`/api/projects/${selectedProjectId}/create-file`, {
                  method: 'POST',
                  body: JSON.stringify({ path: fileName, content: '' })
                }).then(() => fetchProjectFiles(selectedProjectId));
              }}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div className="editor-card">
            <div className="editor-topbar">
              <div className="editor-path">{activeFile || 'scripts/player.gd'}</div>
              <div className="mini-actions">
                <button className="icon-button" onClick={undoHistory}><Undo2 size={16} /></button>
                <button className="icon-button" onClick={redoHistory}><Redo2 size={16} /></button>
              </div>
            </div>

            <Editor
              height="48vh"
              language="gdscript"
              value={codeValue}
              onChange={handleEditorChange}
              onMount={(editor) => {
                editorRef.current = editor;
                editor.updateOptions({
                  fontSize: 18,
                  minimap: { enabled: false },
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                  lineNumbersMinChars: 3,
                  roundedSelection: false,
                  padding: { top: 12, bottom: 12 },
                  smoothScrolling: true,
                  scrollBeyondLastLine: false,
                });
              }}
              theme="vs-dark"
            />

            <div className="editor-footer">
              <span>Текст • UTF-8</span>
              <span>{codeValue.split('\n').length} строк • {codeValue.length} знаков</span>
            </div>
          </div>

          <div className="ai-panel">
            <div className="ai-header">
              <div className="ai-badge"><Bot size={18} /></div>
              <h2>AI-помощник</h2>
            </div>

            <div className="ai-toggle">
              <button className={aiMode === 'chat' ? 'active' : ''} onClick={() => setAiMode('chat')}>Чат</button>
              <button className={aiMode === 'generate' ? 'active' : ''} onClick={() => setAiMode('generate')}>Создать</button>
              <button className={aiMode === 'fix' ? 'active' : ''} onClick={() => setAiMode('fix')}>Исправить</button>
            </div>

            <div className="chat-box">
              {chatMessages.map((msg, idx) => (
                <div key={idx} className={`message ${msg.role}`}>
                  {msg.text}
                </div>
              ))}
            </div>

            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Спросите про GDScript..."
              rows={4}
            />

            <div className="send-row">
              <span>Enter — отправить • Shift+Enter — новая строка</span>
              <button className="submit-button" onClick={() => handleAiAction(aiMode)} disabled={loading}>
                {loading ? '...' : 'Спросить'}
              </button>
            </div>
          </div>
        </main>
      )}

      {tab === 'settings' && (
        <main className="workspace settings-screen">
          <div className="settings-header">
            <div className="ai-badge"><Settings size={18} /></div>
            <h2>Настройки</h2>
          </div>

          <div className="settings-grid">
            <label>
              <span>Провайдер</span>
              <select value={settings.provider} onChange={(e) => setSettings({ ...settings, provider: e.target.value })}>
                {providerOptions.map(option => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <label>
              <span>Модель</span>
              <input value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })} />
            </label>

            <label>
              <span>Base URL</span>
              <input value={settings.baseUrl} onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })} />
            </label>

            <label>
              <span>API key</span>
              <input type="password" value={settings.apiKey} onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })} placeholder="sk-..." />
            </label>
          </div>

          <div className="settings-actions">
            <button className="pill primary" onClick={saveSettings}>Сохранить на сервере</button>
          </div>

          <div className="backups-panel">
            <h3>Резервные копии</h3>
            {backups.length === 0 ? <p>Нет резервных копий</p> : backups.map(backup => (
              <div className="backup-row" key={backup.file}>
                <span>{backup.file}</span>
                <a href={`${API_URL}/api/projects/${selectedProjectId}/download/${backup.file}`} target="_blank" rel="noreferrer">Скачать</a>
              </div>
            ))}
          </div>
        </main>
      )}

      <div className="bottom-nav">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} className={`nav-item ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            <Icon size={22} />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default App;
