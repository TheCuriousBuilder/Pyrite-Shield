// ============================================================
// Pyrite Shield v7.0.1 Panel Script
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const domainBody = $('domainBody');

  const fmt = (n) => n >= 1e6 ? (n/1e6).toFixed(1)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : String(n);

  const esc = (s) => {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  };

  async function refresh() {
    try {
      const stats = await chrome.runtime.sendMessage({ action: 'getStats' });
      if (!stats) return;
      $('totalBlocked').textContent = fmt(stats.totalBlocked || 0);
      $('sessionBlocked').textContent = fmt(stats.sessionBlocked || 0);

      const entries = Object.entries(stats.blockedDomains || {}).sort((a,b) => b[1]-a[1]).slice(0, 50);
      domainBody.innerHTML = '';
      for (const [domain, count] of entries) {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td class="domain">${esc(domain)}</td><td class="count">${count}</td>`;
        domainBody.appendChild(tr);
      }
      if (entries.length === 0) {
        domainBody.innerHTML = '<tr><td colspan="2" style="color:#6c6e8a;text-align:center;padding:20px;">No domains blocked yet</td></tr>';
      }
    } catch {}
  }

  refresh();
  setInterval(refresh, 5000);
});

