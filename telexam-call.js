/**
 * Patient-facing Telexam request flow for the static clinic website.
 *
 * On button click:
 * 1. POSTs an incoming-call signal to the optional HTTP hub (cross-device).
 * 2. Writes to same-origin localStorage / BroadcastChannel (same device, same origin).
 * 3. Does not open the clinic cellular voice line; the EMR rings from the request.
 *
 * Hub URL (optional, cross-device): set window.TELEXAM_SIGNAL_POST_URL before this script,
 * or meta[name="telexam-signal-post"]. When unset, only same-origin localStorage / BroadcastChannel
 * are used — no HTTP POST (GitHub Pages has no `/telexam/signals` endpoint).
 */
(function () {
  const STORAGE_KEY = 'ophtho_telexam_pending_signal_v1';
  const CHANNEL = 'ophtho-telexam-incoming';
  const PIPELINE_ID = 'telexam-emr-tunnel';

  function getPostUrl() {
    if (window.TELEXAM_SIGNAL_POST_URL) return String(window.TELEXAM_SIGNAL_POST_URL).trim();
    var meta = document.querySelector('meta[name="telexam-signal-post"]');
    if (meta && meta.content) return meta.content.trim();
    return '';
  }

  function buildSignal(callerName) {
    var requestName = String(callerName || '').trim();
    return {
      id: 'sig-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      callerName: requestName,
      requestName: requestName,
      pipelineId: PIPELINE_ID,
      source: 'patient-website',
      createdAt: new Date().toISOString(),
    };
  }

  function publishLocal(signal) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(signal));
    } catch (e) { /* quota */ }
    try {
      var bc = new BroadcastChannel(CHANNEL);
      bc.postMessage({ type: 'telexam-incoming', signal: signal });
      bc.close();
    } catch (e) { /* unsupported */ }
  }

  function postHub(signal) {
    var url = getPostUrl();
    if (!url) return Promise.resolve();
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ signal: signal }),
      credentials: 'omit',
    }).catch(function () {
      /* hub optional — local signaling still attempted */
    });
  }

  window.TelexamCall = {
    request: function (opts) {
      opts = opts || {};
      var name = String(opts.callerName || opts.name || '').trim();
      if (!name) {
        if (opts.onError) opts.onError(new Error('name_required'));
        return Promise.reject(new Error('name_required'));
      }
      var signal = buildSignal(name);
      publishLocal(signal);
      return postHub(signal).then(function () {
        if (opts.onSuccess) opts.onSuccess(signal);
        return signal;
      });
    },
  };
  window.TelexamCall.notifyAndCall = window.TelexamCall.request;

  function wireForm(form) {
    if (!form || form.dataset.telexamWired) return;
    form.dataset.telexamWired = '1';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var nameEl = form.querySelector('[name="caller-name"], [name="callerName"], #telexam-caller-name');
      var statusEl = form.querySelector('.telexam-call-status');
      var errEl = form.querySelector('.telexam-call-error');
      if (errEl) errEl.classList.add('hidden');
      window.TelexamCall.request({
        callerName: nameEl ? nameEl.value : '',
      })
        .then(function () {
          if (statusEl) {
            statusEl.classList.remove('hidden');
            statusEl.textContent = statusEl.dataset.successText || statusEl.textContent;
          }
        })
        .catch(function () {
          if (errEl) {
            errEl.classList.remove('hidden');
            errEl.textContent = errEl.dataset.errorText || errEl.textContent;
          }
        });
    });
  }

  document.querySelectorAll('[data-telexam-call-form]').forEach(wireForm);
})();
