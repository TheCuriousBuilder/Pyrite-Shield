// ============================================================
// Pyrite Shield v7.8.2 Sponsored Content Blocker
// ============================================================
(function () {
  'use strict';

  const hostname = window.location.hostname.replace(/^www\./, '');
  if (!hostname.includes('facebook.com') && !hostname.includes('fb.com') && !hostname.includes('messenger.com')) return;

  let enabled = true;
  chrome.storage.local.get(['blockerEnabled', 'blockFacebook'], (result) => {
    if (result.blockerEnabled === false || result.blockFacebook === false) enabled = false;
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.blockerEnabled) enabled = changes.blockerEnabled.newValue !== false;
    if (changes.blockFacebook) {
      if (changes.blockFacebook.newValue === false) enabled = false;
      else chrome.storage.local.get(['blockerEnabled'], (r) => { enabled = r.blockerEnabled !== false; });
    }
  });

  function removeFBAds() {
    if (!enabled) return;

    // Sponsored feed units
    document.querySelectorAll([
      '[data-pagelet^="FeedUnit"]:has([aria-label*="Sponsored" i])',
      '[data-pagelet^="FeedUnit"]:has([href*="/ads/about"])',
      '[aria-label="Sponsored content" i]',
      '[aria-label*="Sponsored" i]',
      '[data-testid$="-ad"]',
      '[id*="fbFeedStory"][data-ft*="is_sponsored"]',
      '[data-pagelet^="FeedUnit"]:has([data-testid*="sponsor" i])',
      '[data-pagelet^="FeedUnit"]:has([href*="/business/ads"])',
      'div[data-testid="ad_unit"]',
      '[data-ft*="sponsored"]',
      '[role="article"]:has([aria-label*="Sponsored" i])',
      '[role="article"]:has([data-testid*="sponsor" i])',
      '[role="article"]:has(a[href*="/ads/about"])',
      'div[aria-label*="Suggested for you" i]',
      '[data-pagelet="FeedUnit_0"]:has(span:is(:contains("Sponsored"), [aria-label*="Sponsored"]))'
    ].join(',')).forEach((el) => {
      try { el.style.display = 'none'; el.setAttribute('data-pyrite-hidden', '1'); } catch (_) {}
    });

    // Right rail + marketplace ads
    document.querySelectorAll([
      '[data-testid="right-rail-ads"]',
      '[id*="right_ads"]',
      '[class*="rightRailAd"]',
      '[data-pagelet="RightRailAds"]',
      '[data-pagelet*="Marketplace"][class*="ad"]',
      '[class*="marketplaceAd"]'
    ].join(',')).forEach((el) => {
      try { el.remove(); } catch (_) {}
    });
  }

  setInterval(removeFBAds, 1500);

  let scheduled = false;
  const observer = new MutationObserver(() => {
    if (!enabled || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      removeFBAds();
    });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  console.log('[Pyrite] Facebook ad blocker v7.8.2 active');
})();
