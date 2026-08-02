(() => {
  if (window.__PSAI_LOADED__) return;
  window.__PSAI_LOADED__ = true;

  function isYouTube() {
    const h = location.hostname.replace(/^www\./, '');
    return h === 'youtube.com' || h === 'youtu.be' || h.endsWith('.youtube.com');
  }

  function getSelectionText() {
    return (window.getSelection() && window.getSelection().toString()) || '';
  }

  function getPageText() {
    const article = document.querySelector('article');
    if (article?.innerText?.trim().length > 200) return article.innerText.trim();
    const main = document.querySelector('main');
    if (main?.innerText?.trim().length > 200) return main.innerText.trim();
    return document.body?.innerText || '';
  }

  function getVideoId() {
    try {
      if (location.hostname.includes('youtu.be')) {
        return location.pathname.split('/').filter(Boolean)[0] || '';
      }
      const v = new URLSearchParams(location.search).get('v');
      if (v) return v;
      const m = location.pathname.match(/\/shorts\/([^/?]+)/);
      return m ? m[1] : '';
    } catch (_) {
      return '';
    }
  }

  function getYouTubeTitle() {
    const el =
      document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
      document.querySelector('h1 yt-formatted-string') ||
      document.querySelector('h1.title') ||
      document.querySelector('h1');
    return el?.textContent?.trim() || document.title;
  }

  function getYouTubeDescription() {
    const el =
      document.querySelector('#description-inline-expander') ||
      document.querySelector('ytd-expander#description') ||
      document.querySelector('#description');
    return el?.innerText?.trim() || '';
  }

  function transcriptFromDom() {
    const nodes = document.querySelectorAll(
      'ytd-transcript-segment-renderer .segment-text, ytd-transcript-segment-renderer yt-formatted-string, .ytd-transcript-segment-renderer'
    );
    if (!nodes.length) return '';
    return Array.from(nodes)
      .map((n) => n.textContent.trim())
      .filter(Boolean)
      .join(' ');
  }

  /** Pull caption track URLs from ytInitialPlayerResponse in page HTML */
  function captionTracksFromPage() {
    try {
      const scripts = Array.from(document.querySelectorAll('script'));
      for (const s of scripts) {
        const t = s.textContent || '';
        if (!t.includes('captionTracks')) continue;
        const m = t.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});\s*(?:var|<\/)/);
        if (!m) continue;
        try {
          const json = JSON.parse(m[1]);
          const tracks =
            json?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
          return tracks;
        } catch (_) {}
      }
      if (window.ytInitialPlayerResponse) {
        return (
          window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer
            ?.captionTracks || []
        );
      }
    } catch (_) {}
    return [];
  }

  async function fetchTrackText(url) {
    try {
      let fetchUrl = url;
      if (!/fmt=/.test(fetchUrl)) fetchUrl += '&fmt=srv3';
      const res = await fetch(fetchUrl);
      const body = await res.text();
      if (body.includes('<text')) {
        return [...body.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
          .map((x) =>
            x[1]
              .replace(/&amp;/g, '&')
              .replace(/&lt;/g, '<')
              .replace(/&gt;/g, '>')
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/<[^>]+>/g, '')
              .trim()
          )
          .filter(Boolean)
          .join(' ');
      }
      try {
        const data = JSON.parse(body);
        const events = data.events || [];
        return events
          .map((e) => (e.segs || []).map((s) => s.utf8 || '').join(''))
          .join(' ')
          .replace(/\n/g, ' ')
          .trim();
      } catch (_) {
        return body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      }
    } catch (_) {
      return '';
    }
  }

  async function fetchTimedTextList(videoId) {
    try {
      const listUrl = `https://www.youtube.com/api/timedtext?type=list&v=${encodeURIComponent(videoId)}`;
      const listXml = await (await fetch(listUrl)).text();
      const langs = [...listXml.matchAll(/lang_code="([^"]+)"/g)].map((m) => m[1]);
      const prefer = langs.find((l) => /^en/i.test(l)) || langs[0];
      if (!prefer) return '';
      const trackUrl = `https://www.youtube.com/api/timedtext?lang=${encodeURIComponent(prefer)}&v=${encodeURIComponent(videoId)}&fmt=srv3`;
      return fetchTrackText(trackUrl);
    } catch (_) {
      return '';
    }
  }

  function sampleVideoFrames(count = 3) {
    try {
      const video = document.querySelector('video.html5-main-video, video');
      if (!video || video.readyState < 2) return [];
      const canvas = document.createElement('canvas');
      const w = 320;
      const h = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * w)) || 180;
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      const frames = [];
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(canvas.toDataURL('image/jpeg', 0.6));
      return frames;
    } catch (_) {
      return [];
    }
  }

  async function collectVideoContext() {
    const title = getYouTubeTitle();
    const desc = getYouTubeDescription();
    const id = getVideoId();

    let transcript = transcriptFromDom();

    if (!transcript || transcript.length < 80) {
      const tracks = captionTracksFromPage();
      tracks.sort((a, b) => {
        const ae = /^en/i.test(a.languageCode || '') ? 0 : 1;
        const be = /^en/i.test(b.languageCode || '') ? 0 : 1;
        return ae - be;
      });
      for (const tr of tracks) {
        if (!tr.baseUrl) continue;
        transcript = await fetchTrackText(tr.baseUrl);
        if (transcript && transcript.length > 80) break;
      }
    }

    if ((!transcript || transcript.length < 80) && id) {
      transcript = await fetchTimedTextList(id);
    }

    if (transcript && transcript.length > 80) {
      return { text: `Title: ${title}\nVideo ID: ${id}\n\nFULL SPOKEN TRANSCRIPT:\n${transcript}`, hadTranscript: true };
    }

    return {
      text:
        `Title: ${title}\nVideo ID: ${id}\n\n` +
        `No captions/transcript could be downloaded for this video.\n` +
        `Description:\n${desc || '(none)'}\n\n` +
        `Tip: open the … menu → Show transcript on YouTube, then try again; or pick a video with captions enabled.`,
      hadTranscript: false
    };
  }

  // ================================================================
  // Minimal, safe markdown renderer (headers, bold, italic, code,
  // lists, links) — LLM output is untrusted text, so everything is
  // HTML-escaped first and only our own generated tags are inserted.
  // ================================================================
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderMarkdown(md) {
    const escaped = escapeHtml(md);
    const lines = escaped.split('\n');
    let html = '';
    let inList = null; // 'ul' | 'ol' | null
    let inCodeBlock = false;
    let codeBuf = [];

    function closeList() {
      if (inList) { html += `</${inList}>`; inList = null; }
    }

    for (let raw of lines) {
      if (/^```/.test(raw.trim())) {
        if (inCodeBlock) {
          html += `<pre><code>${codeBuf.join('\n')}</code></pre>`;
          codeBuf = [];
          inCodeBlock = false;
        } else {
          closeList();
          inCodeBlock = true;
        }
        continue;
      }
      if (inCodeBlock) { codeBuf.push(raw); continue; }

      const line = raw.trim();
      if (!line) { closeList(); html += '<br>'; continue; }

      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        closeList();
        const level = h[1].length;
        html += `<h${level}>${inlineMd(h[2])}</h${level}>`;
        continue;
      }

      const ol = line.match(/^\d+[.)]\s+(.*)$/);
      const ul = line.match(/^[-*•]\s+(.*)$/);
      if (ol) {
        if (inList !== 'ol') { closeList(); html += '<ol>'; inList = 'ol'; }
        html += `<li>${inlineMd(ol[1])}</li>`;
        continue;
      }
      if (ul) {
        if (inList !== 'ul') { closeList(); html += '<ul>'; inList = 'ul'; }
        html += `<li>${inlineMd(ul[1])}</li>`;
        continue;
      }
      closeList();
      html += `<p>${inlineMd(line)}</p>`;
    }
    closeList();
    if (inCodeBlock && codeBuf.length) html += `<pre><code>${codeBuf.join('\n')}</code></pre>`;
    return html;
  }

  function inlineMd(s) {
    return s
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  // ================================================================
  // Main panel
  // ================================================================
  const MODE_LABELS = {
    explain: 'Explain', rewrite: 'Rewrite', summarize: 'Summarize',
    translate: 'Translate', ask: 'Ask', summarize_page: 'Page summary',
    summarize_video: 'Video summary'
  };

  let activePort = null;
  let currentTab = 'result'; // 'result' | 'history'

  function ensurePanel() {
    let root = document.getElementById('psai-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'psai-root';
    root.innerHTML = `
      <div class="psai-panel">
        <div class="psai-hd">
          <strong>✦ PyriteShield AI</strong>
          <div class="psai-hd-tabs">
            <button type="button" class="psai-tab active" data-tab="result">Result</button>
            <button type="button" class="psai-tab" data-tab="history">History</button>
          </div>
          <button type="button" class="psai-x" title="Close">×</button>
        </div>
        <div class="psai-body-result">
          <div class="psai-modes">
            <button data-mode="explain" type="button">Explain</button>
            <button data-mode="rewrite" type="button">Rewrite</button>
            <button data-mode="summarize" type="button">Summarize</button>
            <button data-mode="translate" type="button">Translate</button>
            <button data-mode="ask" type="button">Ask</button>
            <button data-mode="summarize_page" type="button">Page</button>
            <button data-mode="summarize_video" type="button">Video</button>
          </div>
          <textarea class="psai-ask" placeholder="Question or target language (optional)" rows="2"></textarea>
          <div class="psai-out">Highlight text, or use Page / Video.</div>
          <div class="psai-actions">
            <button type="button" class="psai-copy">Copy</button>
            <button type="button" class="psai-download">Save .md</button>
            <button type="button" class="psai-cancel" hidden>Cancel</button>
            <span class="psai-status"></span>
            <button type="button" class="psai-done">Done</button>
          </div>
        </div>
        <div class="psai-body-history" hidden>
          <div class="psai-history-list"></div>
          <div class="psai-actions">
            <button type="button" class="psai-clear-history">Clear history</button>
          </div>
        </div>
      </div>`;
    document.documentElement.appendChild(root);

    root.querySelector('.psai-x').onclick = () => root.classList.remove('open');
    root.querySelector('.psai-done').onclick = () => root.classList.remove('open');

    root.querySelectorAll('.psai-tab').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    root.querySelector('.psai-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(root.querySelector('.psai-out').innerText);
        setStatus('Copied');
      } catch (_) {
        setStatus('Copy failed');
      }
    };
    root.querySelector('.psai-download').onclick = () => {
      const text = root.querySelector('.psai-out').innerText;
      if (!text || text === 'Working…') return;
      const blob = new Blob([text], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pyrite-ai-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    };
    root.querySelector('.psai-cancel').onclick = () => {
      if (activePort) { activePort.postMessage({ type: 'CANCEL' }); }
      setStatus('Cancelled');
      root.querySelector('.psai-cancel').hidden = true;
    };
    root.querySelector('.psai-clear-history').onclick = async () => {
      await chrome.runtime.sendMessage({ type: 'PSAI_CLEAR_HISTORY' });
      renderHistory([]);
    };

    root.querySelectorAll('.psai-modes button').forEach((btn) => {
      btn.addEventListener('click', () => run(btn.getAttribute('data-mode')));
    });
    return root;
  }

  function switchTab(tab) {
    currentTab = tab;
    const root = document.getElementById('psai-root');
    if (!root) return;
    root.querySelectorAll('.psai-tab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === tab));
    root.querySelector('.psai-body-result').hidden = tab !== 'result';
    root.querySelector('.psai-body-history').hidden = tab !== 'history';
    if (tab === 'history') loadHistory();
  }

  async function loadHistory() {
    const history = await chrome.runtime.sendMessage({ type: 'PSAI_GET_HISTORY' });
    renderHistory(history || []);
  }

  function renderHistory(history) {
    const root = document.getElementById('psai-root');
    if (!root) return;
    const list = root.querySelector('.psai-history-list');
    if (!history.length) {
      list.innerHTML = '<div class="psai-empty">No history yet.</div>';
      return;
    }
    list.innerHTML = history.map((h) => `
      <div class="psai-hist-item" data-id="${h.id}">
        <div class="psai-hist-meta">
          <span class="psai-hist-mode">${MODE_LABELS[h.mode] || h.mode}</span>
          <span class="psai-hist-time">${new Date(h.time).toLocaleString()}</span>
        </div>
        <div class="psai-hist-snip">${escapeHtml((h.output || '').slice(0, 140))}${(h.output || '').length > 140 ? '…' : ''}</div>
      </div>
    `).join('');
    list.querySelectorAll('.psai-hist-item').forEach((el) => {
      el.addEventListener('click', () => {
        const entry = history.find((h) => h.id === el.getAttribute('data-id'));
        if (!entry) return;
        switchTab('result');
        const out = root.querySelector('.psai-out');
        out.innerHTML = renderMarkdown(entry.output || '');
        setStatus(`From history — ${new Date(entry.time).toLocaleString()}`);
      });
    });
  }

  function setStatus(m) {
    const el = document.querySelector('#psai-root .psai-status');
    if (el) el.textContent = m || '';
  }

  function showPanel() {
    const root = ensurePanel();
    root.classList.add('open');
    switchTab('result');
    return root;
  }

  function togglePanel() {
    const root = ensurePanel();
    if (root.classList.contains('open')) root.classList.remove('open');
    else showPanel();
  }

  async function run(mode, selectionText) {
    const root = showPanel();
    const out = root.querySelector('.psai-out');
    const cancelBtn = root.querySelector('.psai-cancel');
    const extra = root.querySelector('.psai-ask').value.trim();
    out.textContent = 'Working…';
    setStatus('');
    cancelBtn.hidden = false;

    let text = (selectionText || getSelectionText() || '').trim();

    try {
      if (mode === 'summarize_video') {
        if (!isYouTube()) {
          out.textContent = 'Open a YouTube watch page first.';
          cancelBtn.hidden = true;
          return;
        }
        out.textContent = 'Reading video captions / transcript…';
        const ctx = await collectVideoContext();
        text = ctx.text;
        if (!ctx.hadTranscript) setStatus('No transcript found — using title/description only');
      } else if (mode === 'summarize_page') {
        text = getPageText().slice(0, 100000);
      } else if (!text) {
        out.textContent = 'Highlight text first, or use Page / Video.';
        cancelBtn.hidden = true;
        return;
      }

      if (mode === 'ask' && !extra) {
        out.textContent = 'Type a question above, then click Ask.';
        cancelBtn.hidden = true;
        return;
      }

      out.textContent = '';
      streamRun(mode, text, extra, out, cancelBtn);
    } catch (e) {
      out.textContent = e.message || String(e);
      setStatus('Error');
      cancelBtn.hidden = true;
    }
  }

  function streamRun(mode, text, extra, out, cancelBtn) {
    if (activePort) { try { activePort.disconnect(); } catch (_) {} }
    const port = chrome.runtime.connect({ name: 'psai-stream' });
    activePort = port;
    let raw = '';
    let gotAnyChunk = false;

    port.onMessage.addListener((msg) => {
      if (msg.type === 'CHUNK') {
        gotAnyChunk = true;
        raw += msg.text;
        out.innerHTML = renderMarkdown(raw);
        out.scrollTop = out.scrollHeight;
      } else if (msg.type === 'DONE') {
        out.innerHTML = renderMarkdown(msg.text);
        setStatus('Done');
        cancelBtn.hidden = true;
        activePort = null;
      } else if (msg.type === 'ERROR') {
        if (!gotAnyChunk) out.textContent = msg.error;
        else out.innerHTML += `<p style="color:#fc8181">⚠ ${escapeHtml(msg.error)}</p>`;
        setStatus('Error');
        cancelBtn.hidden = true;
        activePort = null;
      } else if (msg.type === 'CANCELLED') {
        setStatus('Cancelled');
        cancelBtn.hidden = true;
        activePort = null;
      }
    });
    port.onDisconnect.addListener(() => { activePort = null; });
    port.postMessage({ type: 'START', payload: { mode, text, extra, pageUrl: location.href } });
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'PSAI_RUN') return;
    if (msg.mode === 'toggle') { togglePanel(); return; }
    run(msg.mode, msg.selectionText || '');
  });

  // ================================================================
  // Floating action button
  // ================================================================
  if (!document.getElementById('psai-fab')) {
    const fab = document.createElement('button');
    fab.id = 'psai-fab';
    fab.type = 'button';
    fab.title = 'PyriteShield AI (Alt+Shift+A)';
    fab.textContent = '✦';
    fab.onclick = () => togglePanel();
    document.documentElement.appendChild(fab);
  }

  // ================================================================
  // Auto-appearing selection mini-toolbar
  // ================================================================
  let miniToolbar = null;

  function removeMiniToolbar() {
    miniToolbar?.remove();
    miniToolbar = null;
  }

  function showMiniToolbar(x, y, text) {
    removeMiniToolbar();
    miniToolbar = document.createElement('div');
    miniToolbar.id = 'psai-mini';
    miniToolbar.innerHTML = `
      <button type="button" data-mode="explain">Explain</button>
      <button type="button" data-mode="summarize">Summarize</button>
      <button type="button" data-mode="rewrite">Rewrite</button>
      <button type="button" data-mode="translate">Translate</button>
    `;
    document.documentElement.appendChild(miniToolbar);
    const rect = miniToolbar.getBoundingClientRect();
    const left = Math.min(Math.max(8, x - rect.width / 2), window.innerWidth - rect.width - 8);
    const top = Math.max(8, y - rect.height - 10);
    miniToolbar.style.left = `${left + window.scrollX}px`;
    miniToolbar.style.top = `${top + window.scrollY}px`;
    miniToolbar.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('mousedown', (e) => {
        // mousedown (not click) so it fires before the selection is cleared by the ensuing click
        e.preventDefault();
        run(btn.getAttribute('data-mode'), text);
        removeMiniToolbar();
      });
    });
  }

  document.addEventListener('mouseup', (e) => {
    if (e.target.closest('#psai-mini, #psai-root, #psai-fab')) return;
    setTimeout(() => {
      const sel = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
      if (text && text.length > 2 && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (rect.width || rect.height) {
          showMiniToolbar(rect.left + rect.width / 2, rect.top, text);
          return;
        }
      }
      removeMiniToolbar();
    }, 0);
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#psai-mini')) removeMiniToolbar();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      removeMiniToolbar();
      document.getElementById('psai-root')?.classList.remove('open');
    }
  });
})();
