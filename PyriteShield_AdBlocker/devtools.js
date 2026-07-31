// DevTools page - creates the Pyrite Shield panel
chrome.devtools.panels.create(
  'Pyrite Shield',
  'icons/icon-32.png',
  'devtools-panel.html',
  (panel) => {
    console.log('[Pyrite] DevTools panel created');
  }
);

