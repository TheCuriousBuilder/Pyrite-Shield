// ============================================================
// Pyrite Shield v7.5.8 Ad Blocker
// ============================================================
(function () {
  'use strict';

  const hostname = window.location.hostname.replace(/^www\./, '');
  if (!hostname.includes('twitch.tv')) return;

  let enabled = true;
  chrome.storage.local.get(['blockerEnabled', 'blockTwitch'], (result) => {
    if (result.blockerEnabled === false || result.blockTwitch === false) enabled = false;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.blockerEnabled) enabled = changes.blockerEnabled.newValue !== false;
    if (changes.blockTwitch) {
      if (changes.blockTwitch.newValue === false) enabled = false;
      else chrome.storage.local.get(['blockerEnabled'], (r) => { enabled = r.blockerEnabled !== false; });
    }
  });

  const AD_SELECTORS = [
    '[data-a-target="video-ad-label"]',
    '[data-a-target="video-ad-countdown"]',
    '[data-test-selector="ad-banner-default-text"]',
    '.video-player__overlay [class*="ad"]',
    '.tw-absolute[data-a-target*="ad"]',
    '[aria-label*="Advertisement"]',
    '.player-ad-overlay',
    '.ad-banner',
    '.consent-banner',
    '[data-a-target="player-overlay-ad"]',
    'div[class*="InjectLayout"] [class*="ad-"]',
    '[class*="paid-placement"]',
    '[data-a-target="top-nav-ad"]'
  ].join(',');

  function removeTwitchAds() {
    if (!enabled) return;
    document.querySelectorAll(AD_SELECTORS).forEach((el) => {
      if (el.closest?.('video, .video-player__container, [data-a-target="player-overlay-click-handler"]')) return;
      try { el.remove(); } catch (_) {}
    });

    // Mute and speed through short ad segments when ad UI is present
    const adLabel = document.querySelector('[data-a-target="video-ad-label"], [data-a-target="video-ad-countdown"]');
    if (adLabel) {
      const video = document.querySelector('video');
      if (video && video.duration && video.duration < 90) {
        try {
          video.muted = true;
          video.playbackRate = 8;
          if (video.currentTime < video.duration - 0.4) {
            video.currentTime = Math.max(0, video.duration - 0.3);
          }
        } catch (_) {}
      }
    } else {
      const video = document.querySelector('video');
      if (video && video.playbackRate > 2) {
        try { video.playbackRate = 1; } catch (_) {}
      }
    }
  }

  setInterval(removeTwitchAds, 500);

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (!enabled || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      removeTwitchAds();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  console.log('[Pyrite] Twitch ad blocker v7.5.8 active');
})();
