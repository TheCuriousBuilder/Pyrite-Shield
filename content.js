// ============================================================
// Pyrite Shield v6.1.5 Ad Blocker (Compatibility Edition)
// Network-level blocking via DNR remains the primary mechanism.
// DOM / CSS heuristics only run on known ad-heavy sites so
// legitimate apps (ChatGPT, Google Accounts, banks, SaaS, etc.)
// are never broken by generic popup/overlay/class matching.
// ============================================================
(function () {
  'use strict';

  const hostname = window.location.hostname.replace(/^www\./, '');

  // Dedicated site modules handle these; generic heuristics would break them.
  if (/(^|\.)einthusan\.(tv|com)$/.test(hostname)) return;
  if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return;
  if (hostname.includes('twitch.tv')) return;
  if (hostname.includes('facebook.com')) return;

  // ----------------------------------------------------------------
  // Sites where we NEVER inject CSS, remove DOM nodes, or patch
  // fetch / XHR / defineProperty. DNR still blocks third-party ads.
  // This list is intentionally broad so legitimate websites stay usable.
  // ----------------------------------------------------------------
  const PROTECTED_PRODUCT_HOSTS = new RegExp(
    [
      // Google family
      '^(?:(?:mail|chat|drive|docs|sheets|slides|calendar|meet|photos|classroom|keep|contacts|maps|translate|news|books|play|music|tv|earth|chrome|workspace|admin|myaccount|accounts|ogs|hangouts|clients\\d*|apis|www|encrypted-tbn\\d*|lh\\d*|ssl|fonts|ajax)\\.)?google\\.com$',
      '^(?:google|googleapis|gstatic|googleusercontent|ggpht|ytimg)\\.',
      // Microsoft
      '(?:^|\\.)(?:microsoft|office|live|outlook|onedrive|sharepoint|azure|microsoftonline|office365|bing|skype|teams)\\.com$',
      // Apple
      '(?:^|\\.)(?:apple|icloud|me)\\.com$',
      // AI / productivity apps
      '(?:^|\\.)(?:openai|chatgpt|anthropic|claude|perplexity|character\\.ai|midjourney|stability\\.ai|huggingface|cohere|mistral)\\.(?:com|ai|co)$',
      // Auth / payments / identity
      '(?:^|\\.)(?:paypal|stripe|square|auth0|okta|onelogin|duo|lastpass|1password|bitwarden|dashlane)\\.com$',
      // Cloud / developer platforms
      '(?:^|\\.)(?:github|gitlab|bitbucket|stackoverflow|stackexchange|npmjs|pypi|crates|nuget|docker|vercel|netlify|heroku|digitalocean|linode|vultr|cloudflare|fastly|akamai)\\.(?:com|org|io|app|dev|net)$',
      // Amazon / AWS
      '(?:^|\\.)(?:amazon|aws|amazonaws)\\.com$',
      // Banking / finance
      '(?:^|\\.)(?:bankofamerica|wellsfargo|chase|citi|capitalone|usbank|pnc|td|schwab|fidelity|vanguard|etrade|robinhood|coinbase|binance|kraken)\\.com$',
      // Communication / collaboration
      '(?:^|\\.)(?:slack|zoom|webex|discord|telegram|whatsapp|signal|notion|figma|canva|dropbox|box|evernote|trello|asana|monday|airtable|linear|atlassian)\\.com$',
      // Major social
      '(?:^|\\.)(?:linkedin|instagram|twitter|x|reddit|pinterest|tiktok|snapchat)\\.com$'
    ].join('|'),
    'i'
  );

  const isProtected =
    PROTECTED_PRODUCT_HOSTS.test(hostname) ||
    hostname.endsWith('.google.com') ||
    hostname === 'google.com' ||
    hostname.endsWith('.edu') ||
    hostname.endsWith('.gov') ||
    hostname.endsWith('.mil');

  if (isProtected) {
    // DNR still blocks third-party ads; skip all DOM/fetch heuristics.
    return;
  }

  // Sites where aggressive DOM cleanup is appropriate
  const AGGRESSIVE_DOMAINS = [
    '123movies', 'putlocker', 'fmovies', 'gomovies', 'soap2day', 'sflix', 'lookmovie',
    'primewire', 'yesmovies', 'movierulz', 'tamilrockers', 'cinemaz', 'kissanime',
    'gogoanime', '9anime', 'zoro.to', 'animepahe', 'animedao', 'aniwatch', 'hianime',
    'netflix', 'hulu', 'disneyplus', 'hbomax', 'hotstar', 'amazonprime', 'primevideo',
    'popads', 'propeller', 'exoclick', 'adsterra'
  ];
  const isAggressiveSite = AGGRESSIVE_DOMAINS.some((s) => hostname.includes(s));

  let enabled = true;
  let globalEnabled = true;
  let siteWhitelisted = false;

  function isHostWhitelisted(host, list) {
    if (!Array.isArray(list)) return false;
    return list.some((entry) => {
      const clean = String(entry).replace(/^\*\./, '');
      return host === clean || host.endsWith('.' + clean);
    });
  }

  function updateEnabled() {
    enabled = globalEnabled && !siteWhitelisted;
    if (!enabled) {
      document.getElementById('pyrite-adblock-css')?.remove();
    } else if (isAggressiveSite) {
      injectAdHidingCSS();
    }
  }

  chrome.storage.local.get(['blockerEnabled', 'whitelist'], (result) => {
    if (result.blockerEnabled === false) globalEnabled = false;
    siteWhitelisted = isHostWhitelisted(hostname, result.whitelist);
    updateEnabled();
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.blockerEnabled) globalEnabled = changes.blockerEnabled.newValue !== false;
    if (changes.whitelist) siteWhitelisted = isHostWhitelisted(hostname, changes.whitelist.newValue);
    if (changes.blockerEnabled || changes.whitelist) updateEnabled();
  });

  const AD_DOMAINS = [
    'doubleclick.net', 'ad.doubleclick.net', 'securepubads.g.doubleclick.net',
    'cm.g.doubleclick.net', 'pubads.g.doubleclick.net', 'g.doubleclick.net',
    'googlesyndication.com', 'pagead2.googlesyndication.com',
    'googleadservices.com', 'googletagservices.com',
    'adservice.google.com', 'admanager.google.com',
    'amazon-adsystem.com', 'aax.amazon-adsystem.com', 'advertising.amazon.com',
    'taboola.com', 'trc.taboola.com', 'taboolasyndication.com',
    'outbrain.com', 'widgets.outbrain.com', 'outbrainimg.com',
    'criteo.com', 'criteo.net',
    'appnexus.com', 'adnxs.com', 'xandr.com',
    'rubiconproject.com', 'pubmatic.com', 'openx.net', 'casalemedia.com',
    'adsrvr.org', 'media.net', 'moatads.com', 'scorecardresearch.com',
    'quantserve.com', 'comscore.com',
    'facebook.com/tr', 'connect.facebook.net', 'pixel.facebook.com',
    'analytics.twitter.com', 'ads-twitter.com',
    'ads.linkedin.com', 'analytics.pinterest.com', 'ct.pinterest.com',
    'ads.tiktok.com', 'analytics.tiktok.com', 'tiktok.com/pixel',
    'ads.snapchat.com', 'tr.snapchat.com', 'sc-static.net',
    'hotjar.com', 'static.hotjar.com', 'mixpanel.com', 'amplitude.com',
    'segment.io', 'segment.com', 'fullstory.com', 'clarity.ms',
    'bat.bing.com',
    'popads.net', 'popcash.net', 'propellerads.com', 'exoclick.com',
    'exosrv.com', 'adsterra.com', 'juicyads.com', 'trafficjunky.com',
    'revcontent.com', 'mgid.com', 'content.ad', 'plista.com',
    'zergnet.com', 'sharethrough.com', 'sovrn.com',
    'adform.net', 'smaato.net', 'teads.tv', 'yieldmo.com',
    'bidswitch.net', 'turn.com', 'mathtag.com', 'bluekai.com',
    'krxd.net', 'demdex.net', 'rlcdn.com',
    'coinhive.com', 'crypto-loot.com', 'coin-have.com', 'minr.pw',
    'fingerprintjs.com', 'fpjs.io', 'perimeterx.com'
  ];
  const BLOCKED = new Set(AD_DOMAINS.map((d) => d.replace(/^www\./, '')));

  // Precise ad containers only — no generic [class*="popup"] / [id*="overlay"]
  const PRECISE_AD_SELECTORS = [
    'ins.adsbygoogle',
    'div[id*="div-gpt-ad"]',
    'div[id*="google_ads"]',
    'div[data-ad-slot]',
    'div[data-google-query-id]',
    'div[data-ad-client]',
    'div[data-ad-unit]',
    '[id^="ad-banner-"]',
    '[id^="banner-ad-"]',
    '.ad-unit',
    '.ad-slot',
    '.adsbygoogle',
    '.dfp-ad',
    '.gpt-ad',
    '.adblock-warning',
    '.anti-adblock',
    '.adblock-detected',
    '#adblock-modal',
    '.adblock-overlay',
    '.adblock-message'
  ];

  function isAdURL(url) {
    if (!url || typeof url !== 'string') return false;
    try {
      const u = new URL(url, location.href);
      const host = u.hostname.replace(/^www\./, '');
      if (BLOCKED.has(host)) return true;
      for (const d of BLOCKED) {
        if (host === d || host.endsWith('.' + d)) return true;
      }
      const path = u.pathname.toLowerCase();
      if (
        path.includes('/pagead/') ||
        path.includes('/ads/conversion') ||
        path.includes('/gampad/') ||
        path.includes('/ad_status') ||
        host.startsWith('ads.') ||
        host.startsWith('adserver.') ||
        host.startsWith('adserving.')
      ) {
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  }

  function isProtectedElement(el) {
    if (!el || !(el instanceof Element)) return true;
    if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE' || el.tagName === 'AUDIO') return true;
    if (el.querySelector && el.querySelector('video, audio, input, textarea, select, form, [contenteditable]')) return true;
    if (el.closest) {
      if (
        el.closest(
          'button, a, nav, header, footer, main, [role="dialog"], [role="menu"], [role="navigation"], [role="main"], [role="form"], form, input, textarea, select'
        )
      ) {
        if (!el.matches || !el.matches('ins.adsbygoogle, [id*="div-gpt-ad"], [data-ad-slot], .adsbygoogle')) {
          return true;
        }
      }
    }
    return false;
  }

  function blockAdResources() {
    if (!enabled) return;
    document.querySelectorAll('iframe[src]').forEach((el) => {
      if (isAdURL(el.src)) {
        try {
          el.src = 'about:blank';
          el.remove();
        } catch (_) {}
      }
    });
    document.querySelectorAll('script[src]').forEach((el) => {
      if (isAdURL(el.src)) {
        try {
          el.type = 'javascript/blocked';
          el.remove();
        } catch (_) {}
      }
    });
  }

  function removePreciseAdNodes() {
    if (!enabled) return;
    document.querySelectorAll(PRECISE_AD_SELECTORS.join(',')).forEach((el) => {
      if (isProtectedElement(el)) return;
      try {
        el.remove();
      } catch (_) {}
    });
  }

  function removeAggressiveOverlays() {
    if (!enabled || !isAggressiveSite) return;
    document.querySelectorAll('iframe[src]').forEach((el) => {
      const src = (el.src || '').toLowerCase();
      if (
        src.includes('doubleclick') ||
        src.includes('adsterra') ||
        src.includes('exoclick') ||
        src.includes('popads') ||
        src.includes('propeller') ||
        /ads?\./.test(src)
      ) {
        try {
          el.remove();
        } catch (_) {}
      }
    });
    document
      .querySelectorAll('[id*="popup"], [class*="popup"], [id*="overlay"], [class*="overlay"]')
      .forEach((el) => {
        if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
        if (el.querySelector && el.querySelector('video')) return;
        const idAndClass = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
        if (/player|video|movie|watch|loading|play-|-play|poster|spinner|buffer|modal|dialog|menu|settings|search|nav|header/.test(idAndClass)) {
          return;
        }
        try {
          el.remove();
        } catch (_) {}
      });
    document.querySelectorAll('[id*="adblock"], [class*="adblock"]').forEach((el) => {
      if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
      try {
        el.remove();
      } catch (_) {}
    });
  }

  function injectAdHidingCSS() {
    if (!isAggressiveSite) return;
    const oldStyle = document.getElementById('pyrite-adblock-css');
    if (oldStyle) oldStyle.remove();

    const style = document.createElement('style');
    style.id = 'pyrite-adblock-css';
    style.textContent = `
      ins.adsbygoogle,
      div[id*="div-gpt-ad"],
      div[id*="google_ads"],
      div[data-ad-slot],
      div[data-google-query-id],
      .adsbygoogle, .dfp-ad, .gpt-ad, .ad-unit, .ad-slot {
        display: none !important;
        height: 0 !important;
        width: 0 !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      .adblock-warning, .anti-adblock, .adblock-detected,
      #adblock-modal, .adblock-overlay, .adblock-message,
      .adblock-notice, .adblock-alert {
        display: none !important;
      }
    `;
    (document.documentElement || document.head || document.body)?.appendChild(style);
  }

  function setupAntiAdblockBypass() {
    if (!isAggressiveSite) return;

    const originalFetch = window.fetch;
    window.fetch = function (input, init) {
      const url = typeof input === 'string' ? input : input && input.url ? input.url : '';
      if (isAdURL(url)) return Promise.resolve(new Response('', { status: 204 }));
      return originalFetch.call(window, input, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url, ...args) {
      if (isAdURL(url)) {
        this.abort = function () {};
        return;
      }
      return originalOpen.call(this, method, url, ...args);
    };
  }

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (!enabled || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      blockAdResources();
      removePreciseAdNodes();
      if (isAggressiveSite) removeAggressiveOverlays();
    });
  });
  try {
    observer.observe(document.documentElement || document, {
      childList: true,
      subtree: true,
      attributes: false
    });
  } catch (_) {}

  let zapperMode = false;
  let zapperOverlay = null;
  let zapperListeners = [];

  function createZapperOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pyrite-zapper-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483646;cursor:crosshair;background:transparent;';
    document.body.appendChild(overlay);

    const highlight = document.createElement('div');
    highlight.id = 'pyrite-zapper-highlight';
    highlight.style.cssText =
      'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #e53e3e;background:rgba(229,62,62,0.15);display:none;';
    document.body.appendChild(highlight);

    function onMove(e) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || el === overlay || el === highlight) {
        highlight.style.display = 'none';
        return;
      }
      const r = el.getBoundingClientRect();
      highlight.style.display = 'block';
      highlight.style.left = r.left + 'px';
      highlight.style.top = r.top + 'px';
      highlight.style.width = r.width + 'px';
      highlight.style.height = r.height + 'px';
    }

    function onClick(e) {
      e.preventDefault();
      e.stopPropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== overlay && el !== highlight) {
        try {
          el.remove();
        } catch (_) {}
      }
      deactivateZapper();
    }

    function onKey(e) {
      if (e.key === 'Escape') deactivateZapper();
    }

    overlay.addEventListener('mousemove', onMove, true);
    overlay.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    zapperListeners = [
      { el: overlay, type: 'mousemove', fn: onMove },
      { el: overlay, type: 'click', fn: onClick },
      { el: document, type: 'keydown', fn: onKey }
    ];
    zapperOverlay = overlay;
  }

  function deactivateZapper() {
    zapperListeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn, true));
    zapperListeners = [];
    document.getElementById('pyrite-zapper-overlay')?.remove();
    document.getElementById('pyrite-zapper-highlight')?.remove();
    zapperOverlay = null;
    zapperMode = false;
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'enableZapper') {
      zapperMode = true;
      if (!zapperOverlay) createZapperOverlay();
    } else if (message.action === 'disableZapper') {
      deactivateZapper();
    }
    return true;
  });

  function init() {
    if (!enabled) return;
    console.log('[Pyrite] Compatibility engine v6.1.5 on:', hostname, isAggressiveSite ? '(aggressive)' : '(safe)');

    setupAntiAdblockBypass();
    blockAdResources();
    removePreciseAdNodes();
    if (isAggressiveSite) {
      injectAdHidingCSS();
      removeAggressiveOverlays();
      setInterval(() => {
        if (!enabled) return;
        blockAdResources();
        removePreciseAdNodes();
        removeAggressiveOverlays();
      }, 2000);
    } else {
      setInterval(() => {
        if (!enabled) return;
        blockAdResources();
        removePreciseAdNodes();
      }, 5000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
