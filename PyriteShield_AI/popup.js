document.getElementById('opts').onclick = () => chrome.runtime.openOptionsPage();

function isRestrictedUrl(url) {
  if (!url) return true;
  return /^(chrome|edge|about|chrome-extension|moz-extension|devtools):/i.test(url) ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('https://chromewebstore.google.com');
}

async function runOnActiveTab(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (isRestrictedUrl(tab.url)) {
    setPopupMsg('Can\'t run on browser/internal pages — open a regular website first.');
    return;
  }
  const payload = { type: 'PSAI_RUN', mode, selectionText: '' };
  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch (_) {
    // Content script may not be injected yet (e.g. page loaded before install/update)
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['content.css'] });
      await chrome.tabs.sendMessage(tab.id, payload);
    } catch (e) {
      console.warn('[Pyrite AI]', e);
      setPopupMsg('Could not run on this page. Try a regular website.');
      return;
    }
  }
  window.close();
}

function setPopupMsg(text) {
  let el = document.getElementById('psaiPopupMsg');
  if (!el) {
    el = document.createElement('p');
    el.id = 'psaiPopupMsg';
    el.style.cssText = 'color:#fc8181;font-size:11px;margin-top:8px';
    document.querySelector('main').appendChild(el);
  }
  el.textContent = text;
}

document.getElementById('sumPage').onclick = () => runOnActiveTab('summarize_page');
document.getElementById('sumVideo').onclick = () => runOnActiveTab('summarize_video');
document.getElementById('openPanel').onclick = () => runOnActiveTab('toggle');
