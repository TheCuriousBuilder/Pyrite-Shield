// ============================================================
// Pyrite Shield v7.0.1 Ad Blocker (Ultimate Edition)
// Blocks ads on ALL websites including YouTube, Twitch, Facebook, Netflix
// ============================================================
(function() {
  'use strict';

  const hostname = window.location.hostname.replace(/^www\./, '');

  // Einthusan is fully handled by the dedicated einthusan.js module, which has
  // player-aware exclusions. First-party product apps (Google Workspace,
  // Microsoft 365, Apple, Amazon, PayPal/Stripe/Square, and major banks) never
  // get the automatic ad heuristics either — they broke Chat, Gmail, Drive,
  // Docs, Meet, Accounts, etc. Dedicated youtube.js still handles YouTube.
  // DNR continues to block third-party ads on all of these regardless.
  //
  // This used to `return` out of the entire script on these hosts, which also
  // silently killed the message listener below — meaning the manual Zap
  // button and the popup's toggle never worked there either, with no way to
  // fix it by reloading since the script exited before registering anything.
  // AUTO_BLOCKING_EXEMPT instead only gates the automatic-blocking calls
  // further down, so the zapper and message listener always get set up.
  const PROTECTED_PRODUCT_HOSTS = /^(?:(?:mail|chat|drive|docs|sheets|slides|calendar|meet|photos|classroom|keep|contacts|maps|translate|news|books|play|music|tv|earth|chrome|workspace|admin|myaccount|accounts|ogs|hangouts|clients\d*|apis|www|encrypted-tbn\d*|lh\d*|ssl|fonts|ajax)\.)?google\.com$|^(?:google|googleapis|gstatic|googleusercontent|ggpht|ytimg)\.|(?:^|\.)(?:microsoft|office|live|outlook|onedrive|sharepoint|azure|microsoftonline|office365)\.com$|(?:^|\.)(?:apple|icloud|me)\.com$|(?:^|\.)(?:amazon|aws)\.com$|(?:^|\.)(?:paypal|stripe|square)\.com$|(?:^|\.)(?:bankofamerica|wellsfargo|chase|citi|capitalone)\.com$/i;
  const isProtectedProductHost =
    (PROTECTED_PRODUCT_HOSTS.test(hostname) || hostname.endsWith('.google.com') || hostname === 'google.com') &&
    !hostname.includes('youtube.com') && !hostname.includes('youtu.be');
  const AUTO_BLOCKING_EXEMPT = /(^|\.)einthusan\.(tv|com)$/.test(hostname) || isProtectedProductHost;

  let enabled = true;
  let globalEnabled = true;
  let siteWhitelisted = false;
  let zapperMode = false;
  let zapperOverlay = null;
  let zapperListeners = [];
  // Stack of recently zapped elements so they can be unblocked/restored.
  // Capped to avoid unbounded memory growth on pages where someone zaps a lot.
  let zappedStack = [];
  const ZAPPED_STACK_LIMIT = 25;

  function isHostWhitelisted(host, list) {
    if (!Array.isArray(list)) return false;
    return list.some((entry) => {
      const clean = entry.replace(/^\*\./, '');
      return host === clean || host.endsWith('.' + clean);
    });
  }

  function updateEnabled() {
    enabled = !AUTO_BLOCKING_EXEMPT && globalEnabled && !siteWhitelisted;
    if (!enabled) {
      document.getElementById('pyrite-adblock-css')?.remove();
    } else {
      injectAdHidingCSS();
    }
  }

  // Read toggle + whitelist state from storage
  chrome.storage.local.get(['blockerEnabled', 'whitelist'], (result) => {
    globalEnabled = result.blockerEnabled !== false;
    siteWhitelisted = isHostWhitelisted(hostname, result.whitelist);
    updateEnabled();
  });
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.blockerEnabled) globalEnabled = changes.blockerEnabled.newValue !== false;
    if (changes.whitelist) siteWhitelisted = isHostWhitelisted(hostname, changes.whitelist.newValue);
    if (changes.blockerEnabled || changes.whitelist) updateEnabled();
  });

  // ================================================================
  // AD / TRACKER / MALWARE DOMAINS — 400+ domains
  // ================================================================
  const AD_DOMAINS = [
    // --- Google / DoubleClick ---
    'doubleclick.net', 'ad.doubleclick.net', 'securepubads.g.doubleclick.net',
    'cm.g.doubleclick.net', 'pubads.g.doubleclick.net', 'g.doubleclick.net',
    'googlesyndication.com', 'pagead2.googlesyndication.com', 'pagead2.googlepages.com',
    'googleadservices.com', 'googletagservices.com', 'googletagmanager.com',
    'google-analytics.com', 'ssl.google-analytics.com',
    // Do NOT block googlevideo.com or gstatic.com — they deliver YouTube media
    // streams and legitimate Google static assets (accounts.google.com login,
    // fonts, sign-in JS). Path-based checks still catch their ad endpoints.
    'adservice.google.com', 'adservice.google.co.uk', 'adservice.google.co.jp',
    'adservice.google.de', 'adservice.google.fr', 'adservice.google.ca',
    'adservice.google.com.au', 'adservice.google.nl', 'adservice.google.it',
    'adservice.google.es', 'adservice.google.co.in', 'adservice.google.com.br',
    'admanager.google.com',
    // --- Amazon ---
    'amazon-adsystem.com', 'aax.amazon-adsystem.com', 'advertising.amazon.com',
    'amazonadsi.com', 'rcm-na.amazon-adsystem.com', 'rcm-eu.amazon-adsystem.com',
    'ws-na.amazon-adsystem.com', 'ws-eu.amazon-adsystem.com',
    // --- Taboola ---
    'taboola.com', 'trc.taboola.com', 'taboolasyndication.com', 'taboolanews.com',
    'cdn.taboola.com', 'popup.taboola.com', 'images.taboola.com',
    // --- Outbrain ---
    'outbrain.com', 'widgets.outbrain.com', 'outbrainimg.com', 'odb.outbrain.com',
    'amplify.outbrain.com', 'amplify-imp.outbrain.com', 'images.outbrain.com',
    // --- Yahoo / Verizon / Oath ---
    // Do NOT block bare yahoo.com / aol.com / yimg.com — they break the entire
    // Yahoo/AOL experience; only their ad/analytics subdomains are listed.
    'advertising.yahoo.com', 'ads.yahoo.com', 'gemini.yahoo.com',
    'overture.com', 'adinterax.com', 'adtech.com', 'adtech.de', 'adtechus.com',
    'adtechjp.com', 'advertising.com', 'atwola.com', 'specificmedia.com',
    'adserver.aol.com', 'adtech.aol.com', 'advertising.aol.com',
    'analytics.yahoo.com',
    // --- Criteo ---
    'criteo.com', 'criteo.net', 'sslwidget.criteo.com', 'widget.criteo.com',
    'static.criteo.net', 'cas.criteo.com', 'dis.criteo.com', 'dis.criteo.net',
    'criteo-partners.com', 'cat.criteo.com', 'bilder.criteo.com', 'tap.criteo.com',
    // --- AppNexus / Xandr ---
    'appnexus.com', 'appnexus.net', 'adnxs.com', 'adnxs.net', 'ib.adnxs.com',
    'cdn.adnxs.com', 'secure.adnxs.com', 'audienceadnetwork.com',
    'xandr.com', 'xandr.net', 'adserver.adnxs.com', 'acdn.adnxs.com',
    'rtb.adnxs.com', 'mediation.adnxs.com', 'mobile.adnxs.com',
    // --- Rubicon Project / Magnite ---
    'rubiconproject.com', 'pixel.rubiconproject.com', 'fastlane.rubiconproject.com',
    'magnet.com', 'magnite.com', 'rubicon.com', 'exelator.com',
    // --- PubMatic ---
    'pubmatic.com', 'showads.pubmatic.com', 'ads.pubmatic.com',
    'image.pubmatic.com', 'creative.pubmatic.com', 'simage.pubmatic.com',
    'pubmatic.co.uk', 'hbopenbid.pubmatic.com',
    // --- OpenX ---
    'openx.net', 'oxado.com', 'openx.com', 'servedbyopenx.com',
    'servedbyadbutler.com', 'oxfarm.com', 'oxcash.com',
    // --- Index Exchange ---
    'indexww.com', 'casalemedia.com', 'improvedigital.com',
    // --- LiveRamp / Acxiom ---
    // Do NOT block akamaihd.net — it is a general-purpose CDN used by many
    // legitimate sites (not just ads).
    'rlcdn.com', 'krxd.net', 'bluekai.com', 'demdex.net',
    'dpm.demdex.net', 'adsymptotic.com', 'agkn.com', 'idsync.rlcdn.com',
    'pippio.com', 'towerdata.com', 'neustar.biz',
    // --- The Trade Desk ---
    'adsrvr.org', 'adsco.re', 'thetradedesk.com', 'innovid.com',
    'adcloud.com', 'adiquity.com', 'adsrvmedia.net',
    // --- Media.net ---
    'media.net', 'mediaplex.com', 'media6degrees.com',
    // --- SiteScout / Centro ---
    'sitescout.com', 'centro.net', 'contextweb.com', 'datx.com',
    // --- Exponential / Tribal Fusion ---
    'exponential.com', 'tribalfusion.com', 'conversantmedia.com',
    'dotomi.com', 'valueclick.com', 'valueclick.net', 'valueclickmedia.com',
    // --- Smaato ---
    'smaato.net', 'smaato.com', 'smaatonews.com',
    // --- AdForm ---
    'adform.net', 'adform.com', 'track.adform.net', 'tracking.adform.net',
    'adx.adform.net', 'adformdsp.net', 'adform.de',
    // --- BidSwitch ---
    'bidswitch.net', 'bidswitch.com', 'bidswitch.org',
    // --- Turn / DataXu ---
    'turn.com', 'd.turn.com', 'dataxu.com', 'mathtag.com',
    'adzerk.net', 'adzerk.com', 'ezserver.com',
    // --- ShareThrough ---
    'sharethrough.com', 'sthrt.com', 'sovrn.com',
    // --- SpotX ---
    'spotxchange.com', 'spotx.tv', 'spotx.com', 'www.spotxchange.com',
    // --- Teads ---
    'teads.tv', 'teads.net', 'cdn.teads.tv', 'static.teads.tv',
    'a.teads.tv', 't.teads.tv',
    // --- Tremor Video ---
    'tremorvideo.com', 'tremormedia.com', 'videohub.com',
    'unrulymedia.com', 'video.unrulymedia.com',
    // --- YieldMo ---
    'yieldmo.com', 'yieldmo.net', 'ads.yieldmo.com',
    // --- Zemanta ---
    'zemanta.com', 'zmg.com', 'zmanta.com',
    // --- ZergNet ---
    'zergnet.com', 'zergit.com', 'zergmedia.com',
    // --- Outbrain alternatives ---
    'revcontent.com', 'mgid.com', 'adboost.com', 'adbrain.com',
    'content.ad.com', 'content.ad', 'contentwidgets.net',
    // --- Disqus ---
    'disqus.com', 'disqusads.com', 'disquscdn.com',
    // --- ScorecardResearch / Comscore ---
    'scorecardresearch.com', 'sb.scorecardresearch.com', 'comscore.com',
    'comscore.net', 'scorecard.com',
    // --- Quantcast ---
    'quantserve.com', 'quantcount.com', 'pixel.quantserve.com',
    'quantserve.net', 'quantserve.de', 'quantcast.com',
    // --- Moat ---
    'moatads.com', 'moatvideo.com', 'moat.com', 'js.moatads.com',
    'securemoat.com', 'z.moatads.com',
    // --- Nielsen ---
    'nielsen.com', 'imrworldwide.com', 'imrworldwide.co.uk',
    'imrworldwide.de', 'snrworldwide.com',
    // --- Adobe Analytics ---
    'adobedtm.com', 'demdex.com', 'adobe.com/audiencemanager',
    'omniture.com', 'omtrdc.net', '2o7.net',
    // --- Facebook ---
    'facebook.com/tr', 'facebook.net', 'connect.facebook.net',
    'connect.facebook.com', 'pixel.facebook.com', 'an.facebook.com',
    'creative.facebook.com', 'business.facebook.com',
    'atdmt.com', 'fbcdn.net', 'pixel.instagram.com',
    // --- Twitter ---
    'analytics.twitter.com', 'ads-twitter.com', 't.co',
    'twitter.com/i/ads', 'twitter.com/ads', 'static.twitter.com',
    'platform.twitter.com', 'cdn.syndication.twimg.com',
    // --- LinkedIn ---
    'ads.linkedin.com', 'linkedin.com/px', 'www.linkedin.com/px',
    'platform.linkedin.com', 'snap.licdn.com',
    // --- Pinterest ---
    'analytics.pinterest.com', 'ct.pinterest.com', 'trk.pinterest.com',
    'pin.it/analytics', 'pinterest.com/pinrep',
    // --- TikTok ---
    'ads.tiktok.com', 'tiktok.com/pixel', 'analytics.tiktok.com',
    'ads-api.tiktok.com', 'p16-tiktokcdn-com.akamaized.net',
    // --- Snapchat ---
    'snapchat.com/ads', 'ads.snapchat.com', 'tr.snapchat.com',
    'sc-static.net', 'pixel.snapchat.com',
    // --- Microsoft / Bing ---
    'bat.bing.com', 'bing.com/fd/ls/bap', 'bing.com/ad',
    'msn.com/ads', 'clarity.ms', 'widget.copilot.com',
    // --- Hotjar ---
    'hotjar.com', 'static.hotjar.com', 'in.hotjar.com',
    'script.hotjar.com', 'vars.hotjar.com', 'surveys.hotjar.com',
    // --- Mixpanel ---
    'mixpanel.com', 'cdn.mxpnl.com', 'mxpnl.com', 'api.mixpanel.com',
    'decide.mixpanel.com',
    // --- Amplitude ---
    'amplitude.com', 'api.amplitude.com', 'cdn.amplitude.com',
    'd24n15hnbwhuhn.cloudfront.net',
    // --- Segment ---
    'segment.com', 'segment.io', 'cdn.segment.com', 'cdn.segment.io',
    'api.segment.io', 'scripts.segment.com', 'analytics.segment.com',
    // --- FullStory ---
    'fullstory.com', 'rs.fullstory.com', 'edge.fullstory.com',
    // --- Heap ---
    'heap-api.com', 'heapanalytics.com', 'cdn.heapanalytics.com',
    'cdn.heap-api.com',
    // --- Session Recording ---
    'mouseflow.com', 'cdn.mouseflow.com', 'luckyorange.com',
    'cdn.luckyorange.com', 'crazyegg.com', 'crazzyegg.com',
    'clicktale.com', 'clicktale.net', 'sessioncam.com',
    'inspectlet.com', 'logrocket.com', 'lre-logrocket.com',
    'smartlook.com', 'cdn.smartlook.com', 'fullstory.com',
    // --- Optimizely / VWO / AB Testing ---
    'optimizely.com', 'cdn.optimizely.com', 'vwo.com',
    'cdn.vwo.com', 'abtasty.com', 'try.abtasty.com',
    'googleoptimize.com', 'siteab.com',
    // --- New Relic ---
    'newrelic.com', 'nr-data.net', 'js-agent.newrelic.com',
    'bam.nr-data.net',
    // --- Error Tracking ---
    'bugsnag.com', 'sentry.io', 'cdn.ravenjs.com',
    'rollbar.com', 'dcdn.rollbar.com',
    // --- Affiliate / Tracking ---
    'dwin1.com', 'cj.com', 'commissionjunction.com',
    'clickbank.net', 'skimresources.com', 'imp.partnerize.com',
    'linksynergy.com', 'linktracker.com', 'affiliate.com',
    'shareasale.com', 'clkoffers.com', 'tradedoubler.com',
    'zanox.com', 'awin.com', 'webgains.com',
    // --- Push Notification ---
    'onesignal.com', 'cdn.onesignal.com', 'pushengage.com',
    'pushcrew.com', 'pushowl.com', 'pushwind.com',
    // --- Live Chat / Support ---
    'tawk.to', 'embed.tawk.to', 'livechatinc.com',
    'cdn.livechatinc.com', 'crisp.chat', 'zopim.com',
    'intercom.io', 'static.intercomcdn.com',
    // --- Anti-Adblock Detectors ---
    'blockadblock.io', 'adblockdetector.com', 'is-adblock.com',
    'pagefair.com', 'pagefair.net', 'blockadblock.com',
    'fuckadblock.com', 'adblockanalytics.com', 'detectadblock.com',
    'blockthrough.com', 'adblockfusion.com', 'adtector.com',
    // --- Popup / Popunder ---
    'popads.net', 'popcash.net', 'popadscdn.net', 'popsmart.net',
    'popunder.net', 'popunder.com', 'popupmedia.com',
    'avazudsp.net', 'adbutler.com', 'adkengage.com',
    'exoclick.com', 'exosrv.com', 'ad-maven.com',
    'mgcash.com', 'propellerads.com', 'propellerpops.com',
    // --- Streaming site specific ---
    'jwplayer.com', 'cdn.jwplayer.com', 'vast.jwplayer.com',
    'vidazoo.com', 'vidazoo.net', 'connatix.com',
    'cdn.connatix.com', 'playbuzz.com', 'cloudflare-ipfs.com',
    'ipfs.io', 'uploaded.net', 'rapidgator.net',
    'openload.co', 'streamango.com', 'verystream.com',
    'thevideo.me', 'cloudvideo.tv', 'burstcloud.co',
    // --- Font / Pixel trackers ---
    'addthis.com', 'addthisedge.com', 'addthiscdn.com',
    'sharethis.com', 'addtoany.com', 'sumo.com',
    'sumome.com', 'sumocdn.com', 'shareaholic.com',
    // --- Fingerprinting ---
    'fingerprintjs.com', 'fpjs.io', 'js.fpcdn.net',
    'perimeterx.com', 'px-cdn.net', 'distilnetworks.com',
    'datadome.co', 'datadome.net', 'botguard.net',
    // --- Cryptominers / Malvertising ---
    'coinhive.com', 'crypto-loot.com', 'afminer.com',
    'coin-have.com', 'coinblind.com', 'minr.pw',
    'webmine.pro', 'monerominer.rocks', 'ppoi.org',
    'jsecoin.com', 'coinimp.com', 'deepminer.net',
    'ad-miner.com', 'statdynamic.com', 'loadmoney.biz',
    // --- Russian / Chinese Ad Networks ---
    'yastatic.net', 'an.yandex.ru', 'mc.yandex.ru',
    'yandex.ru/tracker', 'yandex.ru/ads', 'yandex.com/ads',
    'adriver.ru', 'adfox.ru', 'adnet.com.cn',
    'ads.cn', 'ad-plus.cn', 'alimama.com',
    'tanx.com', 'simba.taobao.com', 'mmstat.com',
    'cpro.baidu.com', 'e.baidu.com', 'baidustatic.com',
    // --- Samsung / Smart TV ---
    'samsungads.com', 'samsung.com/ads', 'samsunganalytics.com',
    // --- Commerical Ad Servers (general) ---
    'adserver.com', 'adserver.net', 'adserver.co',
    'adx.com', 'adnet.com', 'admedia.com',
    'adacado.com', 'adnium.com', 'adnuntius.com',
    'adrotate.com', 'adspeed.com', 'adswizz.com',
    'adtech.org', 'advanse.com', 'adverline.com',
    'advangelists.com', 'adium.com', 'advertisingnetwork.com',
    'adwise.com', 'adzerk.org', 'adzmedia.com',
    'bidr.io', 'bidtellect.com', 'brainlyads.com',
    'buysellads.com', 'carbonads.com', 'clickadu.com',
    'codefund.com', 'convertro.com', 'countly.com',
    'cpmstar.com', 'creativecdn.com', 'currencyfair.com',
    'dedicatedmedia.com', 'exmarketplace.com', 'eyewide.com',
    'fusionserv.com', 'generativead.com', 'getresponse.com',
    'globalsdot.com', 'goldbach.com', 'goodadvert.com',
    'gumgum.com', 'inmobi.com', 'insticator.com',
    'integralads.com', 'internetadnetwork.com', 'kiosked.com',
    'leadboltads.net', 'lineads.net', 'linkedads.com',
    'listrak.com', 'lockerdome.com', 'longtailvideo.com',
    'madadsmedia.com', 'marimedia.com', 'marktest.com',
    'mediaforge.com', 'mediagrid.net', 'medianet.com',
    'meteorsolutions.com', 'millennialmedia.com', 'mobfox.com',
    'mobpartner.com', 'monetate.com', 'netseer.com',
    'nrelate.com', 'nuffnang.com', 'oath.com',
    'open-ad-stream.com', 'openx.com', 'opera.com/ads',
    'orbengine.com', 'pafnetwork.com', 'parkingcrew.com',
    'peakadvertising.com', 'platformad.com', 'plista.com',
    'po.st', 'polarcdn.com', 'powerlinks.com',
    'precisionclick.com', 'pro-market.net', 'prometheus.com',
    'pubgears.com', 'pulsemgr.com', 'purchasd.com',
    'qadserve.com', 'rafmedia.com', 'reklamport.com',
    'remintrex.com', 'retargetly.com', 'richaudience.com',
    'roitracking.com', 'rtbidder.com', 'rubiconmedia.com',
    'sascdn.com', 'saymedia.com', 'screenmediadaily.com',
    'sdkad.com', 'searchads.com', 'selapop.com',
    'servedbyadopt.com', 'servedbypub.net', 'sexad.net',
    'shorte.st', 'shorte.com', 'skipad.com',
    'smartadserver.com', 'sonobi.com', 'sponsorads.com',
    'sportsad.net', 'spoutable.com', 'springclick.com',
    'stormiq.com', 'stpd.cloud', 'subscribead.com',
    'supertop.com', 'synacor.com', 'tagger.com',
    'tapad.com', 'targeted.com', 'targetmedia.com',
    'tatsumi-sports.com', 'thrills.com', 'topads.com',
    'trafficfactory.biz', 'trafficholder.com', 'trafficjunky.com',
    'triggit.com', 'triplelift.com', 'trueh.com',
    'tuscoro.com', 'tynt.com', 'ubmads.com',
    'ucfunnel.com', 'underdogmedia.com', 'undertone.com',
    'unico.com', 'userreport.com', 'vcommission.com',
    'vegatech.com', 'vibrantmedia.com', 'videohub.org',
    'viewablemedia.com', 'visiblemeasures.com', 'w55c.net',
    'wayn.com', 'webads.com', 'weblyzard.com',
    'wedonttrack.com', 'whiteops.com', 'wideorbit.com',
    'wikia-ads.com', 'wpadmngr.com', 'xad.com',
    'yieldbot.com', 'yieldify.com', 'yieldlab.net',
    'yieldlove.com', 'yieldoptimizer.com', 'yieldpartners.com',
    'yieldx.com', 'yoc.com', 'zedo.com',
    'zeotap.com', 'zmedia.com', 'advertising.yandex.ru',
    // --- Additional Trackers ---
    'ipify.org', 'ip-api.com', 'ipinfo.io',
    'extreme-ip-lookup.com', 'whoisxmlapi.com',
    'flagcounter.com', 'histats.com', 'revolvermaps.com',
    'sitemeter.com', 'statcounter.com', 'whos.amung.us',
    'feedjit.com', 'bravenet.com', 'cbox.ws',
    'chatango.com', 'plugrush.com', 'xxxfuckads.com',
    'pornhub.com/ads', 'adultcam.com/ads',
  ];

  const BLOCKED = new Set(AD_DOMAINS.map(d => d.replace(/^www\./, '')));

  // ================================================================
  // EXTENDED AD CSS SELECTORS — Target ad containers NOT video players
  // ================================================================
  const AD_SELECTORS = [
    '.video-ads', '.ytp-ad-module', '.ytp-ad-overlay-container',
    '.ytp-ad-image-overlay', '.ytp-ad-text-overlay',
    '.ytp-ad-player-overlay', '.ytp-ad-action-interrupt-background',
    '.ytp-ad-action-interrupt-container', '.ytp-ad-progress-list',
    '.ytp-ad-message-overlay', '.ytp-ad-badge',
    '#masthead-ad', '#player-ads', '#footer-ads', '#header-ads',
    'ytd-ad-slot-renderer', 'ytd-display-ad-renderer',
    'ytd-promoted-video-renderer', 'ytd-compact-promoted-video-renderer',
    'ytd-promoted-sparkles-text-search-renderer',
    'ytd-video-masthead-ad-advertiser-info-renderer',
    'ytd-in-feed-ad-tile-renderer', 'ytd-banner-promo-renderer',
    'ytd-ad-slot-renderer[is-slot]',
    'ytd-statement-banner-renderer[is-ad]',
    'ytd-merchandise-shelf-renderer[is-ad]',
    'ytd-video-masthead-ad-v3-renderer',
    'ins.adsbygoogle',
    'div[class*="ad-container"]', 'div[class*="ad-slot"]',
    'div[class*="advertisement"]', 'div[id*="google_ads"]',
    'div[id*="div-gpt-ad"]', 'div[data-ad-target]',
    'div[class*="ad-tag"]', 'div[class*="ad-banner"]',
    'div[class*="advertisement"]', 'div[class*="sponsored-content"]',
    'div[id*="advertisement"]', 'div[id*="sponsored"]',
    'a[class*="sponsored-link"]', 'a[class*="advertisement"]',
    '.ad-unit', '.ad-box', '.ad-wrapper', '.ad-div',
    '.ad-section', '.ad-block', '.ad-placeholder',
    '.ad-label', '.ad-text', '.ad-title',
    '.ad-message', '.ad-area', '.ad-banner',
    '.ad-container-banner', '.ad-container-overlay',
    '.ad-container-single', '.ad-container-multiple',
    '.adblock-warning', '.anti-adblock', '.adblock-detected',
    '#adblock-modal', '.adblock-overlay', '.adblock-message',
    '.adblock-notice', '.adblock-alert',
    'body > div[style*="fixed"]:has(> div[class*="adblock"])',
    'body > div[style*="fixed"]:has(> div[id*="adblock"])',
    'body > div[style*="absolute"]:has(> div[class*="adblock"])',
    'div[class*="adblock"]:has(img[src*="block"])',
    '[id*="popup-ad"]', '[class*="popup-ad"]',
    '[id*="overlay-ad"]', '[class*="overlay-ad"]',
    '[id*="interstitial"]', '[class*="interstitial"]',
  ];

  // Streaming domains for site-specific ad removal
  const STREAMING_DOMAINS = [
    'einthusan', 'eintusan', '123movies', 'putlocker',
    'fmovies', 'gomovies', 'soap2day', 'sflix', 'lookmovie',
    'primewire', 'yesmovies', 'movierulz', 'tamilrockers',
    'cinemaz', 'kissanime', 'gogoanime', '9anime', 'zoro.to',
    'animepahe', 'animedao', 'aniwatch', 'hianime',
    'netflix', 'hulu', 'disneyplus', 'hbomax', 'hotstar',
    'amazonprime', 'primevideo'
  ];
  const isStreamingSite = STREAMING_DOMAINS.some(s => hostname.includes(s));

  // ================================================================
  // Utility: Check if a URL is from an ad domain
  // ================================================================
  function isAdURL(url) {
    if (!url) return false;
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      // Never treat first-party Google product / static / API hosts as ads
      // (except explicit YouTube ad endpoints checked further below).
      const isGoogleFirstParty =
        host === 'google.com' ||
        host.endsWith('.google.com') ||
        host.endsWith('.googleapis.com') ||
        host.endsWith('.gstatic.com') ||
        host.endsWith('.googleusercontent.com') ||
        host.endsWith('.ggpht.com') ||
        host.endsWith('.ytimg.com');
      if (isGoogleFirstParty && !host.includes('youtube.com') && !host.includes('googlevideo.com') &&
          !host.includes('doubleclick') && !host.includes('googlesyndication') &&
          !host.includes('googleadservices') && !host.includes('googletag') &&
          !host.includes('google-analytics') && !host.includes('adservice.google')) {
        return false;
      }
      if (BLOCKED.has(host)) return true;
      const parts = host.split('.');
      for (let i = 1; i < parts.length - 1; i++) {
        if (BLOCKED.has('*.' + parts.slice(i).join('.'))) return true;
      }
      // Path-based heuristics — keep specific so legitimate paths like
      // accounts.google.com or site /admin/ads dashboards are not blocked.
      const path = u.pathname.toLowerCase();
      if (path.includes('/pagead/') || path.includes('/stats/ads') ||
          path.includes('/api/ads') || path.includes('/youtubei/v1/ads') ||
          path.includes('/get_midroll_info') || path.includes('/ptracking') ||
          path.includes('/advertisement/') || path.includes('/adserver/') ||
          path.includes('/adframe/') || path.includes('/adiframe/') ||
          path.includes('/adsbygoogle') || path.includes('/pagead/js/') ||
          // Only treat /ads/ or /ad/ as ad when host itself looks like an ad network
          ((path.includes('/ads/') || path.includes('/ad/')) &&
            (host.includes('ad.') || host.includes('ads.') || host.includes('doubleclick') ||
             host.includes('googlesyndication') || host.includes('adserver') ||
             host.includes('advert') || host.includes('adnxs') || host.includes('rubicon')))) {
        return true;
      }
      return false;
    } catch { return false; }
  }

  // ================================================================
  // Remove ad iframes, scripts, and images (NOT video elements)
  // ================================================================
  function blockAdIframes() {
    document.querySelectorAll('iframe[src]').forEach(el => {
      if (isAdURL(el.src)) { el.src = ''; el.remove(); }
    });
    document.querySelectorAll('script[src]').forEach(el => {
      if (isAdURL(el.src)) { el.type = 'javascript/blocked'; el.remove(); }
    });
    document.querySelectorAll('img[src]').forEach(el => {
      if (isAdURL(el.src)) { el.src = ''; el.remove(); }
    });
    document.querySelectorAll('a[href]').forEach(el => {
      if (isAdURL(el.href)) { el.href = '#'; el.style.pointerEvents = 'none'; el.style.opacity = '0.1'; }
    });
  }

  // ================================================================
  // YouTube-specific: Remove ALL ad formats, click skip, keep video
  // ================================================================
  let ytObserver = null;
  function removeYouTubeAds() {
    // Only precise ad nodes — never generic AD_SELECTORS (breaks profile/Create/menus)
    if (!hostname.includes('youtube.com') || !enabled) return;

    document.querySelectorAll(
      '.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button, .ytp-skip-ad-button'
    ).forEach(btn => { try { btn.click(); } catch(e) {} });

    const YT_AD_ONLY = [
      '.video-ads', '.ytp-ad-module', '.ytp-ad-overlay-container',
      '.ytp-ad-image-overlay', '.ytp-ad-text-overlay',
      '.ytp-ad-player-overlay', '.ytp-ad-action-interrupt-background',
      '.ytp-ad-action-interrupt-container', '.ytp-ad-progress-list',
      '.ytp-ad-message-overlay', '.ytp-ad-badge',
      '#masthead-ad', '#player-ads', '#footer-ads',
      'ytd-ad-slot-renderer', 'ytd-display-ad-renderer',
      'ytd-promoted-video-renderer', 'ytd-compact-promoted-video-renderer',
      'ytd-promoted-sparkles-text-search-renderer',
      'ytd-promoted-sparkles-web-renderer',
      'ytd-video-masthead-ad-advertiser-info-renderer',
      'ytd-video-masthead-ad-v3-renderer',
      'ytd-in-feed-ad-tile-renderer', 'ytd-banner-promo-renderer',
      'ytd-statement-banner-renderer',
      'ytd-ad-slot-renderer[is-slot]'
    ].join(',');

    document.querySelectorAll(YT_AD_ONLY).forEach(el => {
      if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
      if (el.closest && el.closest('#avatar-btn, #buttons, #masthead-container ytd-topbar-menu-button-renderer, #guide-button, ytd-masthead, #create-icon')) return;
      try { el.remove(); } catch(e) {}
    });
  }

  // ================================================================
  // Streaming site: Remove popups, overlays, ad iframes (NOT video)
  // ================================================================
  function removeStreamingAds() {
    if (!isStreamingSite || !enabled) return;

    document.querySelectorAll('iframe[src]').forEach(el => {
      const src = (el.src || '').toLowerCase();
      if (src.includes('doubleclick') || src.includes('ad.') || src.includes('popup') ||
          src.includes('banner') || src.includes('adservice') || src.includes('affiliate') ||
          src.match(/ads?\./) || src.match(/ad[A-Z]/) || isAdURL(el.src)) {
        el.remove();
      }
    });

    document.querySelectorAll('[id*="popup"], [class*="popup"], [id*="overlay"], [class*="overlay"]').forEach(el => {
      const idc = ((el.id || '') + ' ' + (typeof el.className === 'string' ? el.className : '')).toLowerCase();
      if (el.id === 'video-player' || el.classList.contains('player') ||
          el.id === 'movie-player' || el.id === 'main-video' ||
          el.id === 'player' || el.tagName === 'VIDEO' || el.tagName === 'SOURCE' ||
          el.id === 'video-container' || el.classList.contains('video-container') ||
          idc.includes('player') || idc.includes('play-') || idc.includes('-play') ||
          idc.includes('loading') || idc.includes('poster') || idc.includes('spinner')) return;
      el.remove();
    });

    document.querySelectorAll('[id*="adblock"], [class*="adblock"]').forEach(el => {
      if (el.id === 'video-player' || el.classList.contains('player') ||
          el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
      el.remove();
    });
  }

  // ================================================================
  // MutationObserver — Watch for dynamically injected ads
  // ================================================================
  let observerTimeout = null;
  const observer = new MutationObserver(() => {
    if (!enabled) return;
    if (observerTimeout) clearTimeout(observerTimeout);
    observerTimeout = setTimeout(() => {
      if (!hostname.includes('youtube.com') && !hostname.includes('youtu.be')) {
        document.querySelectorAll(AD_SELECTORS.join(',')).forEach(el => {
          if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
          // Never remove interactive chrome
          if (el.closest && el.closest('button, a, ytd-topbar-menu-button-renderer, #avatar-btn, #buttons, #masthead, #guide')) return;
          el.remove();
        });
      }
      blockAdIframes();
      if (hostname.includes('youtube.com')) removeYouTubeAds();
      if (isStreamingSite) removeStreamingAds();
    }, 100);
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: false });

  // ================================================================
  // CSS injection — Hide ad containers only (NEVER video elements)
  // ================================================================
  function injectAdHidingCSS() {
    // YouTube UI uses many "popup"/"menu" patterns — generic hide rules break
    // profile, Create, notifications, etc. Dedicated youtube.js handles ads.
    if (hostname.includes('youtube.com') || hostname.includes('youtu.be')) return;
    const oldStyle = document.getElementById('pyrite-adblock-css');
    if (oldStyle) oldStyle.remove();

    const style = document.createElement('style');
    style.id = 'pyrite-adblock-css';
    style.textContent = `
      .video-ads, .ytp-ad-module, .ytp-ad-overlay-container,
      .ytp-ad-image-overlay, .ytp-ad-text-overlay,
      .ytp-ad-player-overlay, .ytp-ad-action-interrupt-background,
      .ytp-ad-action-interrupt-container, .ytp-ad-progress-list,
      .ytp-ad-message-overlay, .ytp-ad-badge,
      #masthead-ad, #player-ads, #footer-ads, #header-ads,
      ytd-ad-slot-renderer, ytd-display-ad-renderer,
      ytd-promoted-video-renderer, ytd-compact-promoted-video-renderer,
      ytd-promoted-sparkles-text-search-renderer,
      ytd-video-masthead-ad-advertiser-info-renderer,
      ytd-in-feed-ad-tile-renderer, ytd-banner-promo-renderer,
      ytd-merchandise-shelf-renderer[is-ad],
      ins.adsbygoogle {
        display: none !important; height: 0 !important; width: 0 !important;
        opacity: 0 !important; pointer-events: none !important;
        position: absolute !important; overflow: hidden !important;
        clip: rect(0,0,0,0) !important;
      }
      div[class*="ad-container"], div[class*="ad-slot"],
      div[class*="advertisement"], div[id*="google_ads"],
      div[id*="div-gpt-ad"], div[data-ad-target],
      .ad-unit, .ad-box, .ad-wrapper, .ad-div,
      .ad-section, .ad-block, .ad-placeholder,
      .ad-label, .ad-text, .ad-title,
      .ad-message, .ad-area, .ad-banner,
      div[class*="ad-tag"], div[class*="ad-banner"] {
        display: none !important;
      }
      .adblock-warning, .anti-adblock, .adblock-detected,
      #adblock-modal, .adblock-overlay, .adblock-message,
      .adblock-notice, .adblock-alert {
        display: none !important;
      }
      html, body {
        overflow: auto !important; position: static !important;
        max-height: none !important; height: auto !important;
        width: auto !important; margin: 0 !important;
        padding: 0 !important; top: auto !important; left: auto !important;
      }
      body > :first-child { margin-top: 0 !important; }
      [id*="popup"]:not([id*="video"]):not([id*="player"]):not([id*="settings"]):not([id*="menu"]):not([id*="search"]),
      [class*="popup"]:not([class*="video"]):not([class*="player"]):not([class*="settings"]):not([class*="menu"]):not([class*="search"]) {
        display: none !important;
      }
      /* Facebook feed ads */
      [data-pagelet^="FeedUnit"]:has([aria-label*="Sponsored"]),
      [data-pagelet^="FeedUnit"]:has([href*="/ads/about"]),
      [aria-label="Sponsored content"], [aria-label*="Sponsor"],
      [data-testid$="-ad"], [id*="fbFeedStory"][data-ft*="\u0022is_sponsored\u0022"] {
        display: none !important;
      }
      /* Twitch ads */
      .tw-absolute.tw-full-width.tw-full-height[class*="player-ad-overlay"],
      .persistent-player .player-ad-overlay,
      [class*="video-ad-overlay"], [class*="ad-unit"],
      [data-a-target="video-ad-overlay"] {
        display: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  // ================================================================
  // Anti-adblock detection circumvention
  // ================================================================
  function setupAntiAdblockBypass() {
    const originalDefineProperty = Object.defineProperty;
    Object.defineProperty = function(obj, prop, desc) {
      if (prop === 'adblock' || prop === 'adBlock' || prop === 'ad_block' ||
          prop === 'isAdblock' || prop === 'is_adblock' || prop === 'isAdBlock') {
        return originalDefineProperty(obj, prop, {
          get: () => false, set: () => {}, configurable: false, enumerable: true
        });
      }
      return originalDefineProperty(obj, prop, desc);
    };

    const originalGetComputedStyle = window.getComputedStyle;
    window.getComputedStyle = function(el, pseudoElt) {
      const style = originalGetComputedStyle.call(window, el, pseudoElt);
      if (el && el.getAttribute && (
          el.getAttribute('class') === 'advert-bait' || el.id === 'advert-bait' ||
          el.getAttribute('class') === 'ad-bait' || el.id === 'ad-bait'
        )) {
        return {
          getPropertyValue: (prop) => {
            if (prop === 'display' || prop === 'height' || prop === 'width') return 'auto';
            return style.getPropertyValue(prop);
          },
          ...style
        };
      }
      return style;
    };

    const originalFetch = window.fetch;
    window.fetch = function(input, init) {
      const url = typeof input === 'string' ? input : (input?.url || '');
      if (isAdURL(url)) return Promise.resolve(new Response('', { status: 204 }));
      return originalFetch.call(window, input, init);
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...args) {
      if (isAdURL(url)) { this.abort = function() {}; return; }
      return originalOpen.call(this, method, url, ...args);
    };
  }

  // ================================================================
  // Element Zapper — Click to block an element
  // ================================================================
  function showPageToast(msg) {
    let toast = document.getElementById('pyrite-page-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'pyrite-page-toast';
      toast.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:#16213e;color:#e8e8e8;border:1px solid #2d3748;padding:8px 16px;border-radius:8px;font:600 12px -apple-system,sans-serif;z-index:2147483647;box-shadow:0 4px 20px rgba(0,0,0,0.4);transition:opacity 0.2s;pointer-events:none;';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
  }

  // Restores the most recently zapped element to its original position in
  // the DOM (using the parent + next-sibling reference captured at zap time).
  function unblockLastElement(silent) {
    while (zappedStack.length) {
      const entry = zappedStack.pop();
      // The parent itself may have been removed/replaced since the zap
      // (page re-render, another zap on an ancestor, etc.) — skip stale
      // entries rather than throwing, and try the next one down the stack.
      if (!entry.parent || !entry.parent.isConnected) continue;
      try {
        if (entry.nextSibling && entry.nextSibling.isConnected && entry.nextSibling.parentNode === entry.parent) {
          entry.parent.insertBefore(entry.node, entry.nextSibling);
        } else {
          entry.parent.appendChild(entry.node);
        }
        entry.node.style.display = entry.originalDisplay || '';
        if (!silent) showPageToast('✅ Element restored');
        chrome.runtime.sendMessage({ action: 'elementUnblocked' }).catch(() => {});
        return true;
      } catch {
        continue;
      }
    }
    if (!silent) showPageToast('Nothing left to restore');
    return false;
  }

  function unblockAllElements() {
    let count = 0;
    while (unblockLastElement(true)) count++;
    showPageToast(count ? `✅ Restored ${count} element${count === 1 ? '' : 's'}` : 'Nothing left to restore');
    return count;
  }

  function createZapperOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'pyrite-zapper-overlay';
    // pointer-events:none is the key fix — the overlay is now purely visual.
    // It used to be the actual click target, which meant any page element
    // with a higher z-index (many ad/popup overlays deliberately use very
    // high values) would sit above it and receive the real click instead,
    // activating the ad rather than zapping it.
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;cursor:crosshair;pointer-events:none;';
    document.body.appendChild(overlay);

    const highlight = document.createElement('div');
    highlight.id = 'pyrite-zapper-highlight';
    highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:3px solid #ff4444;background:rgba(255,68,68,0.15);display:none;border-radius:4px;';
    document.body.appendChild(highlight);

    const onMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== overlay && el !== highlight) {
        const rect = el.getBoundingClientRect();
        highlight.style.display = 'block';
        highlight.style.left = rect.left + 'px';
        highlight.style.top = rect.top + 'px';
        highlight.style.width = rect.width + 'px';
        highlight.style.height = rect.height + 'px';
      } else {
        highlight.style.display = 'none';
      }
    };

    const onClick = (e) => {
      // Capture phase on document + preventDefault/stopPropagation here runs
      // before the click reaches its real target, so this stops link
      // navigation, popups, and any page click handler from firing —
      // regardless of what element the browser would have hit-tested to.
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      if (el && el !== overlay && el !== highlight) {
        zappedStack.push({ node: el, parent: el.parentNode, nextSibling: el.nextSibling, originalDisplay: el.style.display });
        if (zappedStack.length > ZAPPED_STACK_LIMIT) zappedStack.shift();
        el.style.display = 'none';
        el.remove();
        showPageToast('🚫 Element blocked — Ctrl+Shift+Z to undo');
        chrome.runtime.sendMessage({ action: 'elementZapped', selector: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') }).catch(() => {});
      }
      deactivateZapper();
    };

    const onKey = (e) => {
      if (e.key === 'Escape') deactivateZapper();
    };

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    document.documentElement.style.cursor = 'crosshair';

    zapperListeners = [{ el: document, type: 'mousemove', fn: onMove }, { el: document, type: 'click', fn: onClick }, { el: document, type: 'keydown', fn: onKey }];
    zapperOverlay = overlay;
  }

  function deactivateZapper() {
    zapperListeners.forEach(({ el, type, fn }) => el.removeEventListener(type, fn, true));
    zapperListeners = [];
    document.getElementById('pyrite-zapper-overlay')?.remove();
    document.getElementById('pyrite-zapper-highlight')?.remove();
    document.documentElement.style.cursor = '';
    zapperOverlay = null;
    zapperMode = false;
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'enableZapper') {
      zapperMode = true;
      if (!zapperOverlay) createZapperOverlay();
    } else if (message.action === 'disableZapper') {
      deactivateZapper();
    } else if (message.action === 'unblockLastElement') {
      const restored = unblockLastElement(true);
      sendResponse({ restored });
      return true;
    } else if (message.action === 'unblockAllElements') {
      const count = unblockAllElements();
      sendResponse({ count });
      return true;
    } else if (message.action === 'getZappedCount') {
      sendResponse({ count: zappedStack.length });
      return true;
    }
    return true;
  });

  // Global undo shortcut — works any time after a zap, not just while the
  // zapper is actively selecting, since you often notice you want an
  // element back after you've already moved on.
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && (e.key === 'Z' || e.key === 'z')) {
      e.preventDefault();
      unblockLastElement();
    }
  }, true);

  // ================================================================
  // Initialization
  // ================================================================
  function safeCleanup() {
    if (!enabled) return;
    if (hostname.includes('youtube.com')) removeYouTubeAds();
    if (isStreamingSite) removeStreamingAds();
    blockAdIframes();
  }

  function init() {
    console.log('[Pyrite] 🛡️ Ad blocking engine v7.0.1 active on:', hostname);

    setupAntiAdblockBypass();
    blockAdIframes();
    injectAdHidingCSS();

    if (hostname.includes('youtube.com')) {
      setInterval(() => {
        if (!enabled) return;
        const skipBtns = document.querySelectorAll('.ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-skip-button-container button');
        skipBtns.forEach(btn => btn.click());
        removeYouTubeAds();
      }, 800);
    }

    if (isStreamingSite) {
      setInterval(safeCleanup, 2000);
    }

    setInterval(() => {
      if (!enabled) return;
      if (!hostname.includes('youtube.com') && !hostname.includes('youtu.be')) {
        document.querySelectorAll(AD_SELECTORS.join(',')).forEach(el => {
          if (el.tagName === 'VIDEO' || el.tagName === 'SOURCE') return;
          if (el.closest && el.closest('button, a, ytd-topbar-menu-button-renderer, #avatar-btn, #buttons, #masthead, #guide')) return;
          el.remove();
        });
      }
      blockAdIframes();
    }, 3000);

    console.log('[Pyrite] ✅ Ad blocking ready');
  }

  if (!AUTO_BLOCKING_EXEMPT) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }
})();