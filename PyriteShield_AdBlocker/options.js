// ============================================================
// Pyrite Shield v7.5.8 Page
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);

  // Settings checkboxes
  const blockYouTube = $('blockYouTube');
  const blockFacebook = $('blockFacebook');
  const blockTwitch = $('blockTwitch');
  const blockAnalytics = $('blockAnalytics');
  const antiAdblock = $('antiAdblock');
  const blockCryptominers = $('blockCryptominers');
  const whitelistInput = $('whitelistInput');
  const addWhitelistBtn = $('addWhitelistBtn');
  const whitelistList = $('whitelistList');
  const clearWhitelistBtn = $('clearWhitelistBtn');
  const exportBtn = $('exportBtn');
  const importBtn = $('importBtn');
  const resetStatsBtn = $('resetStatsBtn');
  const savedMsg = $('savedMsg');

  function showSaved() {
    savedMsg.style.display = 'block';
    setTimeout(() => { savedMsg.style.display = 'none'; }, 2000);
  }

  // Load settings
  chrome.storage.local.get([
    'blockYouTube', 'blockFacebook', 'blockTwitch',
    'blockAnalytics', 'antiAdblock', 'blockCryptominers'
  ], (result) => {
    blockYouTube.checked = result.blockYouTube !== false;
    blockFacebook.checked = result.blockFacebook !== false;
    blockTwitch.checked = result.blockTwitch !== false;
    blockAnalytics.checked = result.blockAnalytics !== false;
    antiAdblock.checked = result.antiAdblock !== false;
    blockCryptominers.checked = result.blockCryptominers !== false;
  });

  // Save settings when changed
  [blockYouTube, blockFacebook, blockTwitch, blockAnalytics, antiAdblock, blockCryptominers].forEach((cb) => {
    cb.addEventListener('change', () => {
      chrome.storage.local.set({
        blockYouTube: blockYouTube.checked,
        blockFacebook: blockFacebook.checked,
        blockTwitch: blockTwitch.checked,
        blockAnalytics: blockAnalytics.checked,
        antiAdblock: antiAdblock.checked,
        blockCryptominers: blockCryptominers.checked
      }, showSaved);
    });
  });

  const esc = (s) => {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  };

  function renderWhitelist(arr) {
    whitelistList.innerHTML = '';
    if (!arr || !arr.length) {
      whitelistList.innerHTML = '<li style="color:#6c6e8a;font-style:italic;padding:8px;">No sites whitelisted</li>';
      return;
    }
    for (const host of arr) {
      const li = document.createElement('li');
      li.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#1a1a2e;border:1px solid #2d3748;border-radius:6px;font-size:13px;';
      li.innerHTML = `<span style="color:#a0a0b8;max-width:500px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(host)}</span>
                      <button class="remove-wl" data-host="${esc(host)}" style="background:none;border:none;color:#e53e3e;cursor:pointer;font-size:16px;opacity:0.5;">✕</button>`;
      li.querySelector('.remove-wl').addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ action: 'whitelistRemove', hostname: host });
        const res = await chrome.runtime.sendMessage({ action: 'getWhitelist' });
        renderWhitelist(res.whitelist);
      });
      whitelistList.appendChild(li);
    }
  }

  // Load whitelist
  async function loadWhitelist() {
    const res = await chrome.runtime.sendMessage({ action: 'getWhitelist' });
    renderWhitelist(res.whitelist);
  }
  loadWhitelist();

  addWhitelistBtn.addEventListener('click', async () => {
    let host = whitelistInput.value.trim().toLowerCase();
    if (!host) return;
    host = host.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
    if (!host) return;
    await chrome.runtime.sendMessage({ action: 'whitelistAdd', hostname: host });
    whitelistInput.value = '';
    const res = await chrome.runtime.sendMessage({ action: 'getWhitelist' });
    renderWhitelist(res.whitelist);
    showSaved();
  });

  whitelistInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWhitelistBtn.click();
  });

  clearWhitelistBtn.addEventListener('click', async () => {
    if (!confirm('⚠️ Remove ALL whitelisted sites?')) return;
    const res = await chrome.runtime.sendMessage({ action: 'getWhitelist' });
    for (const host of (res.whitelist || [])) {
      await chrome.runtime.sendMessage({ action: 'whitelistRemove', hostname: host });
    }
    renderWhitelist([]);
    showSaved();
  });

  exportBtn.addEventListener('click', async () => {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'exportStats' });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pyrite-whitelist-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { alert('Export failed'); }
  });

  importBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.whitelist && Array.isArray(data.whitelist)) {
          await chrome.runtime.sendMessage({ action: 'importWhitelist', whitelist: data.whitelist });
          const res = await chrome.runtime.sendMessage({ action: 'getWhitelist' });
          renderWhitelist(res.whitelist);
          showSaved();
        } else {
          alert('No whitelist data found in file');
        }
      } catch { alert('Invalid file format'); }
    };
    input.click();
  });

  resetStatsBtn.addEventListener('click', async () => {
    if (!confirm('⚠️ This will reset ALL blocked counts permanently. Continue?')) return;
    await chrome.runtime.sendMessage({ action: 'resetAllStats' });
    showSaved();
  });
});

