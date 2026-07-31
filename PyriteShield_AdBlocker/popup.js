// ============================================================
// Pyrite Shield v7.5.8 Controller (AdBlock-like UI)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const toggleLabel = $('toggleLabel');
  const toggleCheck = $('toggleCheckbox');
  const pageBlockedEl = $('pageBlocked');
  const totalBlockedEl = $('totalBlocked');
  const domainListEl = $('domainList');
  const currentDomainEl = $('currentDomain');
  const siteStatusBadge = $('siteStatusBadge');
  const pauseSiteBtn = $('pauseSiteBtn');
  const zapperBtn = $('zapperBtn');
  const undoZapBtn = $('undoZapBtn');
  const reportBtn = $('reportBtn');
  const reportMenu = $('reportMenu');
  const reportAdBtn = $('reportAdBtn');
  const reportUnsafeBtn = $('reportUnsafeBtn');
  const toastEl = $('toast');
  const optionsLink = $('optionsLink');
  const whitelistLink = $('whitelistLink');
  const supportLink = $('supportLink');
  const supportMenu = $('supportMenu');
  const supportBugBtn = $('supportBug');
  const supportSiteBrokenBtn = $('supportSiteBroken');
  const supportFeatureBtn = $('supportFeature');
  const clearStatsBtn = $('clearStatsBtn');
  const historyPauseBtn = $('historyPauseBtn');
  const clearHistoryBtn = $('clearHistoryBtn');
  const historyHint = $('historyHint');
  const clearExtHistoryBtn = $('clearExtHistoryBtn');
  const extHistoryList = $('extHistoryList');
  const brandVersionEl = $('brandVersion');
  const footerBrandEl = $('footerBrand');

  let toastTimeout = null;
  let zapperActive = false;
  let currentHostname = '';
  let isSiteWhitelisted = false;

  const extVersion = chrome.runtime.getManifest().version;
  brandVersionEl.textContent = `v${extVersion}`;
  footerBrandEl.textContent = `✦ Pyrite Shield v${extVersion}`;

  function showToast(msg, dur = 2000) {
    if (toastTimeout) clearTimeout(toastTimeout);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    toastTimeout = setTimeout(() => toastEl.classList.remove('show'), dur);
  }

  const fmt = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n);

  const esc = (s) => {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  };

  function setToggleUI(enabled) {
    toggleLabel.textContent = enabled ? 'ON' : 'OFF';
    toggleLabel.classList.toggle('off', !enabled);
    toggleCheck.checked = enabled;
  }

  function updateSiteInfo(hostname, whitelisted, tabBlocked) {
    currentHostname = hostname || 'Unknown';
    isSiteWhitelisted = whitelisted;
    currentDomainEl.textContent = currentHostname;
    if (whitelisted) {
      siteStatusBadge.textContent = 'Paused';
      siteStatusBadge.className = 'status-badge paused';
      pauseSiteBtn.textContent = '▶ Resume';
    } else {
      siteStatusBadge.textContent = 'Active';
      siteStatusBadge.className = 'status-badge active';
      pauseSiteBtn.textContent = '⏸ Pause';
    }
    pageBlockedEl.textContent = fmt(tabBlocked || 0);
  }

  function renderDomains(map) {
    const entries = Object.entries(map).sort((a,b) => b[1]-a[1]).slice(0, 8);
    domainListEl.innerHTML = '';
    if (!entries.length) {
      domainListEl.innerHTML = '<li class="domain-empty">No domains blocked yet — browse the web!</li>';
      return;
    }
    for (const [domain, count] of entries) {
      const li = document.createElement('li');
      li.className = 'domain-item';
      li.innerHTML = `<span class="domain-name" title="${esc(domain)}">${esc(domain)}</span>
                      <span class="domain-count">${count}</span>`;
      domainListEl.appendChild(li);
    }
  }

  // Must match the ruleset ids declared in manifest.json / background.js.
  // A prior version referenced a nonexistent 'ruleset_1', which meant the
  // master ON/OFF switch never actually enabled or disabled the rulesets.
  const RULESETS = ['ads', 'privacy', 'anti_circumvention', 'annoyances', 'cryptominers', 'social'];

  async function loadState() {
    try {
      const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
      // Consider the blocker "on" if any of our rulesets are enabled, so a
      // partially-enabled state (e.g. mid-toggle) still reads correctly.
      setToggleUI(RULESETS.some((id) => enabled.includes(id)));

      // Get current tab info
      chrome.runtime.sendMessage({ action: 'getCurrentSiteInfo' }, (siteInfo) => {
        if (siteInfo) {
          updateSiteInfo(siteInfo.hostname, siteInfo.isWhitelisted, siteInfo.tabBlocked);
        }
      });

      // Get stats
      chrome.runtime.sendMessage({ action: 'getStats' }, (stats) => {
        if (stats) {
          totalBlockedEl.textContent = fmt(stats.totalBlocked || 0);
          renderDomains(stats.blockedDomains || {});
        }
      });
    } catch (err) {
      console.warn('[Pyrite] Load error:', err);
      totalBlockedEl.textContent = '?';
      pageBlockedEl.textContent = '?';
    }
  }

  toggleCheck.addEventListener('change', async () => {
    const enable = toggleCheck.checked;
    try {
      if (enable) {
        await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: RULESETS });
        await chrome.storage.local.set({ blockerEnabled: true });
        showToast('✅ Blocker enabled');
      } else {
        await chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: RULESETS });
        await chrome.storage.local.set({ blockerEnabled: false });
        showToast('⛔ Blocker disabled');
      }
      setToggleUI(enable);
      // Notify content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'toggleBlocker', enabled: enable }).catch(() => {});
        }
      });
    } catch {
      showToast('❌ Failed to toggle');
      toggleCheck.checked = !enable;
      setToggleUI(!enable);
    }
  });

  pauseSiteBtn.addEventListener('click', async () => {
    if (!currentHostname) return;
    try {
      if (isSiteWhitelisted) {
        await chrome.runtime.sendMessage({ action: 'whitelistRemove', hostname: currentHostname });
        isSiteWhitelisted = false;
        pauseSiteBtn.textContent = '⏸ Pause';
        siteStatusBadge.textContent = 'Active';
        siteStatusBadge.className = 'status-badge active';
        showToast(`▶ Resumed blocking on ${currentHostname}`);
      } else {
        await chrome.runtime.sendMessage({ action: 'whitelistAdd', hostname: currentHostname });
        isSiteWhitelisted = true;
        pauseSiteBtn.textContent = '▶ Resume';
        siteStatusBadge.textContent = 'Paused';
        siteStatusBadge.className = 'status-badge paused';
        showToast(`⏸ Paused blocking on ${currentHostname}`);
      }
    } catch {
      showToast('❌ Failed to update whitelist');
    }
  });

  zapperBtn.addEventListener('click', () => {
    zapperActive = !zapperActive;
    if (zapperActive) {
      zapperBtn.classList.add('zapper-active');
      zapperBtn.textContent = '✂️ Zapping... (ESC)';
      showToast('✂️ Click any element to block it. Press ESC to exit.');
      // Send message to content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'enableZapper' }).catch(() => {
            showToast('❌ Refresh page to use zapper');
            zapperActive = false;
            zapperBtn.classList.remove('zapper-active');
            zapperBtn.textContent = '✂️ Zap';
          });
        }
      });
    } else {
      zapperBtn.classList.remove('zapper-active');
      zapperBtn.textContent = '✂️ Zap';
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { action: 'disableZapper' }).catch(() => {});
        }
      });
    }
  });

  undoZapBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'unblockLastElement' }).then((res) => {
          showToast(res && res.restored ? '↩️ Element restored' : 'Nothing to undo on this page');
        }).catch(() => {
          showToast('❌ Refresh the page to use undo');
        });
      }
    });
  });

  reportBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    reportMenu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (reportMenu.classList.contains('open') && !reportMenu.contains(e.target) && e.target !== reportBtn) {
      reportMenu.classList.remove('open');
    }
  });

  function logReportLocally() {
    if (!currentHostname) return;
    chrome.runtime.sendMessage({ action: 'reportAd', url: 'https://' + currentHostname, hostname: currentHostname });
  }

  async function copyCurrentUrl() {
    if (!currentHostname) return false;
    try {
      await navigator.clipboard.writeText('https://' + currentHostname);
      return true;
    } catch {
      return false;
    }
  }

  reportAdBtn.addEventListener('click', async () => {
    logReportLocally();
    const copied = await copyCurrentUrl();
    chrome.tabs.create({ url: 'https://support.google.com/ads/troubleshooter/4578507?hl=en' });
    reportMenu.classList.remove('open');
    showToast(copied ? '🚩 URL copied — paste into the form' : '🚩 Opening Google\'s ad report form…');
  });

  reportUnsafeBtn.addEventListener('click', async () => {
    logReportLocally();
    const copied = await copyCurrentUrl();
    chrome.tabs.create({ url: 'https://safebrowsing.google.com/safebrowsing/report_phish/?hl=en' });
    reportMenu.classList.remove('open');
    showToast(copied ? '⚠️ URL copied — paste into the form' : '⚠️ Opening Safe Browsing report form…');
  });

  // Footer links
  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  whitelistLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  const GITHUB_REPO = 'TheCuriousBuilder/Pyrite-Shield';

  function openGithubIssue({ title, body, label }) {
    const params = new URLSearchParams({ title, body });
    if (label) params.set('labels', label);
    chrome.tabs.create({
      url: `https://github.com/${GITHUB_REPO}/issues/new?${params.toString()}`
    });
    supportMenu.classList.remove('open');
  }

  supportLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    supportMenu.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (supportMenu.classList.contains('open') && !supportMenu.contains(e.target) && e.target !== supportLink) {
      supportMenu.classList.remove('open');
    }
  });

  supportBugBtn.addEventListener('click', () => {
    openGithubIssue({
      label: 'bug',
      title: '[Bug] ',
      body:
`**Describe the bug**


**Steps to reproduce**
1. 
2. 
3. 

**Expected behavior**


**Actual behavior**


**Screenshots / console log**
(paste here, or drag & drop an image)

---
Extension version: ${extVersion}
Site (if relevant): 
Browser:`
    });
  });

  supportSiteBrokenBtn.addEventListener('click', () => {
    openGithubIssue({
      label: 'site-broken',
      title: '[Site Broken] ',
      body:
`**Website URL**


**What's broken?**
(e.g. page won't load, a button doesn't work, video won't play)


**Did it work before installing/updating Pyrite Shield?**


**Console log**
(open DevTools → Console, copy everything, paste here)


**Network tab (optional but helpful)**
(any requests showing "blocked" or a failed status around the issue)

---
Extension version: ${extVersion}`
    });
  });

  supportFeatureBtn.addEventListener('click', () => {
    openGithubIssue({
      label: 'enhancement',
      title: '[Feature Request] ',
      body:
`**What would you like Pyrite Shield to do?**


**Why would this help?**


**Additional context**
(mockups, links, examples from other extensions, etc.)

---
Extension version: ${extVersion}`
    });
  });


  // ---- History pause / clear ----

  function renderExtHistory(items) {
    if (!extHistoryList) return;
    const list = Array.isArray(items) ? items : [];
    if (!list.length) {
      extHistoryList.innerHTML = '<li class="domain-empty">No private session visits yet</li>';
      return;
    }
    extHistoryList.innerHTML = list.slice(0, 40).map((it) => {
      const u = esc(it.url || '');
      const t = esc((it.title || it.url || '').slice(0, 60));
      const when = it.time ? new Date(it.time).toLocaleTimeString() : '';
      return `<li title="${u}"><span>${t}</span><span class="count">${when}</span></li>`;
    }).join('');
  }

  function refreshExtHistory() {
    chrome.runtime.sendMessage({ action: 'getExtensionHistory' }, (r) => {
      if (!chrome.runtime.lastError && r) renderExtHistory(r.items || []);
    });
  }

  let historyPausedLocal = false;

  function setHistoryPauseUI(paused) {
    historyPausedLocal = !!paused;
    if (!historyPauseBtn) return;
    if (paused) {
      historyPauseBtn.textContent = '▶ Resume history';
      historyPauseBtn.classList.add('active-pause');
      if (historyHint) historyHint.textContent = 'Pause ON — visits leave Chrome history immediately and appear in the extension log below.';
    } else {
      historyPauseBtn.textContent = '⏸ Pause history';
      historyPauseBtn.classList.remove('active-pause');
      if (historyHint) historyHint.textContent = 'While paused, sites are stripped from Chrome history right away and listed only below.';
    }
  }

  chrome.runtime.sendMessage({ action: 'getHistoryPauseState' }, (r) => {
    if (!chrome.runtime.lastError && r) setHistoryPauseUI(r.paused);
  });
  refreshExtHistory();

  historyPauseBtn?.addEventListener('click', () => {
    const next = !historyPausedLocal;
    chrome.runtime.sendMessage({ action: 'setHistoryPaused', paused: next }, (res) => {
      if (chrome.runtime.lastError || !res || res.success === false) {
        showToast(res?.error || 'History pause failed (need History permission)');
        return;
      }
      setHistoryPauseUI(res.paused);
      showToast(res.paused ? 'History pause ON' : 'History pause OFF');
      refreshExtHistory();
    });
  });

  clearExtHistoryBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'clearExtensionHistory' }, (res) => {
      if (chrome.runtime.lastError || !res || res.success === false) {
        showToast('Failed to clear extension log');
        return;
      }
      renderExtHistory([]);
      showToast('Extension history log cleared');
    });
  });

  clearHistoryBtn?.addEventListener('click', () => {
    const choice = window.prompt(
      'Clear Chrome browsing history?\n\nType one of:\n  hour  — last 1 hour\n  today — since midnight\n  all   — entire history\n\nCancel to abort.',
      'hour'
    );
    if (choice == null) return;
    const mode = String(choice).trim().toLowerCase();
    if (!['hour', 'today', 'all'].includes(mode)) {
      showToast('Use hour, today, or all');
      return;
    }
    if (mode === 'all' && !window.confirm('Delete ALL browsing history? This cannot be undone.')) {
      return;
    }
    chrome.runtime.sendMessage({ action: 'clearBrowserHistory', mode }, (res) => {
      if (chrome.runtime.lastError || !res || res.success === false) {
        showToast(res?.error || 'Clear history failed');
        return;
      }
      showToast(mode === 'all' ? 'All history cleared' : mode === 'today' ? 'Today’s history cleared' : 'Last hour cleared');
    });
  });


  if (clearStatsBtn) {
    clearStatsBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'resetAllStats' }, (res) => {
        if (chrome.runtime.lastError) {
          showToast('Failed to clear stats');
          return;
        }
        totalBlockedEl.textContent = '0';
        pageBlockedEl.textContent = '0';
        const list = $('domainList');
        if (list) {
          list.innerHTML = '<li class="domain-empty">No domains blocked yet — browse the web!</li>';
        }
        showToast('Stats cleared');
      });
    });
  }

  // Poll for updates
  async function poll() {
    try {
      if (historyPausedLocal) refreshExtHistory();
      chrome.runtime.sendMessage({ action: 'getStats' }, (s) => {
        if (s) {
          totalBlockedEl.textContent = fmt(s.totalBlocked || 0);
          renderDomains(s.blockedDomains || {});
        }
      });
      chrome.runtime.sendMessage({ action: 'getCurrentSiteInfo' }, (siteInfo) => {
        if (siteInfo && siteInfo.hostname === currentHostname) {
          pageBlockedEl.textContent = fmt(siteInfo.tabBlocked || 0);
        } else if (siteInfo) {
          updateSiteInfo(siteInfo.hostname, siteInfo.isWhitelisted, siteInfo.tabBlocked);
        }
      });
    } catch {}
  }
  const pi = setInterval(poll, 3000);
  window.addEventListener('unload', () => clearInterval(pi));

  loadState();
  console.log(`[Pyrite Shield v${extVersion}] Popup ready`);
});