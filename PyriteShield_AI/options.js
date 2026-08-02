const $ = (id) => document.getElementById(id);

const PRESETS = {
  groq: { baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  openrouter: { baseUrl: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }
};

async function load() {
  const s = await chrome.storage.local.get({
    provider: 'openai_compatible',
    apiKey: '',
    model: 'llama-3.3-70b-versatile',
    baseUrl: 'https://api.groq.com/openai/v1',
    targetLang: 'English'
  });
  $('provider').value = s.provider;
  $('apiKey').value = s.apiKey;
  $('model').value = s.model;
  $('baseUrl').value = s.baseUrl;
  $('targetLang').value = s.targetLang;
}

$('save').onclick = async () => {
  await chrome.storage.local.set({
    provider: $('provider').value,
    apiKey: $('apiKey').value.trim(),
    model: $('model').value.trim(),
    baseUrl: $('baseUrl').value.trim(),
    targetLang: $('targetLang').value.trim() || 'English'
  });
  $('msg').textContent = 'Saved.';
  clearTimeout(window.__psaiMsgTimer);
  window.__psaiMsgTimer = setTimeout(() => { $('msg').textContent = ''; }, 2500);
};

document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = PRESETS[btn.getAttribute('data-preset')];
    if (!preset) return;
    $('provider').value = 'openai_compatible';
    $('baseUrl').value = preset.baseUrl;
    $('model').value = preset.model;
    $('msg').textContent = `Filled in ${btn.textContent} settings — add your API key and Save.`;
  });
});

load();
