// ============================================================
// Pyrite Shield Controller (AdBlock-like UI)
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
  const reportBtn = $('reportBtn');
  const toastEl = $('toast');
  const optionsLink = $('optionsLink');
  const whitelistLink = $('whitelistLink');
  const supportLink = $('supportLink');
  const supportMenu = $('supportMenu');
  const supportBugBtn = $('supportBug');
  const supportSiteBrokenBtn = $('supportSiteBroken');
  const supportFeatureBtn = $('supportFeature');
  const clearStatsBtn = $('clearStatsBtn');
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
      setToggleUI(RULESETS.some((id) => enabled.includes(id)));

      chrome.runtime.sendMessage({ action: 'getCurrentSiteInfo' }, (siteInfo) => {
        if (siteInfo) {
          updateSiteInfo(siteInfo.hostname, siteInfo.isWhitelisted, siteInfo.tabBlocked);
        }
      });

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

  reportBtn.addEventListener('click', () => {
    if (!currentHostname) return;
    chrome.runtime.sendMessage({ action: 'reportAd', url: 'https://' + currentHostname, hostname: currentHostname });
    showToast('🚩 Ad reported. Thank you!');
  });

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

  async function poll() {
    try {
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