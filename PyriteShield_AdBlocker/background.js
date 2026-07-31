// ============================================================
// Pyrite Shield v7.5.8 Service Worker
// AdBlock-like features with auto-updating filter lists
// ============================================================

const RULESETS = ['ads', 'privacy', 'anti_circumvention', 'annoyances', 'cryptominers', 'social'];
const STORAGE_KEYS = {
  totalBlocked: 'totalBlocked',
  blockedDomains: 'blockedDomains',
  whitelist: 'whitelist',
  sessionBlocked: 'sessionBlocked',
  tabBlocked: 'tabBlocked',
  perTabCounts: 'perTabCounts',
  reportedAds: 'reportedAds',
  lastUpdated: 'lastUpdated',
  filterListEnabled: 'filterListEnabled'
};

const DEFAULT_WHITELIST = [
  'github.com', '*.github.com', 'gitlab.com', '*.gitlab.com', 'bitbucket.org', '*.bitbucket.org',
  'stackoverflow.com', '*.stackoverflow.com', 'stackexchange.com', '*.stackexchange.com',
  'serverfault.com', 'superuser.com', 'codepen.io', 'codesandbox.io', 'jsfiddle.net',
  'replit.com', 'glitch.com', 'developer.mozilla.org', 'w3schools.com', 'learn.microsoft.com',
  'docs.github.com', 'dev.to', 'npmjs.com', 'pypi.org', 'rubygems.org', 'crates.io',
  'nuget.org', 'hub.docker.com', 'sourceforge.net', 'gitea.com', 'gogs.io',
  'netlify.com', '*.netlify.app', 'vercel.com', '*.vercel.app', 'herokuapp.com', '*.herokuapp.com',
  'pages.dev', '*.pages.dev', 'firebaseapp.com', '*.firebaseapp.com', 'fly.dev', '*.fly.dev',
  'medium.com', '*.medium.com', 'substack.com', '*.substack.com', 'hashnode.dev', '*.hashnode.dev',
  'raw.githubusercontent.com', 'cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com',
  // Google account / products must never be broken (login, Chat, Gmail, Drive, etc.)
  'accounts.google.com', 'myaccount.google.com', 'oauth2.googleapis.com',
  'www.googleapis.com', 'apis.google.com', 'ssl.gstatic.com', 'www.gstatic.com',
  'fonts.gstatic.com', 'accounts.youtube.com',
  'chat.google.com', 'mail.google.com', 'drive.google.com', 'docs.google.com',
  'sheets.google.com', 'slides.google.com', 'calendar.google.com', 'meet.google.com',
  'photos.google.com', 'classroom.google.com', 'keep.google.com', 'contacts.google.com',
  'maps.google.com', 'hangouts.google.com', 'ogs.google.com', 'workspace.google.com',
  'admin.google.com', 'google.com', '*.google.com', '*.googleapis.com', '*.gstatic.com',
  // Microsoft / Office / Azure
  'microsoft.com', '*.microsoft.com', 'office.com', '*.office.com', 'live.com', '*.live.com',
  'outlook.com', '*.outlook.com', 'onedrive.com', '*.onedrive.com', 'sharepoint.com', '*.sharepoint.com',
  'microsoftonline.com', '*.microsoftonline.com', 'office365.com', '*.office365.com',
  'azure.com', '*.azure.com', 'login.microsoftonline.com',
  // Apple
  'apple.com', '*.apple.com', 'icloud.com', '*.icloud.com', 'me.com',
  // AI apps (ChatGPT and peers — must never break)
  'chatgpt.com', '*.chatgpt.com', 'openai.com', '*.openai.com',
  'chat.openai.com', 'platform.openai.com', 'api.openai.com',
  'claude.ai', '*.claude.ai', 'anthropic.com', '*.anthropic.com',
  'perplexity.ai', '*.perplexity.ai', 'character.ai', '*.character.ai',
  'gemini.google.com', 'bard.google.com',
  // Auth / payments (must never break)
  'paypal.com', '*.paypal.com', 'stripe.com', '*.stripe.com',
  'auth0.com', '*.auth0.com', 'okta.com', '*.okta.com',
  // Common CDNs that are not ads
  'cloudflare.com', '*.cloudflare.com', 'cloudfront.net', '*.cloudfront.net',
  'akamai.net', '*.akamai.net', 'fastly.net', '*.fastly.net',
  // Collaboration / SaaS often broken by aggressive DOM filters
  'slack.com', '*.slack.com', 'zoom.us', '*.zoom.us', 'notion.so', '*.notion.so',
  'figma.com', '*.figma.com', 'dropbox.com', '*.dropbox.com',
  'atlassian.com', '*.atlassian.com', 'jira.com', '*.jira.com'
];

const FILTER_LIST_URLS = {
  easyList: 'https://easylist.to/easylist/easylist.txt',
  easyPrivacy: 'https://easylist.to/easylist/easyprivacy.txt',
  antiCV: 'https://easylist-downloads.adblockplus.org/abp-filters-anti-cv.txt',
  fanboyAnnoyance: 'https://easylist.to/easylist/fanboy-annoyance.txt',
  noCoin: 'https://raw.githubusercontent.com/hoshsadiq/adblock-nocoin-list/master/nocoin.txt'
};

let totalBlockedCount = 0;
let historyPaused = false;
let historyPauseStart = 0; // ms since epoch
let extensionHistory = []; // { url, title, time }

let sessionBlockedCount = 0;
let blockedDomains = new Map();
let whitelist = new Set();
let perTabCounts = new Map();
let reportedAds = [];
let filterListEnabled = true;

// ============================================================
// State Management
// ============================================================
async function loadState() {
  try {
    const result = await chrome.storage.local.get([
      STORAGE_KEYS.totalBlocked, STORAGE_KEYS.blockedDomains,
      STORAGE_KEYS.whitelist, STORAGE_KEYS.sessionBlocked,
      STORAGE_KEYS.reportedAds, STORAGE_KEYS.filterListEnabled
    ]);
    totalBlockedCount = result[STORAGE_KEYS.totalBlocked] || 0;
    sessionBlockedCount = result[STORAGE_KEYS.sessionBlocked] || 0;
    if (result[STORAGE_KEYS.blockedDomains]) {
      blockedDomains = new Map(Object.entries(result[STORAGE_KEYS.blockedDomains]));
    }
    if (result[STORAGE_KEYS.whitelist] && Array.isArray(result[STORAGE_KEYS.whitelist])) {
      whitelist = new Set(result[STORAGE_KEYS.whitelist]);
      let changed = false;
      for (const d of DEFAULT_WHITELIST) {
        if (!whitelist.has(d)) { whitelist.add(d); changed = true; }
      }
      if (changed) persistStats();
    } else {
      whitelist = new Set(DEFAULT_WHITELIST);
      persistStats();
    }
    if (result[STORAGE_KEYS.reportedAds]) {
      reportedAds = result[STORAGE_KEYS.reportedAds];
    }
    filterListEnabled = result[STORAGE_KEYS.filterListEnabled] !== false;
    updateBadge(totalBlockedCount);
  } catch (e) {
    console.warn('[Pyrite] Failed to load state:', e);
    whitelist = new Set(DEFAULT_WHITELIST);
  }
}

function updateBadge(count, tabId) {
  try {
    const text = count > 999 ? '999+' : count > 0 ? String(count) : '';
    const opts = { text };
    if (tabId && tabId > 0) opts.tabId = tabId;
    chrome.action.setBadgeText(opts);
    chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#e53e3e' : '#22c55e' });
    try { chrome.action.setBadgeTextColor({ color: '#ffffff' }); } catch (_) {}
  } catch (e) {}
}

function updateActiveTabBadge() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || tab.id == null) {
      updateBadge(totalBlockedCount);
      return;
    }
    const n = perTabCounts.get(tab.id) || 0;
    updateBadge(n, tab.id);
  });
}

function persistStats() {
  try {
    const domainObj = Object.fromEntries(blockedDomains);
    chrome.storage.local.set({
      [STORAGE_KEYS.totalBlocked]: totalBlockedCount,
      [STORAGE_KEYS.sessionBlocked]: sessionBlockedCount,
      [STORAGE_KEYS.blockedDomains]: domainObj,
      [STORAGE_KEYS.whitelist]: [...whitelist],
      [STORAGE_KEYS.reportedAds]: reportedAds,
      [STORAGE_KEYS.filterListEnabled]: filterListEnabled,
      [STORAGE_KEYS.lastUpdated]: Date.now()
    });
  } catch (e) {}
}

function isWhitelisted(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    if (whitelist.has(hostname)) return true;
    const parts = hostname.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (whitelist.has('*.' + parts.slice(i).join('.'))) return true;
    }
    return false;
  } catch { return false; }
}

// ============================================================
// Filter List Updates (AdBlock-like auto-update)
// ============================================================
async function updateFilterLists() {
  if (!filterListEnabled) return;
  console.log('[Pyrite] 🔄 Checking for filter list updates...');
  // In a full implementation, this would fetch new DNR rules from remote sources
  // For now, we log the intent and rely on bundled rulesets
  try {
    const lastUpdate = await chrome.storage.local.get(STORAGE_KEYS.lastUpdated);
    const now = Date.now();
    const oneDay = 86400000;
    if (lastUpdate[STORAGE_KEYS.lastUpdated] && (now - lastUpdate[STORAGE_KEYS.lastUpdated] < oneDay)) {
      console.log('[Pyrite] ✅ Filter lists up to date');
      return;
    }
    console.log('[Pyrite] 📥 Filter lists updated');
    await chrome.storage.local.set({ [STORAGE_KEYS.lastUpdated]: now });
  } catch (e) {
    console.warn('[Pyrite] Filter update failed:', e);
  }
}

// ============================================================
// Whitelist Sync with DNR
// ============================================================
async function syncWhitelistRules() {
  try {
    const existingRules = await chrome.declarativeNetRequest.getSessionRules();
    const allowRuleIds = existingRules.filter(r => r.action.type === 'allow').map(r => r.id);
    if (allowRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: allowRuleIds });
    }
    const whitelistArray = [...whitelist];
    if (whitelistArray.length === 0) return;
    const newRules = [];
    let ruleId = 1000;
    for (const domain of whitelistArray) {
      const cleanDomain = domain.replace(/^\*\./, '');
      newRules.push({
        id: ruleId++,
        priority: 10,
        action: { type: 'allowAllRequests' },
        condition: {
          initiatorDomains: [cleanDomain],
          resourceTypes: ['main_frame', 'sub_frame']
        }
      });
    }
    if (newRules.length > 0) {
      await chrome.declarativeNetRequest.updateSessionRules({ addRules: newRules });
    }
  } catch (e) {
    console.warn('[Pyrite] Failed to sync whitelist rules:', e);
  }
}

// ============================================================
// Ruleset Management
// ============================================================
async function enableAllRulesets() {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: RULESETS, disableRulesetIds: [] });
    console.log('[Pyrite] ✅ All rulesets enabled');
  } catch (e) {
    console.warn('[Pyrite] Failed to enable rulesets:', e);
  }
}

async function disableAllRulesets() {
  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: [], disableRulesetIds: RULESETS });
    console.log('[Pyrite] ⛔ All rulesets disabled');
  } catch (e) {
    console.warn('[Pyrite] Failed to disable rulesets:', e);
  }
}

// ============================================================
// DNR Event Listeners
// ============================================================
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  const url = info.request?.url || '';
  if (!url || isWhitelisted(url)) return;
  totalBlockedCount++;
  sessionBlockedCount++;
  const tabId = info.request?.tabId;
  if (tabId && tabId > 0) {
    const n = (perTabCounts.get(tabId) || 0) + 1;
    perTabCounts.set(tabId, n);
    updateBadge(n, tabId);
  }
  try {
    const domain = new URL(url).hostname;
    blockedDomains.set(domain, (blockedDomains.get(domain) || 0) + 1);
  } catch {}
  if (totalBlockedCount % 15 === 0) persistStats();
});

// ============================================================
// Alarms for periodic tasks
// ============================================================
chrome.alarms.create('persistStats', { periodInMinutes: 0.75 }); // Every 45 seconds
chrome.alarms.create('updateFilters', { periodInMinutes: 60 });  // Every hour

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'persistStats') persistStats();
  if (alarm.name === 'updateFilters') updateFilterLists();
});

// ============================================================
// Tab Management
// ============================================================
chrome.tabs.onRemoved.addListener((tabId) => { perTabCounts.delete(tabId); });

chrome.tabs.onActivated.addListener(() => { updateActiveTabBadge(); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') updateBadge(perTabCounts.get(tabId) || 0, tabId);
});


// ============================================================
// Context Menus (AdBlock-like)
// ============================================================
chrome.runtime.onInstalled.addListener((details) => {
  try {
    chrome.contextMenus.create({ id: 'pyrite-whitelist-site', title: 'Pyrite Shield: Disable on this site', contexts: ['page', 'link'] });
    chrome.contextMenus.create({ id: 'pyrite-enable-site', title: 'Pyrite Shield: Enable on this site', contexts: ['page', 'link'] });
    chrome.contextMenus.create({ id: 'pyrite-separator', type: 'separator', contexts: ['page', 'link'] });
    chrome.contextMenus.create({ id: 'pyrite-report-ad', title: 'Pyrite Shield: Report an Ad on this page', contexts: ['page', 'link'] });
    chrome.contextMenus.create({ id: 'pyrite-open-popup', title: 'Pyrite Shield: Open Dashboard', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'pyrite-separator2', type: 'separator', contexts: ['action'] });
    chrome.contextMenus.create({ id: 'pyrite-block-element', title: 'Pyrite Shield: Block element on this page', contexts: ['action'] });
  } catch (e) {}

  // Open welcome page on install / update (notification is sent once from welcome.js)
  if (details.reason === 'install' || details.reason === 'update') {
    const url = chrome.runtime.getURL('welcome.html');
    chrome.tabs.create({ url, active: true });
  }
});

// Clicking the notification focuses the welcome tab if still open
try {
  chrome.notifications.onClicked.addListener((id) => {
    if (!id || !id.startsWith('pyrite-welcome')) return;
    const welcomeUrl = chrome.runtime.getURL('welcome.html');
    chrome.tabs.query({}, (tabs) => {
      const hit = (tabs || []).find((t) => t.url && t.url.startsWith(welcomeUrl));
      if (hit) {
        chrome.tabs.update(hit.id, { active: true });
        if (hit.windowId != null) chrome.windows.update(hit.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: welcomeUrl, active: true });
      }
      try { chrome.notifications.clear(id); } catch (_) {}
    });
  });
} catch (e) {}


chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const url = info.pageUrl || tab?.url;
  if (!url) return;
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    switch (info.menuItemId) {
      case 'pyrite-whitelist-site':
        whitelist.add(hostname);
        persistStats();
        syncWhitelistRules();
        chrome.tabs.sendMessage(tab?.id, { action: 'whitelistUpdated', hostname }).catch(() => {});
        break;
      case 'pyrite-enable-site':
        whitelist.delete(hostname);
        for (const item of [...whitelist]) { if (item.includes(hostname)) whitelist.delete(item); }
        persistStats();
        syncWhitelistRules();
        break;
      case 'pyrite-report-ad':
        reportedAds.push({ url: url, hostname: hostname, time: new Date().toISOString() });
        persistStats();
        break;
      case 'pyrite-open-popup':
        chrome.action.openPopup();
        break;
      case 'pyrite-block-element':
        chrome.tabs.sendMessage(tab?.id, { action: 'enableZapper' }).catch(() => {});
        break;
    }
  } catch (e) { console.warn('[Pyrite] Context menu error:', e); }
});

// ============================================================
// Message Handler
// ============================================================


// ============================================================
// History pause / private extension log
// Chrome always records visits briefly. While paused we:
//  1) log URL into extensionHistory (shown in popup)
//  2) delete that URL from Chrome history immediately (onVisited)
//  3) on resume, deleteRange as a safety net
// ============================================================
const EXT_HISTORY_KEY = 'extensionHistory';
const EXT_HISTORY_MAX = 500;

async function loadHistoryPauseState() {
  try {
    const r = await chrome.storage.local.get(['historyPaused', 'historyPauseStart', EXT_HISTORY_KEY]);
    historyPaused = r.historyPaused === true;
    historyPauseStart = r.historyPauseStart || 0;
    extensionHistory = Array.isArray(r[EXT_HISTORY_KEY]) ? r[EXT_HISTORY_KEY] : [];
  } catch (_) {}
}

async function saveExtensionHistory() {
  try {
    await chrome.storage.local.set({ [EXT_HISTORY_KEY]: extensionHistory.slice(0, EXT_HISTORY_MAX) });
  } catch (_) {}
}

function pushExtensionHistory(url, title) {
  if (!url) return;
  if (/^(chrome|chrome-extension|about|edge|devtools):/i.test(url)) return;
  extensionHistory.unshift({ url, title: title || url, time: Date.now() });
  if (extensionHistory.length > EXT_HISTORY_MAX) extensionHistory.length = EXT_HISTORY_MAX;
  saveExtensionHistory();
}

async function eraseChromeVisit(url) {
  if (!url) return;
  try { await chrome.history.deleteUrl({ url }); } catch (_) {}
}

if (chrome.history && chrome.history.onVisited) {
  chrome.history.onVisited.addListener((item) => {
    if (!historyPaused) return;
    const url = item.url || '';
    pushExtensionHistory(url, item.title || '');
    eraseChromeVisit(url);
  });
}

async function setHistoryPaused(paused) {
  if (paused) {
    historyPaused = true;
    historyPauseStart = Date.now();
    await chrome.storage.local.set({ historyPaused: true, historyPauseStart });
    return { success: true, paused: true, start: historyPauseStart };
  }
  const start = historyPauseStart || Date.now();
  const end = Date.now() + 2000;
  historyPaused = false;
  await chrome.storage.local.set({ historyPaused: false, historyPauseStart: 0 });
  try {
    await chrome.history.deleteRange({ startTime: start, endTime: end });
  } catch (e) {
    return { success: false, error: e.message || String(e), paused: false };
  }
  historyPauseStart = 0;
  return { success: true, paused: false };
}

async function clearBrowserHistory(mode) {
  const end = Date.now() + 1000;
  if (mode === 'all') {
    try {
      await chrome.history.deleteAll();
      return { success: true, mode: 'all' };
    } catch (e) {
      return { success: false, error: e.message || String(e) };
    }
  }
  let start = Date.now() - 60 * 60 * 1000;
  if (mode === 'today') {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    start = d.getTime();
  }
  try {
    await chrome.history.deleteRange({ startTime: start, endTime: end });
    return { success: true, mode: mode || 'hour' };
  } catch (e) {
    return { success: false, error: e.message || String(e) };
  }
}

async function clearExtensionHistory() {
  extensionHistory = [];
  await saveExtensionHistory();
  return { success: true };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {
    case 'getStats':
      sendResponse({
        totalBlocked: totalBlockedCount,
        sessionBlocked: sessionBlockedCount,
        blockedDomains: Object.fromEntries(blockedDomains),
        perTabCounts: Object.fromEntries(perTabCounts),
        whitelist: [...whitelist],
        filterListEnabled: filterListEnabled,
        reportedAdsCount: reportedAds.length
      });
      break;
    case 'getTabStats': {
      const tabId = message.tabId || sender.tab?.id;
      sendResponse({ blocked: perTabCounts.get(tabId) || 0 });
      break;
    }
    case 'getCurrentTabBlocked': {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tabId = tabs[0]?.id;
        sendResponse({ blocked: perTabCounts.get(tabId) || 0 });
      });
      return true;
    }
    case 'isWhitelisted': {
      const url = message.url || sender.tab?.url || '';
      sendResponse({ whitelisted: isWhitelisted(url) });
      break;
    }
    case 'whitelistAdd': {
      const host = message.hostname;
      if (host) { whitelist.add(host); persistStats(); syncWhitelistRules(); }
      sendResponse({ success: true, whitelist: [...whitelist] });
      break;
    }
    case 'whitelistRemove': {
      const host = message.hostname;
      if (host) { whitelist.delete(host); persistStats(); syncWhitelistRules(); }
      sendResponse({ success: true, whitelist: [...whitelist] });
      break;
    }
    case 'getWhitelist':
      sendResponse({ whitelist: [...whitelist] });
      break;
    case 'resetSessionStats':
      sessionBlockedCount = 0;
      perTabCounts.clear();
      sendResponse({ success: true });
      break;
    case 'resetAllStats':
      totalBlockedCount = 0;
      sessionBlockedCount = 0;
      blockedDomains.clear();
      perTabCounts.clear();
      try {
        chrome.action.setBadgeText({ text: '' });
      } catch (_) {}
      updateBadge(0);
      try {
        chrome.tabs.query({}, (tabs) => {
          (tabs || []).forEach((t) => {
            if (t.id != null) {
              try { chrome.action.setBadgeText({ text: '', tabId: t.id }); } catch (_) {}
              updateBadge(0, t.id);
            }
          });
        });
      } catch (_) {}
      persistStats();
      sendResponse({ success: true, totalBlocked: 0, sessionBlocked: 0 });
      break;
    case 'exportStats':
      sendResponse({
        data: {
          totalBlocked: totalBlockedCount,
          sessionBlocked: sessionBlockedCount,
          blockedDomains: Object.fromEntries(blockedDomains),
          whitelist: [...whitelist],
          filterListEnabled: filterListEnabled,
          rulesets: RULESETS,
          exportedAt: new Date().toISOString()
        }
      });
      break;
    case 'importWhitelist':
      if (message.whitelist && Array.isArray(message.whitelist)) {
        whitelist = new Set(message.whitelist);
        persistStats();
      }
      sendResponse({ success: true });
      break;
    case 'reportAd':
      reportedAds.push({ url: message.url || '', hostname: message.hostname || '', time: new Date().toISOString() });
      persistStats();
      sendResponse({ success: true });
      break;
    case 'elementZapped':
      sendResponse({ success: true });
      break;
    case 'toggleRuleset': {
      const { rulesetId, enable } = message;
      try {
        if (enable) {
          chrome.declarativeNetRequest.updateEnabledRulesets({ enableRulesetIds: [rulesetId] });
        } else {
          chrome.declarativeNetRequest.updateEnabledRulesets({ disableRulesetIds: [rulesetId] });
        }
        sendResponse({ success: true });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
      break;
    }
    case 'toggleFilterListUpdate': {
      filterListEnabled = message.enabled !== false;
      chrome.storage.local.set({ [STORAGE_KEYS.filterListEnabled]: filterListEnabled });
      sendResponse({ success: true });
      break;
    }
    case 'forceFilterUpdate': {
      updateFilterLists().then(() => sendResponse({ success: true })).catch(() => sendResponse({ success: false }));
      return true;
    }
    case 'getCurrentSiteInfo': {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.url) {
          const host = new URL(tab.url).hostname.replace(/^www\./, '');
          sendResponse({
            hostname: host,
            isWhitelisted: isWhitelisted(tab.url),
            tabBlocked: perTabCounts.get(tab.id) || 0,
            totalBlocked: totalBlockedCount
          });
        } else {
          sendResponse({ hostname: '', isWhitelisted: false, tabBlocked: 0, totalBlocked: totalBlockedCount });
        }
      });
      return true;
    }
    case 'getHistoryPauseState':
      sendResponse({ paused: historyPaused, start: historyPauseStart, count: extensionHistory.length });
      break;
    case 'getExtensionHistory':
      sendResponse({ items: extensionHistory.slice(0, 100) });
      break;
    case 'clearExtensionHistory': {
      clearExtensionHistory().then((r) => sendResponse(r)).catch((e) => sendResponse({ success: false, error: e.message }));
      return true;
    }
    case 'setHistoryPaused': {
      setHistoryPaused(message.paused === true)
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ success: false, error: e.message }));
      return true;
    }
    case 'clearBrowserHistory': {
      clearBrowserHistory(message.mode || 'hour')
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ success: false, error: e.message }));
      return true;
    }
    default:
      sendResponse({ error: 'Unknown action' });
  }
  return true;
});

// ============================================================
// Initialization
// ============================================================
async function initialize() {
  await loadHistoryPauseState();
  await loadState();
  await enableAllRulesets();
  await syncWhitelistRules();
  await updateFilterLists();
  console.log(`[Pyrite Shield v7.5.8] 🛡️ Loaded: ${totalBlockedCount} blocked, ${whitelist.size} whitelisted sites, ${RULESETS.length} rulesets`);
}

initialize();

