/**
 * Patient-facing Telexam "call clinic" flow for the static clinic website.
 *
 * On button click:
 * 1. POSTs an incoming-call signal to the optional HTTP hub (cross-device).
 * 2. Writes to same-origin localStorage / BroadcastChannel (same device, same origin).
 * 3. Opens the clinic voice line (tel:+201005602267).
 *
 * Hub URL (optional, cross-device): set window.TELEXAM_SIGNAL_POST_URL before this script,
 * or meta[name="telexam-signal-post"]. When unset, only same-origin localStorage / BroadcastChannel
 * are used — no HTTP POST (GitHub Pages has no `/telexam/signals` endpoint).
 */
(function () {
  const CLINIC_PHONE_E164 = '+201005602267';
  const STORAGE_KEY = 'ophtho_telexam_pending_signal_v1';
  const CHANNEL = 'ophtho-telexam-incoming';

  function getPostUrl() {
    if (window.TELEXAM_SIGNAL_POST_URL) return String(window.TELEXAM_SIGNAL_POST_URL).trim();
    var meta = document.querySelector('meta[name="telexam-signal-post"]');
    if (meta && meta.content) return meta.content.trim();
    return '';
  }

  function buildSignal(callerPhone, callerName) {
    return {
      id: 'sig-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9),
      callerPhone: String(callerPhone || '').trim(),
      callerName: String(callerName || '').trim(),
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

  function normalizePhone(input) {
    var digits = String(input || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.indexOf('20') === 0 && digits.length >= 12) return '+' + digits;
    if (digits.charAt(0) === '0' && digits.length === 11) return '+20' + digits.slice(1);
    if (digits.length === 10 && digits.charAt(0) === '1') return '+20' + digits;
    return digits.length >= 10 ? '+' + digits : '';
  }

  window.TelexamCall = {
    clinicPhone: CLINIC_PHONE_E164,
    notifyAndCall: function (opts) {
      opts = opts || {};
      var phone = normalizePhone(opts.callerPhone || opts.phone || '');
      var name = String(opts.callerName || opts.name || '').trim();
      if (!phone) {
        if (opts.onError) opts.onError(new Error('phone_required'));
        return Promise.reject(new Error('phone_required'));
      }
      var signal = buildSignal(phone, name);
      publishLocal(signal);
      return postHub(signal).then(function () {
        if (opts.openDialer !== false) {
          window.location.href = 'tel:' + CLINIC_PHONE_E164;
        }
        if (opts.onSuccess) opts.onSuccess(signal);
        return signal;
      });
    },
  };

  function wireForm(form) {
    if (!form || form.dataset.telexamWired) return;
    form.dataset.telexamWired = '1';
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var phoneEl = form.querySelector('[name="caller-phone"], [name="callerPhone"], #telexam-caller-phone');
      var nameEl = form.querySelector('[name="caller-name"], [name="callerName"], #telexam-caller-name');
      var statusEl = form.querySelector('.telexam-call-status');
      var errEl = form.querySelector('.telexam-call-error');
      if (errEl) errEl.classList.add('hidden');
      window.TelexamCall.notifyAndCall({
        callerPhone: phoneEl ? phoneEl.value : '',
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
