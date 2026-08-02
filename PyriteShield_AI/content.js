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
      // fallback: window copy if exposed
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
      const u = url.replace(/&fmt=\w+/, '') + (url.includes('fmt=') ? '' : '') ;
      // prefer srv3/json3 if possible
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
      // json3
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

  /** Sample a few frames from the playing <video> as data URLs (for optional multimodal later / context note) */
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
      const dur = video.duration;
      if (!dur || !isFinite(dur)) {
        ctx.drawImage(video, 0, 0, w, h);
        frames.push(canvas.toDataURL('image/jpeg', 0.6));
        return frames;
      }
      const t0 = video.currentTime;
      // Can't seek synchronously mid-flight easily without async; capture current frame only here
      ctx.drawImage(video, 0, 0, w, h);
      frames.push(canvas.toDataURL('image/jpeg', 0.6));
      video.currentTime = t0;
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
      // prefer English
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

    const frames = sampleVideoFrames(1);
    const frameNote = frames.length
      ? `\n\n[Player frame captured at current position — spoken content below is the primary source.]`
      : '';

    if (transcript && transcript.length > 80) {
      return `Title: ${title}\nVideo ID: ${id}\n${frameNote}\n\nFULL SPOKEN TRANSCRIPT:\n${transcript}`;
    }

    return (
      `Title: ${title}\nVideo ID: ${id}\n\n` +
      `No captions/transcript could be downloaded for this video.\n` +
      `Description:\n${desc || '(none)'}\n\n` +
      `Tip: open the … menu → Show transcript on YouTube, then try again; or pick a video with captions enabled.`
    );
  }

  function ensurePanel() {
    let root = document.getElementById('psai-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'psai-root';
    root.innerHTML = `
      <div class="psai-panel">
        <div class="psai-hd"><strong>✦ PyriteShield AI</strong><button type="button" class="psai-x">×</button></div>
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
        <div class="psai-actions"><button type="button" class="psai-copy">Copy</button><span class="psai-status"></span></div>
      </div>`;
    document.documentElement.appendChild(root);
    root.querySelector('.psai-x').onclick = () => root.classList.remove('open');
    root.querySelector('.psai-copy').onclick = async () => {
      try {
        await navigator.clipboard.writeText(root.querySelector('.psai-out').innerText);
        setStatus('Copied');
      } catch (_) {
        setStatus('Copy failed');
      }
    };
    root.querySelectorAll('.psai-modes button').forEach((btn) => {
      btn.addEventListener('click', () => run(btn.getAttribute('data-mode')));
    });
    return root;
  }

  function setStatus(m) {
    const el = document.querySelector('#psai-root .psai-status');
    if (el) el.textContent = m || '';
  }

  function showPanel() {
    const root = ensurePanel();
    root.classList.add('open');
    return root;
  }

  async function run(mode, selectionText) {
    const root = showPanel();
    const out = root.querySelector('.psai-out');
    const extra = root.querySelector('.psai-ask').value.trim();
    out.textContent = 'Working…';
    setStatus('');

    let text = (selectionText || getSelectionText() || '').trim();

    try {
      if (mode === 'summarize_video') {
        if (!isYouTube()) {
          out.textContent = 'Open a YouTube watch page first.';
          return;
        }
        out.textContent = 'Reading video captions / transcript…';
        text = await collectVideoContext();
      } else if (mode === 'summarize_page') {
        text = getPageText().slice(0, 100000);
      } else if (!text) {
        out.textContent = 'Highlight text first, or use Page / Video.';
        return;
      }

      if (mode === 'ask' && !extra) {
        out.textContent = 'Type a question above, then click Ask.';
        return;
      }

      const res = await chrome.runtime.sendMessage({
        type: 'PSAI_GENERATE',
        payload: { mode, text, extra, pageUrl: location.href }
      });
      if (!res?.ok) {
        out.textContent = res?.error || 'Failed';
        setStatus('Error');
        return;
      }
      out.textContent = res.text;
      setStatus('Done');
    } catch (e) {
      out.textContent = e.message || String(e);
      setStatus('Error');
    }
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'PSAI_RUN') run(msg.mode, msg.selectionText || '');
  });

  if (!document.getElementById('psai-fab')) {
    const fab = document.createElement('button');
    fab.id = 'psai-fab';
    fab.type = 'button';
    fab.title = 'PyriteShield AI';
    fab.textContent = '✦';
    fab.onclick = () => showPanel();
    document.documentElement.appendChild(fab);
  }
})();
