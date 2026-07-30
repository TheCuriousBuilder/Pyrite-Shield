// ============================================================
// Pyrite Shield v7.0.1 Module
// BUG FIX: permanent header "Advertisement - opens new tab"
// was matching forever → sought the real movie to the end.
// Now only reacts to "Loading Advertisement..." and only seeks
// short clips (≤90s).
// ============================================================
(function () {
  'use strict';

  const hostname = window.location.hostname.replace(/^www\./, '');
  if (!/einthusan\.(tv|com)$/.test(hostname)) return;

  let enabled = true;
  let globalEnabled = true;
  let siteWhitelisted = false;
  const hookedVideos = new WeakSet();
  let lastKillAt = 0;

  function recomputeEnabled() {
    enabled = globalEnabled && !siteWhitelisted;
  }

  function isHostWhitelisted(host, list) {
    if (!Array.isArray(list)) return false;
    if (list.includes(host)) return true;
    const parts = host.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (list.includes('*.' + parts.slice(i).join('.'))) return true;
    }
    return false;
  }

  chrome.storage.local.get(['blockerEnabled', 'whitelist'], (result) => {
    if (result.blockerEnabled === false) globalEnabled = false;
    siteWhitelisted = isHostWhitelisted(hostname, result.whitelist);
    recomputeEnabled();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.blockerEnabled) globalEnabled = changes.blockerEnabled.newValue !== false;
    if (changes.whitelist) siteWhitelisted = isHostWhitelisted(hostname, changes.whitelist.newValue);
    recomputeEnabled();
  });

  const nullWin = {
    closed: true, close() {}, focus() {}, blur() {},
    location: { href: '' }, document: { write() {}, close() {} }
  };
  const originalOpen = window.open.bind(window);
  try {
    Object.defineProperty(window, 'open', {
      configurable: true, writable: true,
      value: function (...args) {
        if (!enabled) return originalOpen(...args);
        const url = String(args[0] || '');
        if (!url || /^(about:|data:|blob:|javascript:)/i.test(url) ||
            /einthusan\.(tv|com)/i.test(url) ||
            url.startsWith('/') || url.startsWith('#') || url.startsWith('?')) {
          return originalOpen(...args);
        }
        console.log('[Pyrite] 🚫 Blocked popunder/popup:', url);
        return nullWin;
      }
    });
  } catch (e) {}

  function isInsidePlayer(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return true;
    if (el.querySelector && el.querySelector('video, source')) return true;
    return !!el.closest(
      '#player, .player, #UIRegion, .UIRegion, .video-js, .jwplayer, .plyr, ' +
      '[id*="player" i], [class*="player" i], [id*="video" i], [class*="video" i], ' +
      '[id*="movie" i], [class*="movie" i], [id*="watch" i], [class*="watch" i]'
    );
  }

  function isClickCatcher(el) {
    if (!(el instanceof HTMLElement)) return false;
    if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE' || el.tagName === 'BUTTON') return false;
    if (isInsidePlayer(el)) return false;
    const idc = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '')).toLowerCase();
    if (/player|video|movie|watch|loading|poster|spinner|buffer|play|source/.test(idc)) return false;
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < window.innerWidth * 0.5 || rect.height < window.innerHeight * 0.5) return false;
    const looksTransparent =
      cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent' ||
      parseFloat(cs.opacity) < 0.05;
    const hasNoRealContent = el.children.length <= 1 && el.innerText.trim().length === 0;
    const highZIndex = parseInt(cs.zIndex, 10) > 100 || cs.zIndex === 'auto';
    return looksTransparent && hasNoRealContent && highZIndex;
  }

  ['mousedown', 'pointerdown', 'click', 'touchstart'].forEach((type) => {
    document.addEventListener(type, function (e) {
      if (!enabled) return;
      if (isClickCatcher(e.target)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    }, true);
  });

  // STRICT: only "Loading Advertisement..." style text (not permanent header)
  function pageShowsAdLoading() {
    try {
      const nodes = document.querySelectorAll('div, span, p, h1, h2, h3, h4');
      for (const el of nodes) {
        if (!(el instanceof HTMLElement)) continue;
        if (el.querySelector('video, source')) continue;
        const text = (el.innerText || '').trim();
        if (text.length < 5 || text.length > 60) continue;
        if (/^loading\s*advertisement/i.test(text)) return true;
        if (/^advertisement\s*\.\.\./i.test(text)) return true;
        if (/^ad\s*loading/i.test(text)) return true;
      }
      return false;
    } catch (e) { return false; }
  }

  function killAdOnVideo(v) {
    if (!enabled || !v) return;
    if (!pageShowsAdLoading()) return;
    try {
      const dur = v.duration;
      // Only short clips = ads. Never touch long movie videos.
      if (!isFinite(dur) || dur < 0.5 || dur > 90) return;
      if (v.currentTime < dur - 0.2) {
        v.currentTime = dur - 0.05;
        lastKillAt = Date.now();
        console.log('[Pyrite] ⏭ Killed short ad (' + dur.toFixed(1) + 's)');
      }
      try { v.dispatchEvent(new Event('ended', { bubbles: true })); } catch (e) {}
    } catch (e) {}
  }

  function hookVideo(v) {
    if (!(v instanceof HTMLVideoElement) || hookedVideos.has(v)) return;
    hookedVideos.add(v);
    const onAny = () => {
      if (Date.now() - lastKillAt < 300) return;
      killAdOnVideo(v);
    };
    v.addEventListener('play', onAny, true);
    v.addEventListener('playing', onAny, true);
    v.addEventListener('timeupdate', onAny, true);
    v.addEventListener('loadedmetadata', onAny, true);
    v.addEventListener('durationchange', onAny, true);
    v.addEventListener('canplay', onAny, true);
    killAdOnVideo(v);
  }

  function hookAllVideos() {
    document.querySelectorAll('video').forEach(hookVideo);
  }

  const AD_SELECTORS = [
    '#ads', '.ads', '[id^="ad-"]', '[class^="ad-"]',
    '[id*="banner"]', '[class*="banner"]',
    '.blocker-alert', '.adblock-warning', '#adblock-warning',
    'iframe[src*="doubleclick"]', 'iframe[src*="googlesyndication"]',
    'iframe[src*="adnxs"]', 'iframe[src*="exoclick"]',
    'iframe[src*="propellerads"]', 'iframe[src*="popads"]',
    'iframe[src*="adsterra"]', 'iframe[src*="hilltopads"]',
    'iframe[src*="juicyads"]', 'iframe[src*="clickadu"]',
    'ins.adsbygoogle'
  ];

  function removeKnownAdElements() {
    if (!enabled) return;
    document.querySelectorAll(AD_SELECTORS.join(',')).forEach((el) => {
      if (isInsidePlayer(el)) return;
      el.remove();
    });
  }

  function hideAdLoadingOverlays() {
    if (!enabled) return;
    document.querySelectorAll('div, span, p').forEach((el) => {
      if (!(el instanceof HTMLElement)) return;
      if (isInsidePlayer(el)) return;
      if (el.querySelector('video, source')) return;
      const text = (el.innerText || '').trim();
      if (text.length < 5 || text.length > 60) return;
      if (!/^loading\s*advertisement/i.test(text) && !/^advertisement\s*\.\.\./i.test(text)) return;
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.style.setProperty('pointer-events', 'none', 'important');
    });
  }

  function sweepClickCatchers() {
    if (!enabled) return;
    document.querySelectorAll('div, a, span').forEach((el) => {
      if (isClickCatcher(el)) el.remove();
    });
  }

  function runCleanup() {
    if (!enabled) return;
    hookAllVideos();
    removeKnownAdElements();
    sweepClickCatchers();
    hideAdLoadingOverlays();
    if (pageShowsAdLoading()) {
      document.querySelectorAll('video').forEach(killAdOnVideo);
    }
    if (document.body) {
      document.body.style.pointerEvents = 'auto';
      document.body.style.overflow = '';
    }
    document.documentElement.style.overflow = '';
  }

  const observer = new MutationObserver((mutations) => {
    if (!enabled) return;
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node.nodeType !== 1) return;
        if (node.tagName === 'VIDEO') hookVideo(node);
        if (node.querySelectorAll) node.querySelectorAll('video').forEach(hookVideo);
      });
    }
    hideAdLoadingOverlays();
    if (pageShowsAdLoading()) document.querySelectorAll('video').forEach(killAdOnVideo);
  });

  function start() {
    runCleanup();
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    setInterval(runCleanup, 500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  console.log('[Pyrite] 🎬 Einthusan module active (v7 — fixed false ad detection)');
})();