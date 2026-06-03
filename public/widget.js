/* Dashboard Advisor — floating widget.
 *
 * Self-contained, zero-dependency. Embed with:
 *   <script src="https://your-advisor/widget.js"
 *           data-dashboard-id="telegram-bots-dashboard"
 *           data-api="https://your-advisor"></script>
 *
 * Reads `data-dashboard-id` and `data-api` from its own <script> tag.
 * Degrades gracefully if the advisor API is unreachable.
 */
(function () {
  'use strict';

  // --- resolve config from the script tag --------------------------------
  var script =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName('script');
      return s[s.length - 1];
    })();

  var DASHBOARD_ID = (script && script.getAttribute('data-dashboard-id')) || '';
  var API = (script && script.getAttribute('data-api')) || '';
  // If no API given, assume the advisor served this script.
  if (!API && script && script.src) {
    try {
      API = new URL(script.src).origin;
    } catch (e) {
      API = '';
    }
  }
  API = API.replace(/\/$/, '');

  // Guard against double-injection.
  if (window.__dashboardAdvisorLoaded) return;
  window.__dashboardAdvisorLoaded = true;

  var CATEGORY_META = {
    Features: { icon: '✨', color: '#7c9eff' },
    'UI/UX': { icon: '🎨', color: '#f78fb3' },
    'Code Quality': { icon: '🧹', color: '#7ee0c0' },
    Integrations: { icon: '🔌', color: '#ffd479' },
    Performance: { icon: '⚡', color: '#ff9f7a' },
    Security: { icon: '🛡️', color: '#ff7a8a' },
  };
  var CATEGORY_ORDER = ['Features', 'UI/UX', 'Code Quality', 'Integrations', 'Performance', 'Security'];
  var PRIORITY_LABEL = { 1: 'Critical', 2: 'High', 3: 'Medium', 4: 'Low', 5: 'Trivial' };
  var PRIORITY_COLOR = { 1: '#ff5c6c', 2: '#ff9f43', 3: '#ffd166', 4: '#7ee0c0', 5: '#8aa0b2' };

  // --- styles (scoped via a unique prefix) -------------------------------
  var css =
    '.da-fab{position:fixed;right:24px;bottom:24px;width:60px;height:60px;border-radius:50%;' +
    'background:linear-gradient(135deg,#6a5cff,#9b5cff);color:#fff;font-size:28px;border:none;' +
    'cursor:pointer;box-shadow:0 8px 30px rgba(106,92,255,.45);z-index:2147483600;display:flex;' +
    'align-items:center;justify-content:center;transition:transform .2s,box-shadow .2s;}' +
    '.da-fab:hover{transform:translateY(-3px) scale(1.05);box-shadow:0 12px 38px rgba(106,92,255,.6);}' +
    '.da-fab:active{transform:scale(.96);}' +
    '.da-overlay{position:fixed;inset:0;background:rgba(5,8,15,.62);backdrop-filter:blur(4px);' +
    'z-index:2147483601;display:flex;align-items:flex-end;justify-content:flex-end;opacity:0;' +
    'transition:opacity .25s;}' +
    '.da-overlay.da-show{opacity:1;}' +
    '.da-panel{width:420px;max-width:100vw;height:100vh;background:#0d1320;color:#e6edf3;' +
    'border-left:1px solid rgba(255,255,255,.08);box-shadow:-20px 0 60px rgba(0,0,0,.5);' +
    'display:flex;flex-direction:column;transform:translateX(40px);transition:transform .25s;' +
    'font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;}' +
    '.da-overlay.da-show .da-panel{transform:translateX(0);}' +
    '.da-head{padding:18px 20px;display:flex;align-items:center;gap:10px;' +
    'border-bottom:1px solid rgba(255,255,255,.07);background:linear-gradient(135deg,rgba(106,92,255,.18),transparent);}' +
    '.da-title{font-size:16px;font-weight:700;flex:1;}' +
    '.da-sub{font-size:11px;color:#8aa0b2;font-weight:400;margin-top:2px;}' +
    '.da-x{background:none;border:none;color:#8aa0b2;font-size:22px;cursor:pointer;line-height:1;padding:4px;}' +
    '.da-x:hover{color:#fff;}' +
    '.da-bar{display:flex;gap:8px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,.06);}' +
    '.da-btn{flex:1;background:rgba(255,255,255,.06);color:#e6edf3;border:1px solid rgba(255,255,255,.08);' +
    'padding:9px 12px;border-radius:10px;font-size:13px;cursor:pointer;font-weight:600;transition:background .15s;}' +
    '.da-btn:hover{background:rgba(255,255,255,.12);}' +
    '.da-btn.da-primary{background:linear-gradient(135deg,#6a5cff,#9b5cff);border:none;}' +
    '.da-btn:disabled{opacity:.5;cursor:not-allowed;}' +
    '.da-body{flex:1;overflow-y:auto;padding:14px 16px 28px;}' +
    '.da-cat{margin:14px 4px 8px;font-size:12px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;' +
    'display:flex;align-items:center;gap:8px;}' +
    '.da-card{background:#121a2b;border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px;' +
    'margin-bottom:10px;transition:border-color .15s,transform .15s;}' +
    '.da-card:hover{border-color:rgba(124,158,255,.5);transform:translateY(-1px);}' +
    '.da-card-top{display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;}' +
    '.da-card-title{font-size:14px;font-weight:650;flex:1;line-height:1.3;}' +
    '.da-badge{font-size:10px;font-weight:700;padding:3px 8px;border-radius:999px;white-space:nowrap;color:#0b0f17;}' +
    '.da-desc{font-size:12.5px;color:#aab7c6;line-height:1.5;margin-bottom:12px;}' +
    '.da-exec{background:rgba(124,158,255,.14);color:#bcd0ff;border:1px solid rgba(124,158,255,.3);' +
    'padding:7px 14px;border-radius:8px;font-size:12.5px;font-weight:650;cursor:pointer;transition:background .15s;}' +
    '.da-exec:hover{background:rgba(124,158,255,.28);}' +
    '.da-exec:disabled{opacity:.6;cursor:default;}' +
    '.da-exec.da-done{background:rgba(126,224,192,.16);color:#7ee0c0;border-color:rgba(126,224,192,.4);}' +
    '.da-exec.da-fail{background:rgba(255,92,108,.16);color:#ff8a96;border-color:rgba(255,92,108,.4);}' +
    '.da-center{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;' +
    'text-align:center;color:#8aa0b2;gap:14px;padding:30px;}' +
    '.da-spin{width:38px;height:38px;border:3px solid rgba(124,158,255,.25);border-top-color:#7c9eff;' +
    'border-radius:50%;animation:da-rot .8s linear infinite;}' +
    '@keyframes da-rot{to{transform:rotate(360deg);}}' +
    '.da-summary{font-size:11.5px;color:#8aa0b2;padding:6px 6px 2px;line-height:1.5;}' +
    '@media(max-width:480px){.da-panel{width:100vw;border-left:none;}.da-fab{right:16px;bottom:16px;}}';

  function injectStyle() {
    var s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  // --- DOM helpers -------------------------------------------------------
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var overlay, body, reBtn, state = { suggestions: [], loading: false };

  function buildUI() {
    var fab = el('button', 'da-fab');
    fab.innerHTML = '💡';
    fab.setAttribute('aria-label', 'Open Dashboard Advisor');
    fab.title = 'Dashboard Advisor';
    fab.onclick = open;
    document.body.appendChild(fab);

    overlay = el('div', 'da-overlay');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-label', 'Dashboard Advisor suggestions');
    overlay.onclick = function (e) {
      if (e.target === overlay) close();
    };

    var panel = el('div', 'da-panel');

    var head = el('div', 'da-head');
    var hicon = el('div', null, '💡');
    hicon.style.fontSize = '22px';
    var htext = el('div');
    htext.style.flex = '1';
    var t = el('div', 'da-title', 'Dashboard Advisor');
    var sub = el('div', 'da-sub', DASHBOARD_ID || 'this dashboard');
    htext.appendChild(t);
    htext.appendChild(sub);
    var x = el('button', 'da-x', '×');
    x.setAttribute('aria-label', 'Close');
    x.onclick = close;
    head.appendChild(hicon);
    head.appendChild(htext);
    head.appendChild(x);

    var bar = el('div', 'da-bar');
    reBtn = el('button', 'da-btn da-primary');
    reBtn.innerHTML = '🔄 Re-analyze';
    reBtn.onclick = function () {
      analyze();
    };
    bar.appendChild(reBtn);

    body = el('div', 'da-body');

    panel.appendChild(head);
    panel.appendChild(bar);
    panel.appendChild(body);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
  }

  // --- rendering ---------------------------------------------------------
  function showLoading(msg) {
    body.innerHTML = '';
    var c = el('div', 'da-center');
    c.appendChild(el('div', 'da-spin'));
    c.appendChild(el('div', null, msg || 'Analyzing your dashboard…'));
    body.appendChild(c);
  }

  function showMessage(emoji, msg, hint) {
    body.innerHTML = '';
    var c = el('div', 'da-center');
    var e = el('div', null, emoji);
    e.style.fontSize = '40px';
    c.appendChild(e);
    c.appendChild(el('div', null, msg));
    if (hint) {
      var h = el('div', null, hint);
      h.style.fontSize = '12px';
      h.style.opacity = '.7';
      c.appendChild(h);
    }
    body.appendChild(c);
  }

  function render(summary) {
    body.innerHTML = '';
    if (summary) {
      body.appendChild(el('div', 'da-summary', summary));
    }
    var list = state.suggestions || [];
    if (!list.length) {
      showMessage('🎉', 'No suggestions — looking great!', 'Try re-analyzing after changes.');
      return;
    }

    var groups = {};
    list.forEach(function (s) {
      (groups[s.category] = groups[s.category] || []).push(s);
    });

    CATEGORY_ORDER.forEach(function (cat) {
      var items = groups[cat];
      if (!items || !items.length) return;
      var meta = CATEGORY_META[cat] || { icon: '•', color: '#7c9eff' };

      var header = el('div', 'da-cat');
      header.style.color = meta.color;
      header.appendChild(el('span', null, meta.icon));
      header.appendChild(el('span', null, cat + ' (' + items.length + ')'));
      body.appendChild(header);

      items
        .sort(function (a, b) {
          return (a.priority || 9) - (b.priority || 9);
        })
        .forEach(function (s) {
          body.appendChild(card(s));
        });
    });
  }

  function card(s) {
    var c = el('div', 'da-card');

    var top = el('div', 'da-card-top');
    top.appendChild(el('div', 'da-card-title', s.title));
    var pr = s.priority || 3;
    var badge = el('span', 'da-badge', PRIORITY_LABEL[pr] || 'Medium');
    badge.style.background = PRIORITY_COLOR[pr] || '#ffd166';
    top.appendChild(badge);
    c.appendChild(top);

    c.appendChild(el('div', 'da-desc', s.description));

    var exec = el('button', 'da-exec');
    var executed = s.status === 'executing' || s.status === 'done';
    exec.textContent = executed ? '✓ Sent to ' + (s.agent || 'agent') : '▶ Execute';
    if (executed) exec.classList.add('da-done');
    exec.disabled = executed || !s.id;
    if (!s.id) exec.title = 'Saved suggestions only — re-analyze with storage enabled';
    exec.onclick = function () {
      execute(s, exec);
    };
    c.appendChild(exec);
    return c;
  }

  // --- API calls ---------------------------------------------------------
  function api(path, opts) {
    return fetch(API + path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j && j.error ? j.error : 'HTTP ' + r.status);
        return j;
      });
    });
  }

  function loadExisting() {
    showLoading('Loading suggestions…');
    api('/api/suggestions?dashboardId=' + encodeURIComponent(DASHBOARD_ID))
      .then(function (j) {
        state.suggestions = j.suggestions || [];
        if (!state.suggestions.length) {
          // No stored suggestions yet → run a fresh analysis automatically.
          analyze();
        } else {
          render('Showing saved suggestions. Hit 🔄 to re-analyze.');
        }
      })
      .catch(function () {
        // Graceful degradation — offer a manual analyze.
        showMessage(
          '😴',
          'Advisor is unreachable right now.',
          'The dashboard works fine without it. Try again later.'
        );
      });
  }

  function analyze() {
    if (state.loading) return;
    state.loading = true;
    reBtn.disabled = true;
    showLoading('Analyzing the code behind this dashboard…');
    api('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboardId: DASHBOARD_ID }),
    })
      .then(function (j) {
        state.suggestions = j.suggestions || [];
        render(j.summary);
      })
      .catch(function (err) {
        showMessage('⚠️', 'Analysis failed.', String(err.message || err));
      })
      .then(function () {
        state.loading = false;
        reBtn.disabled = false;
      });
  }

  function execute(s, btn) {
    if (!s.id) return;
    btn.disabled = true;
    btn.textContent = '⏳ Sending…';
    api('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: s.id }),
    })
      .then(function (j) {
        s.status = 'executing';
        s.agent = j.agent;
        btn.classList.add('da-done');
        btn.textContent = '✓ Sent to ' + (j.agent || 'agent');
      })
      .catch(function (err) {
        btn.classList.add('da-fail');
        btn.textContent = '✕ ' + (err.message || 'Failed');
        setTimeout(function () {
          btn.classList.remove('da-fail');
          btn.textContent = '▶ Execute';
          btn.disabled = false;
        }, 2600);
      });
  }

  // --- open/close --------------------------------------------------------
  function open() {
    overlay.style.display = 'flex';
    // force reflow for transition
    void overlay.offsetWidth;
    overlay.classList.add('da-show');
    if (!state.suggestions.length && !state.loading) loadExisting();
  }
  function close() {
    overlay.classList.remove('da-show');
    setTimeout(function () {
      overlay.style.display = 'none';
    }, 250);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && overlay && overlay.classList.contains('da-show')) close();
  });

  // --- boot --------------------------------------------------------------
  function boot() {
    injectStyle();
    buildUI();
    overlay.style.display = 'none';
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
