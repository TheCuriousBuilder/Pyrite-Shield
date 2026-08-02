const $ = (id) => document.getElementById(id);

const PRESETS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
};

const DEFAULT_PROFILE = () => ({
  id: crypto.randomUUID(),
  name: 'New profile',
  provider: 'openai_compatible',
  apiKey: '',
  model: 'llama-3.3-70b-versatile',
  baseUrl: 'https://api.groq.com/openai/v1'
});

let profiles = [];
let activeId = null;

function setMsg(text, kind) {
  const el = $('msg');
  el.textContent = text;
  el.className = kind || '';
  clearTimeout(window.__psaiMsgTimer);
  if (kind !== 'err') {
    window.__psaiMsgTimer = setTimeout(() => { el.textContent = ''; el.className = ''; }, 4000);
  }
}

async function load() {
  const s = await chrome.storage.local.get({ profiles: [], activeProfileId: null, targetLang: 'English' });
  profiles = s.profiles.length ? s.profiles : [DEFAULT_PROFILE()];
  activeId = s.activeProfileId && profiles.some((p) => p.id === s.activeProfileId) ? s.activeProfileId : profiles[0].id;
  $('targetLang').value = s.targetLang || 'English';
  renderChips();
  fillFormFromActive();
}

function renderChips() {
  $('profileChips').innerHTML = profiles.map((p) => `
    <span class="profile-chip ${p.id === activeId ? 'active' : ''}" data-id="${p.id}">
      ${escapeHtml(p.name || 'Untitled')}
    </span>
  `).join('');
  $('profileChips').querySelectorAll('.profile-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      activeId = chip.getAttribute('data-id');
      renderChips();
      fillFormFromActive();
    });
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fillFormFromActive() {
  const p = profiles.find((x) => x.id === activeId) || profiles[0];
  $('profileName').value = p.name || '';
  $('provider').value = p.provider || 'openai_compatible';
  $('apiKey').value = p.apiKey || '';
  $('model').value = p.model || '';
  $('baseUrl').value = p.baseUrl || '';
}

function readFormIntoActive() {
  const p = profiles.find((x) => x.id === activeId);
  if (!p) return;
  p.name = $('profileName').value.trim() || 'Untitled';
  p.provider = $('provider').value;
  p.apiKey = $('apiKey').value.trim();
  p.model = $('model').value.trim();
  p.baseUrl = $('baseUrl').value.trim();
}

$('newProfile').addEventListener('click', () => {
  const p = DEFAULT_PROFILE();
  profiles.push(p);
  activeId = p.id;
  renderChips();
  fillFormFromActive();
  setMsg('New profile added — fill it in and Save.');
});

$('deleteProfile').addEventListener('click', async () => {
  if (profiles.length <= 1) {
    setMsg('At least one profile is required.', 'err');
    return;
  }
  profiles = profiles.filter((p) => p.id !== activeId);
  activeId = profiles[0].id;
  await chrome.storage.local.set({ profiles, activeProfileId: activeId });
  renderChips();
  fillFormFromActive();
  setMsg('Profile deleted.');
});

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = PRESETS[btn.getAttribute('data-preset')];
    if (!preset) return;
    $('provider').value = 'openai_compatible';
    $('baseUrl').value = preset.baseUrl;
    $('model').value = preset.model;
    setMsg(`Filled in ${btn.textContent} settings — add your API key and Save.`);
  });
});

$('save').addEventListener('click', async () => {
  readFormIntoActive();
  await chrome.storage.local.set({ profiles, activeProfileId: activeId, targetLang: $('targetLang').value.trim() || 'English' });
  renderChips();
  setMsg('Saved.', 'ok');
});

$('test').addEventListener('click', async () => {
  readFormIntoActive();
  const p = profiles.find((x) => x.id === activeId);
  setMsg('Testing…');
  $('test').disabled = true;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'PSAI_TEST_CONNECTION', profile: p });
    if (res.ok) setMsg(`✓ Connected (${res.ms}ms) — replied: "${res.sample}"`, 'ok');
    else setMsg(`✗ ${res.error}`, 'err');
  } catch (e) {
    setMsg(`✗ ${e.message || e}`, 'err');
  } finally {
    $('test').disabled = false;
  }
});

load();
