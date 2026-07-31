// ============================================================
// Pyrite Shield v7.8.2 Ad Blocker (UI-safe)
// Skips ads without touching profile / Create / menus
// ============================================================
(function () {
  'use strict';

  const hostname = window.location.hostname.replace(/^www\./, '');
  if (!hostname.includes('youtube.com') && !hostname.includes('youtu.be')) return;

  let enabled = true;
  chrome.storage.local.get(['blockerEnabled', 'blockYouTube'], (result) => {
    if (result.blockerEnabled === false || result.blockYouTube === false) enabled = false;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.blockerEnabled) {
      enabled = changes.blockerEnabled.newValue !== false;
      if (changes.blockYouTube?.newValue === false) enabled = false;
    }
    if (changes.blockYouTube) {
      if (changes.blockYouTube.newValue === false) enabled = false;
      else chrome.storage.local.get(['blockerEnabled'], (r) => {
        enabled = r.blockerEnabled !== false;
      });
    }
  });

  // Only real ad chrome — never generic [class*="ad"] or popup/menu selectors
  const SKIP_SELECTORS = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-container button',
    '.ytp-skip-ad-button',
    'button.ytp-ad-skip-button-modern',
    '.ytp-ad-skip-button-slot button',
    '.videoAdUiSkipButton',
    '.ytp-ad-overlay-close-button'
  ].join(',');

  const AD_ONLY_SELECTORS = [
    '.video-ads',
    '.ytp-ad-module',
    '.ytp-ad-overlay-container',
    '.ytp-ad-image-overlay',
    '.ytp-ad-text-overlay',
    '.ytp-ad-player-overlay',
    '.ytp-ad-player-overlay-layout',
    '.ytp-ad-action-interrupt-background',
    '.ytp-ad-action-interrupt-container',
    '.ytp-ad-progress-list',
    '.ytp-ad-message-overlay',
    '.ytp-ad-badge',
    '.ytp-ad-info-dialog-container',
    '.ytp-ad-player-overlay-instream-info',
    '#masthead-ad',
    '#player-ads',
    '#footer-ads',
    'ytd-ad-slot-renderer',
    'ytd-display-ad-renderer',
    'ytd-promoted-video-renderer',
    'ytd-compact-promoted-video-renderer',
    'ytd-promoted-sparkles-text-search-renderer',
    'ytd-promoted-sparkles-web-renderer',
    'ytd-video-masthead-ad-advertiser-info-renderer',
    'ytd-video-masthead-ad-v3-renderer',
    'ytd-in-feed-ad-tile-renderer',
    'ytd-banner-promo-renderer',
    'ytd-statement-banner-renderer',
    'ytd-ad-slot-renderer[is-slot]'
  ].join(',');

  function isProtectedChrome(el) {
    if (!el || !(el instanceof Element)) return true;
    if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return true;
    if (el.classList?.contains('html5-main-video') || el.classList?.contains('video-stream')) return true;
    if (el.id === 'movie_player' || el.id === 'player-container') return true;
    // Top bar: avatar, Create, notifications, search, logo, guide
    if (el.closest?.('#masthead, #masthead-container, ytd-masthead, #guide, #guide-button, #avatar-btn, #buttons, #end, #center, #start, ytd-topbar-menu-button-renderer, ytd-notification-topbar-button-renderer, yt-icon-button, #create-icon, #button')) {
      // Allow removal only if it is a known ad slot under masthead
      if (el.matches?.('#masthead-ad, ytd-ad-slot-renderer, ytd-banner-promo-renderer, ytd-video-masthead-ad-v3-renderer, ytd-video-masthead-ad-advertiser-info-renderer')) {
        return false;
      }
      return true;
    }
    return false;
  }

  function clickSkipButtons() {
    document.querySelectorAll(SKIP_SELECTORS).forEach((btn) => {
      try { btn.click(); } catch (_) {}
    });
  }

  function removeAdContainers() {
    document.querySelectorAll(AD_ONLY_SELECTORS).forEach((el) => {
      if (isProtectedChrome(el)) return;
      try { el.remove(); } catch (_) {}
    });
  }

  function killPlayingAd() {
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (!player) return;

    const isAd =
      player.classList.contains('ad-showing') ||
      player.classList.contains('ad-interrupting');

    if (!isAd) return;

    clickSkipButtons();

    const video = player.querySelector('video.html5-main-video, video.video-stream, video');
    if (video && !isNaN(video.duration) && video.duration > 0 && video.duration < 120) {
      try {
        if (video.currentTime < video.duration - 0.5) {
          video.currentTime = Math.max(0, video.duration - 0.3);
        }
        video.playbackRate = 16;
        video.muted = true;
      } catch (_) {}
    }
  }

  function restoreNormalPlayback() {
    const player = document.querySelector('#movie_player, .html5-video-player');
    if (!player) return;
    if (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting')) return;
    const video = player.querySelector('video.html5-main-video, video.video-stream, video');
    if (video && video.playbackRate > 2) {
      try { video.playbackRate = 1; } catch (_) {}
    }
  }

  function tick() {
    if (!enabled) return;
    clickSkipButtons();
    removeAdContainers();
    killPlayingAd();
    restoreNormalPlayback();
  }

  setInterval(tick, 400);

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (!enabled || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      tick();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tick);
  } else {
    tick();
  }

  console.log('[Pyrite] YouTube ad blocker v7.8.2 active');
})();
