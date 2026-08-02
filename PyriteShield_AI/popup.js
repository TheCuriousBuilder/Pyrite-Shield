document.getElementById('opts').onclick = () => chrome.runtime.openOptionsPage();

async function runOnActiveTab(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
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
    }
  }
  window.close();
}

document.getElementById('sumPage').onclick = () => runOnActiveTab('summarize_page');
document.getElementById('sumVideo').onclick = () => runOnActiveTab('summarize_video');
