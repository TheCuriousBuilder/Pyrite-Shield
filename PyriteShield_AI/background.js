// ============================================================
// PyriteShield AI v2.5.2
// ============================================================

const MENU_ITEMS = [
  { id: 'psai-explain', title: 'Pyrite AI: Explain', contexts: ['selection'] },
  { id: 'psai-rewrite', title: 'Pyrite AI: Rewrite', contexts: ['selection'] },
  { id: 'psai-summarize', title: 'Pyrite AI: Summarize selection', contexts: ['selection'] },
  { id: 'psai-translate', title: 'Pyrite AI: Translate', contexts: ['selection'] },
  { id: 'psai-ask', title: 'Pyrite AI: Ask about selection', contexts: ['selection'] },
  { id: 'psai-sum-page', title: 'Pyrite AI: Summarize this page', contexts: ['page', 'action'] },
  { id: 'psai-sum-video', title: 'Pyrite AI: Summarize this YouTube video', contexts: ['page', 'action', 'video'] }
];

chrome.runtime.onInstalled.addListener(() => {
  for (const m of MENU_ITEMS) {
    try {
      chrome.contextMenus.create({ id: m.id, title: m.title, contexts: m.contexts });
    } catch (_) {}
  }
  migrateSettings();
});

function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome|edge|about|chrome-extension|moz-extension|devtools):/i.test(url) ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com');
}

async function sendToTab(tab, payload) {
  if (!tab?.id || isRestrictedUrl(tab.url)) return;
  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch (_) {
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tab.id, payload);
    } catch (e) {
      console.warn('[Pyrite AI]', e);
    }
  }
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !String(info.menuItemId).startsWith('psai-')) return;
  const map = {
    'psai-explain': 'explain',
    'psai-rewrite': 'rewrite',
    'psai-summarize': 'summarize',
    'psai-translate': 'translate',
    'psai-ask': 'ask',
    'psai-sum-page': 'summarize_page',
    'psai-sum-video': 'summarize_video'
  };
  const mode = map[info.menuItemId];
  if (!mode) return;
  await sendToTab(tab, { type: 'PSAI_RUN', mode, selectionText: info.selectionText || '' });
});

// Keyboard shortcuts (see manifest.json "commands")
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const map = {
    'explain-selection': { mode: 'explain' },
    'summarize-selection': { mode: 'summarize' },
    'summarize-page': { mode: 'summarize_page' },
    'toggle-panel': { mode: 'toggle' }
  };
  const entry = map[command];
  if (!entry) return;
  await sendToTab(tab, { type: 'PSAI_RUN', mode: entry.mode, selectionText: '' });
});

// ============================================================
// Settings & profiles
// ============================================================

const DEFAULT_PROFILE = {
  id: 'default',
  name: 'Default',
  provider: 'openai_compatible',
  apiKey: '',
  model: 'llama-3.3-70b-versatile',
  baseUrl: 'https://api.groq.com/openai/v1'
};

// One-time migration from the old flat (single-profile) storage shape used
// in v1.x to the v2.5.2 multi-profile shape, so existing users' keys aren't lost.
async function migrateSettings() {
  const s = await chrome.storage.local.get(['profiles', 'apiKey', 'provider', 'model', 'baseUrl']);
  if (s.profiles) return; // already migrated
  const migrated = { ...DEFAULT_PROFILE };
  if (s.apiKey) migrated.apiKey = s.apiKey;
  if (s.provider) migrated.provider = s.provider;
  if (s.model) migrated.model = s.model;
  if (s.baseUrl) migrated.baseUrl = s.baseUrl;
  await chrome.storage.local.set({
    profiles: [migrated],
    activeProfileId: migrated.id
  });
}

async function getActiveProfile() {
  const s = await chrome.storage.local.get({ profiles: [DEFAULT_PROFILE], activeProfileId: 'default' });
  const profile = s.profiles.find((p) => p.id === s.activeProfileId) || s.profiles[0] || DEFAULT_PROFILE;
  const extra = await chrome.storage.local.get({ targetLang: 'English' });
  return { ...profile, targetLang: extra.targetLang };
}

// ============================================================
// History
// ============================================================

const HISTORY_LIMIT = 100;

async function logHistory(entry) {
  const s = await chrome.storage.local.get({ history: [] });
  const history = [{ id: crypto.randomUUID(), time: Date.now(), ...entry }, ...s.history].slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ history });
}

// ============================================================
// Prompt building
// ============================================================

function buildPrompt(mode, text, extra, pageUrl) {
  const base = (text || '').slice(0, 100000);
  const urlLine = pageUrl ? `Page URL: ${pageUrl}\n` : '';
  switch (mode) {
    case 'explain':
      return `${urlLine}Explain clearly:\n\n${base}`;
    case 'rewrite':
      return `${urlLine}Rewrite more clearly; keep meaning:\n\n${base}`;
    case 'summarize':
      return `${urlLine}Summarize in concise bullet points:\n\n${base}`;
    case 'translate':
      return `${urlLine}Translate into ${extra || 'English'}. Only output the translation:\n\n${base}`;
    case 'ask':
      return `${urlLine}Context:\n${base}\n\nQuestion: ${extra || 'What is this about?'}\n\nAnswer:`;
    case 'summarize_page':
      return `${urlLine}Summarize this page for a busy reader (short sections + bullets):\n\n${base}`;
    case 'summarize_video':
      return `${urlLine}You are summarizing a video from its spoken transcript and metadata (this is the actual spoken content, not just the title).\nProvide:\n1) One-line topic\n2) Key points (bullets)\n3) Important details\n4) Conclusion\n\n${base}`;
    default:
      return base;
  }
}

// ============================================================
// Non-streaming (used for connection test + simple one-shot calls)
// ============================================================

async function runModel(payload) {
  const profile = await getActiveProfile();
  if (!profile.apiKey?.trim()) {
    throw new Error('Add any API key in Options. Examples: Groq, OpenRouter, OpenAI, Gemini, or any OpenAI-compatible endpoint.');
  }
  const extra = payload.extra || (payload.mode === 'translate' ? profile.targetLang : '');
  const prompt = buildPrompt(payload.mode, payload.text, extra, payload.pageUrl);
  if (profile.provider === 'gemini') return callGemini(profile, prompt);
  return callOpenAICompatible(profile, prompt);
}

async function callGemini(profile, prompt) {
  const model = profile.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(profile.apiKey.trim())}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyApiError(res.status, data?.error?.message));
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

function openAIHeaders(profile) {
  const base = (profile.baseUrl || '').toLowerCase();
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${profile.apiKey.trim()}`
  };
  // OpenRouter requires Referer + X-Title or many requests fail
  if (base.includes('openrouter.ai')) {
    headers['HTTP-Referer'] = 'https://github.com/TheCuriousBuilder/Pyrite-Shield';
    headers['X-Title'] = 'PyriteShield AI';
  }
  return headers;
}

async function callOpenAICompatible(profile, prompt) {
  const base = (profile.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: openAIHeaders(profile),
    body: JSON.stringify({
      model: profile.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(friendlyApiError(res.status, data?.error?.message || data?.message));
  }
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Empty response');
  return text.trim();
}

function friendlyApiError(status, rawMessage) {
  if (status === 401 || status === 403) return 'API key rejected — check it\'s correct and active in Options.';
  if (status === 429) return 'Rate limited by the provider — wait a moment and try again.';
  if (status >= 500) return 'The AI provider is having issues right now — try again shortly.';
  return rawMessage || `Request failed (${status})`;
}

// ============================================================
// Streaming via long-lived Port (content.js <-> background.js)
// ============================================================

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'psai-stream') return;
  let controller = null;

  port.onMessage.addListener(async (msg) => {
    if (msg.type === 'CANCEL') {
      controller?.abort();
      return;
    }
    if (msg.type !== 'START') return;
    controller = new AbortController();
    try {
      const profile = await getActiveProfile();
      if (!profile.apiKey?.trim()) {
        port.postMessage({ type: 'ERROR', error: 'Add any API key in Options first.' });
        return;
      }
      const extra = msg.payload.extra || (msg.payload.mode === 'translate' ? profile.targetLang : '');
      const prompt = buildPrompt(msg.payload.mode, msg.payload.text, extra, msg.payload.pageUrl);
      let full = '';
      const onDelta = (delta) => {
        full += delta;
        try { port.postMessage({ type: 'CHUNK', text: delta }); } catch (_) {}
      };
      if (profile.provider === 'gemini') {
        await streamGemini(profile, prompt, onDelta, controller.signal);
      } else {
        await streamOpenAICompatible(profile, prompt, onDelta, controller.signal);
      }
      if (!full.trim()) throw new Error('Empty response');
      port.postMessage({ type: 'DONE', text: full.trim() });
      logHistory({
        mode: msg.payload.mode,
        inputSnippet: (msg.payload.text || '').slice(0, 200),
        output: full.trim(),
        pageUrl: msg.payload.pageUrl || '',
        provider: profile.provider,
        model: profile.model
      });
    } catch (e) {
      if (e.name === 'AbortError') {
        try { port.postMessage({ type: 'CANCELLED' }); } catch (_) {}
      } else {
        try { port.postMessage({ type: 'ERROR', error: e.message || String(e) }); } catch (_) {}
      }
    }
  });
});

async function streamOpenAICompatible(profile, prompt, onDelta, signal) {
  const base = (profile.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    signal,
    headers: openAIHeaders(profile),
    body: JSON.stringify({ model: profile.model || 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], temperature: 0.4, stream: true })
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(friendlyApiError(res.status, data?.error?.message));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        const json = JSON.parse(data);
        const delta = json?.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
      } catch (_) {}
    }
  }
}

async function streamGemini(profile, prompt, onDelta, signal) {
  const model = profile.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(profile.apiKey.trim())}`;
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } })
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(friendlyApiError(res.status, data?.error?.[0]?.message || data?.error?.message));
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const data = trimmed.slice(5).trim();
      if (!data) continue;
      try {
        const json = JSON.parse(data);
        const parts = json?.candidates?.[0]?.content?.parts || [];
        const delta = parts.map((p) => p.text || '').join('');
        if (delta) onDelta(delta);
      } catch (_) {}
    }
  }
}

// ============================================================
// One-shot messages (test connection, non-streaming generate, history ops)
// ============================================================

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PSAI_GENERATE') {
    runModel(msg.payload).then((text) => sendResponse({ ok: true, text })).catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
  if (msg?.type === 'PSAI_TEST_CONNECTION') {
    testConnection(msg.profile).then((r) => sendResponse(r));
    return true;
  }
  if (msg?.type === 'PSAI_GET_HISTORY') {
    chrome.storage.local.get({ history: [] }).then((s) => sendResponse(s.history));
    return true;
  }
  if (msg?.type === 'PSAI_CLEAR_HISTORY') {
    chrome.storage.local.set({ history: [] }).then(() => sendResponse({ ok: true }));
    return true;
  }
});

async function testConnection(profile) {
  const start = Date.now();
  try {
    if (!profile.apiKey?.trim()) return { ok: false, error: 'No API key entered.' };
    const text = profile.provider === 'gemini'
      ? await callGemini(profile, 'Reply with exactly: OK')
      : await callOpenAICompatible(profile, 'Reply with exactly: OK');
    return { ok: true, ms: Date.now() - start, sample: text.slice(0, 40) };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
