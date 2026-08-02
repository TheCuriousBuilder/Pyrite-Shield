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
});

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
  const payload = { type: 'PSAI_RUN', mode, selectionText: info.selectionText || '' };
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
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PSAI_GENERATE') {
    runModel(msg.payload)
      .then((text) => sendResponse({ ok: true, text }))
      .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
    return true;
  }
});

async function getSettings() {
  return chrome.storage.local.get({
    provider: 'openai_compatible',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
    targetLang: 'English'
  });
}

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

async function runModel(payload) {
  const settings = await getSettings();
  if (!settings.apiKey?.trim()) {
    throw new Error('Add any API key in Options. Examples: Groq, OpenRouter, OpenAI, Gemini, or any OpenAI-compatible endpoint.');
  }
  const prompt = buildPrompt(payload.mode, payload.text, payload.extra, payload.pageUrl);
  const provider = settings.provider || 'openai_compatible';

  if (provider === 'gemini') {
    return callGemini(settings, prompt);
  }
  // Default: any OpenAI-compatible API (Groq, OpenRouter, Together, OpenAI, local, etc.)
  return callOpenAICompatible(settings, prompt);
}

async function callGemini(settings, prompt) {
  const model = settings.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey.trim())}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.4 }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || res.statusText || 'Gemini failed');
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
  if (!text) throw new Error('Empty response from Gemini');
  return text.trim();
}

async function callOpenAICompatible(settings, prompt) {
  const base = (settings.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey.trim()}`
    },
    body: JSON.stringify({
      model: settings.model || 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || res.statusText || 'API request failed');
  const text = data?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('Empty response');
  return text.trim();
}
