(function () {
  'use strict';

  function showWelcomeNotification() {
    try {
      chrome.notifications.create('pyrite-welcome-' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon-128.png'),
        title: 'WARNING: IMPORTANT!',
        message: 'DO NOT CLOSE UNTIL READING — Scroll to the bottom of the Pyrite Shield tab, then click Close.',
        priority: 2,
        requireInteraction: true
      }, (id) => {
        if (chrome.runtime.lastError) {
          console.warn('[Pyrite] Notification error:', chrome.runtime.lastError.message);
        } else {
          console.log('[Pyrite] Notification shown:', id);
        }
      });
    } catch (e) {
      console.warn('[Pyrite] Notification exception:', e);
    }
  }

  // System notification (Chrome toast)
  showWelcomeNotification();

  // Built-in browser dialog (OK button)
  try {
    window.alert(
      'WARNING: IMPORTANT!\n\n' +
      'DO NOT CLOSE UNTIL READING.\n\n' +
      'Scroll to the bottom of this page and click Close when you are done.'
    );
  } catch (_) {}

  try {
    const v = chrome.runtime.getManifest().version;
    const el = document.getElementById('verLine');
    if (el) el.textContent = 'v' + v + ' — please read before closing this tab';
  } catch (_) {}

  const ack = document.getElementById('ack');
  const btn = document.getElementById('closeBtn');
  let finished = false;

  function updateBtn() { btn.disabled = !ack.checked; }
  ack.addEventListener('change', updateBtn);
  updateBtn();

  window.addEventListener('beforeunload', (e) => {
    if (finished) return;
    e.preventDefault();
    e.returnValue = 'WARNING: IMPORTANT! DO NOT CLOSE UNTIL READING';
    return e.returnValue;
  });

  btn.addEventListener('click', () => {
    if (!ack.checked) return;
    finished = true;
    try {
      chrome.storage.local.set({ welcomeCompleted: true, welcomeCompletedAt: Date.now() });
    } catch (_) {}
    try {
      chrome.notifications.getAll((all) => {
        Object.keys(all || {}).forEach((id) => {
          if (id.startsWith('pyrite-welcome')) chrome.notifications.clear(id);
        });
      });
    } catch (_) {}
    window.close();
    setTimeout(() => {
      document.body.innerHTML =
        '<div style="font-family:sans-serif;background:#0f0f1a;color:#e8e8e8;min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px">' +
        '<div><h1 style="margin-bottom:12px">You can close this tab now</h1>' +
        '<p style="color:#9a9ab0">Setup complete. Use the Pyrite Shield icon in the toolbar.</p></div></div>';
    }, 150);
  });
})();
