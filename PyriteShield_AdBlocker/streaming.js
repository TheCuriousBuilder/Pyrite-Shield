// ============================================================
// Pyrite Shield v7.5.8 Site Ad Blocker
// ============================================================
(function() {
  'use strict';

  const hostname = window.location.hostname.replace(/^www\./, '');
  const STREAMING_DOMAINS = [
    '123movies', 'putlocker',
    'fmovies', 'gomovies', 'soap2day', 'sflix', 'lookmovie',
    'primewire', 'yesmovies', 'movierulz', 'tamilrockers',
    'cinemaz', 'kissanime', 'gogoanime', '9anime', 'zoro.to',
    'animepahe', 'animedao', 'aniwatch', 'hianime',
    'netflix', 'hulu', 'disneyplus', 'hbomax', 'hotstar',
    'amazonprime', 'primevideo'
  ];
  // Einthusan is deliberately excluded here — it's handled entirely by
  // the dedicated einthusan.js module, which knows Einthusan's specific
  // player markup and won't touch it. Running this generic script's
  // cruder overlay/popup heuristics on top of that caused real bugs
  // (e.g. deleting the play-button overlay before it could render).
  const isStreaming = STREAMING_DOMAINS.some(s => hostname.includes(s));
  if (!isStreaming) return;

  let enabled = true;
  let globalEnabled = true;
  let siteWhitelisted = false;

  function isHostWhitelisted(host, list) {
    if (!Array.isArray(list)) return false;
    if (list.includes(host)) return true;
    const parts = host.split('.');
    for (let i = 1; i < parts.length - 1; i++) {
      if (list.includes('*.' + parts.slice(i).join('.'))) return true;
    }
    return false;
  }

  function recomputeEnabled() { enabled = globalEnabled && !siteWhitelisted; }

  chrome.storage.local.get(['blockerEnabled', 'whitelist'], (result) => {
    if (result.blockerEnabled === false) globalEnabled = false;
    siteWhitelisted = isHostWhitelisted(hostname, result.whitelist);
    recomputeEnabled();
  });

  function removeStreamingAds() {
    if (!enabled) return;

    // Remove ad iframes
    document.querySelectorAll('iframe[src]').forEach(el => {
      const src = (el.src || '').toLowerCase();
      if (src.includes('doubleclick') || src.includes('ad.') || src.includes('popup') ||
          src.includes('banner') || src.includes('adservice') || src.includes('affiliate') ||
          src.match(/ads?\./) || src.match(/ad[A-Z]/) || 
          src.includes('adsterra') || src.includes('exoclick') || src.includes('popads')) {
        el.remove();
      }
    });

    // Overlays and popups - but NOT video players or their controls.
    // Elements are only removed if their id/class mentions popup/overlay
    // AND they don't look like part of the player itself. The previous
    // exemption only checked for exact classList tokens ('player',
    // 'video-player', 'movie-player'), so a real overlay named e.g.
    // 'play-overlay' or 'loading-overlay' (the element that shows the
    // play button once the source is ready) didn't match any exemption
    // and was deleted on sight — which is why the play button never
    // appeared. This now does a substring check across id AND class for
    // player/video/movie/watch/loading/play-related wording, and also
    // skips anything that actually contains a <video> element.
    document.querySelectorAll(`
      [id*="popup"], [class*="popup"], 
      [id*="overlay"], [class*="overlay"]
    `).forEach(el => {
      if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
      if (el.querySelector('video')) return;
      const idAndClass = ((el.id || '') + ' ' + (el.className || '')).toLowerCase();
      if (/player|video|movie|watch|loading|play-|-play|poster|spinner|buffer/.test(idAndClass)) return;
      el.remove();
    });

    // Anti-adblock walls
    document.querySelectorAll(`
      [id*="adblock"], [class*="adblock"],
      .adblock-warning, .anti-adblock, .adblock-detected,
      #adblock-modal, .adblock-overlay, .adblock-message,
      .adblock-notice, .adblock-alert
    `).forEach(el => {
      if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
      el.remove();
    });

    // Generic ad containers
    document.querySelectorAll(`
      div[class*="ad-container"], div[class*="ad-slot"],
      div[class*="advertisement"], div[id*="google_ads"],
      div[id*="div-gpt-ad"], div[data-ad-target],
      .ad-unit, .ad-box, .ad-wrapper, .ad-div,
      .ad-section, .ad-block, .ad-placeholder,
      .ad-label, .ad-text, .ad-title,
      .ad-message, .ad-area, .ad-banner,
      div[class*="ad-tag"], div[class*="ad-banner"],
      ins.adsbygoogle, div[class*="sponsor"]
    `).forEach(el => {
      if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
      el.remove();
    });

    // Restore scrolling if disabled
    document.body.style.overflow = 'auto';
    document.body.style.position = 'static';
    document.documentElement.style.overflow = 'auto';
  }

  const observer = new MutationObserver(() => {
    if (!enabled) return;
    removeStreamingAds();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  setInterval(() => {
    if (!enabled) return;
    removeStreamingAds();
  }, 2000);

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.blockerEnabled) globalEnabled = changes.blockerEnabled.newValue !== false;
    if (changes.whitelist) siteWhitelisted = isHostWhitelisted(hostname, changes.whitelist.newValue);
    if (changes.blockerEnabled || changes.whitelist) recomputeEnabled();
  });

  // Initial cleanup
  removeStreamingAds();
  console.log('[Pyrite] 📺 Streaming ad blocker active on:', hostname);
})();

