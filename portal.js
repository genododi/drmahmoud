/* Patient Portal client.
 *
 * Fetches a per-patient JSON bundle from `patients/<id>.json` (relative to
 * this page), or falls back to a combined dump at
 * `portal_all_patients.json`. The bundle schema is produced by
 * `src/utils/patientPortalExport.js` in the EMR app.
 *
 * Authentication is intentionally minimal (Patient ID only) — exactly what
 * the doctor asked for. Note: anyone who learns/guesses a patient ID can
 * read that patient's bundle, so do NOT publish identifying info beyond
 * what you'd be comfortable handing to the patient in person.
 *
 * PDF generation uses the same bundled EMR templates as clinic printouts
 * (`portal-pdf.bundle.js`), so a patient can download:
 *   - any individual record as a PDF (each card has a Download PDF button)
 *   - every record as a single ZIP of PDFs (one big button at the top)
 */

(function () {
  const t = (key, vars) => (window.PortalI18n ? PortalI18n.t(key, vars) : key);

  const SESSION_KEY = 'mahmoud_portal_session_v1';

  /** Legacy string or { right, left } exam finding → display text. */
  function formatExamFinding(value) {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
      const r = String(value.right ?? value.od ?? '').trim();
      const l = String(value.left ?? value.os ?? '').trim();
      if (!r && !l) return '';
      if (r && r === l) return r;
      const parts = [];
      if (r) parts.push(`OD: ${r}`);
      if (l) parts.push(`OS: ${l}`);
      return parts.join('\n');
    }
    return String(value);
  }
  const QS = (sel) => document.querySelector(sel);
  const QSA = (sel) => Array.from(document.querySelectorAll(sel));

  const loginSection = QS('#login-section');
  const recordsSection = QS('#records-section');
  const loginForm = QS('#login-form');
  const loginError = QS('#login-error');
  const logoutBtn = QS('#logout-btn');
  const patientNameEl = QS('#patient-name');
  const patientMetaEl = QS('#patient-meta');
  const generatedAtEl = QS('#generated-at');
  const tabsEl = QS('#record-tabs');
  const panelsEl = QS('#record-panels');
  const downloadAllPdfsBtn = QS('#download-all-pdfs-btn');
  const downloadAllJsonBtn = QS('#download-all-json-btn');
  const printBtn = QS('#print-btn');
  const downloadStatus = QS('#download-status');

  let currentBundle = null;

  function getPortalAccessLogUrl() {
    let url = '';
    if (window.PORTAL_ACCESS_LOG_URL) url = String(window.PORTAL_ACCESS_LOG_URL).trim();
    const meta = document.querySelector('meta[name="portal-access-log-post"]');
    if (!url && meta && meta.content) url = meta.content.trim();
    return url;
  }

  function postAccessLog(bundle) {
    const url = getPortalAccessLogUrl();
    if (!url || !bundle?.patient) return;
    const event = {
      patientId: bundle.patient.id || '',
      patientName: bundle.patient.name || '',
      accessedAt: new Date().toISOString(),
      source: 'patient-portal',
    };
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ event }),
      credentials: 'omit',
      keepalive: true,
    }).catch(function () {
      /* access logging is best-effort and must never block patient login */
    });
  }

  function parseHashId() {
    const h = (location.hash || '').replace(/^#/, '');
    if (!h) return null;
    const params = new URLSearchParams(h);
    return params.get('id') || null;
  }

  function setSession(bundle) {
    try {
      sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({ patientId: bundle.patient.id, ts: Date.now() })
      );
    } catch { /* ignore quota errors */ }
  }

  function getSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch { /* ignore */ }
  }

  function normalizeName(input) {
    if (input == null) return '';
    let s = String(input).toLowerCase().trim();
    s = s.replace(/[\s\u00A0]+/g, ' ');
    s = s.replace(/[\u064B-\u0652\u0670\u0640]/g, '');
    s = s.replace(/[\u0622\u0623\u0625]/g, '\u0627');
    s = s.replace(/\u0649/g, '\u064A');
    s = s.replace(/\u0629/g, '\u0647');
    s = s.replace(/[^\p{Letter}\p{Number} ]+/gu, '');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  }

  let _nameIndexPromise = null;
  function loadNameIndex() {
    if (_nameIndexPromise) return _nameIndexPromise;
    _nameIndexPromise = fetch('name-index.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    return _nameIndexPromise;
  }

  async function loginLookup(rawInput) {
    const input = String(rawInput || '').trim();
    if (!input) return { ok: false, reason: 'not_found' };

    const indiv = `patients/${encodeURIComponent(input)}.json`;
    try {
      const r = await fetch(indiv, { cache: 'no-store' });
      if (r.ok) return { ok: true, bundle: await r.json() };
    } catch { /* fall through */ }

    try {
      const r = await fetch('portal_all_patients.json', { cache: 'no-store' });
      if (r.ok) {
        const all = await r.json();
        if (all && typeof all === 'object' && all[input]) {
          return { ok: true, bundle: all[input] };
        }
      }
    } catch { /* fall through */ }

    const index = await loadNameIndex();
    if (index && index.byName) {
      const key = normalizeName(input);
      if (key && Object.prototype.hasOwnProperty.call(index.byName, key)) {
        const mapped = index.byName[key];
        if (mapped == null) return { ok: false, reason: 'ambiguous_name' };
        try {
          const r = await fetch(`patients/${encodeURIComponent(mapped)}.json`, { cache: 'no-store' });
          if (r.ok) return { ok: true, bundle: await r.json() };
        } catch { /* fall through */ }
        try {
          const r = await fetch('portal_all_patients.json', { cache: 'no-store' });
          if (r.ok) {
            const all = await r.json();
            if (all && typeof all === 'object' && all[mapped]) {
              return { ok: true, bundle: all[mapped] };
            }
          }
        } catch { /* fall through */ }
      }
    }

    return { ok: false, reason: 'not_found' };
  }

  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    const dateLocale = window.PortalI18n ? PortalI18n.dateLocale() : undefined;
    return d.toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function escapeHTML(v) {
    if (v == null) return '';
    return String(v).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function safeFileSegment(s) {
    return String(s || 'record').replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '') || 'record';
  }

  function ensurePortalPdfReady() {
    if (!window.PortalPatientPdf || typeof window.PortalPatientPdf.buildPortalRecordPdf !== 'function') {
      throw new Error(typeof t === 'function' ? t('alertPdfLib') : 'PDF library not loaded');
    }
  }

  function getPdfBuilders() {
    ensurePortalPdfReady();
    return window.PortalPatientPdf.PORTAL_PDF_BUILDERS;
  }

  async function buildRecordPdf(sectionKey, item, patient) {
    ensurePortalPdfReady();
    return window.PortalPatientPdf.buildPortalRecordPdf(sectionKey, item, patient);
  }
  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function setStatus(text) {
    if (!downloadStatus) return;
    if (!text) {
      downloadStatus.classList.add('hidden');
      downloadStatus.textContent = '';
    } else {
      downloadStatus.classList.remove('hidden');
      downloadStatus.textContent = text;
    }
  }

  async function downloadOneRecord(sectionKey, item) {
    if (!currentBundle) return;
    const builders = getPdfBuilders();
    if (!builders[sectionKey]) return;
    try {
      const { filename, blob } = await buildRecordPdf(sectionKey, item, currentBundle.patient);
      downloadBlob(filename, blob);
    } catch (e) {
      console.error('PDF generation failed', e);
      alert(t('alertPdfFailed'));
    }
  }

  async function downloadAllAsZip() {
    if (!currentBundle) return;
    if (typeof window.JSZip !== 'function') {
      alert(t('alertZipLib'));
      return;
    }
    downloadAllPdfsBtn.disabled = true;
    const originalLabel = downloadAllPdfsBtn.textContent;
    downloadAllPdfsBtn.textContent = t('zipPreparing');
    setStatus(t('statusBuildingPdfs'));
    try {
      const zip = new window.JSZip();
      let total = 0;
      for (const [key, builder] of Object.entries(getPdfBuilders())) {
        const items = Array.isArray(currentBundle[key]) ? currentBundle[key] : [];
        if (!items.length) continue;
        const folder = zip.folder(builder.folder);
        for (const item of items) {
          const { filename, blob } = await buildRecordPdf(key, item, currentBundle.patient);
          folder.file(filename, blob);
          total += 1;
        }
        setStatus(t('statusBuiltRecords', { count: total }));
        // Yield to the UI so the status text actually paints.
        await new Promise((r) => setTimeout(r, 0));
      }
      if (total === 0) {
        alert(t('alertNoRecords'));
        return;
      }
      // Include the raw JSON too for safekeeping.
      zip.file('records.json', JSON.stringify(currentBundle, null, 2));

      setStatus(t('statusCompressing'));
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const stamp = new Date().toISOString().slice(0, 10);
      const fileSafeName = safeFileSegment(currentBundle.patient.name || currentBundle.patient.id);
      downloadBlob(`records_${fileSafeName}_${stamp}.zip`, blob);
      setStatus(t('statusDownloaded', { count: total }));
    } catch (e) {
      console.error('ZIP build failed', e);
      alert(t('alertZipFailed'));
      setStatus('');
    } finally {
      downloadAllPdfsBtn.disabled = false;
      downloadAllPdfsBtn.textContent = originalLabel;
      setTimeout(() => setStatus(''), 4000);
    }
  }

  // =====================================================================
  // On-screen rendering
  // =====================================================================

  function recordCardShell(headTitle, headDate, bodyHTML, sectionKey, itemIndex) {
    return `
      <div class="record-card">
        <div class="record-card-head">
          <h3>${escapeHTML(headTitle)}</h3>
          <div class="record-card-tools">
            <time>${escapeHTML(headDate)}</time>
            <button class="btn btn-secondary btn-xs record-download-btn"
                    type="button"
                    data-section="${escapeHTML(sectionKey)}"
                    data-index="${itemIndex}">
              ${escapeHTML(t('downloadPdf'))}
            </button>
          </div>
        </div>
        ${bodyHTML}
      </div>
    `;
  }

  function glassesRowsHTML(g) {
    return `
      <table class="glasses-table">
        <thead>
          <tr>
            <th>${escapeHTML(t('labelEye'))}</th><th>${escapeHTML(t('labelSph'))}</th><th>${escapeHTML(t('labelCyl'))}</th><th>${escapeHTML(t('labelAxis'))}</th><th>${escapeHTML(t('labelVa'))}</th><th>${escapeHTML(t('labelAdd'))}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${escapeHTML(t('labelOd'))}</strong></td>
            <td>${escapeHTML(g.sph_right || '-')}</td>
            <td>${escapeHTML(g.cyl_right || '-')}</td>
            <td>${escapeHTML(g.axis_right || '-')}</td>
            <td>${escapeHTML(g.va_right || '-')}</td>
            <td rowspan="2">${escapeHTML(g.add_power || '-')}</td>
          </tr>
          <tr>
            <td><strong>${escapeHTML(t('labelOs'))}</strong></td>
            <td>${escapeHTML(g.sph_left || '-')}</td>
            <td>${escapeHTML(g.cyl_left || '-')}</td>
            <td>${escapeHTML(g.axis_left || '-')}</td>
            <td>${escapeHTML(g.va_left || '-')}</td>
          </tr>
        </tbody>
      </table>
      ${g.pd ? `<p><b>${escapeHTML(t('labelPd'))}:</b> ${escapeHTML(g.pd)}</p>` : ''}
      ${g.notes ? `<p><b>${escapeHTML(t('labelNotes'))}:</b> ${escapeHTML(g.notes)}</p>` : ''}
    `;
  }

  function renderGlasses(item, i) {
    const isOld = item.glassesType === 'old';
    return recordCardShell(
      isOld ? t('cardOldGlasses') : t('cardGlassesRx'),
      fmtDate(item.date),
      glassesRowsHTML(item),
      'glasses', i
    );
  }

  function renderMedication(item, i) {
    const body = `
      <div class="record-grid">
        ${item.type ? `<div><b>${escapeHTML(t('labelType'))}:</b> ${escapeHTML(item.type)}</div>` : ''}
        ${item.dosage ? `<div><b>${escapeHTML(t('labelDosage'))}:</b> ${escapeHTML(item.dosage)}</div>` : ''}
        ${item.frequency ? `<div><b>${escapeHTML(t('labelFrequency'))}:</b> ${escapeHTML(item.frequency)}</div>` : ''}
        ${item.duration ? `<div><b>${escapeHTML(t('labelDuration'))}:</b> ${escapeHTML(item.duration)}</div>` : ''}
      </div>
      ${item.instructions ? `<p><b>${escapeHTML(t('labelInstructions'))}:</b> ${escapeHTML(item.instructions)}</p>` : ''}
      ${item.tapering ? `<p><b>${escapeHTML(t('labelTapering'))}:</b> ${escapeHTML(item.tapering)}</p>` : ''}
    `;
    return recordCardShell(item.name || t('cardMedication'), fmtDate(item.date || item.createdAt), body, 'medications', i);
  }

  function renderTreatment(item, i) {
    const body = `
      ${(item.medical_treatment || item.medicalTreatment) ? `<p><b>${escapeHTML(t('labelMedical'))}:</b> ${escapeHTML(item.medical_treatment || item.medicalTreatment)}</p>` : ''}
      ${(item.surgical_treatment || item.surgicalTreatment) ? `<p><b>${escapeHTML(t('labelSurgical'))}:</b> ${escapeHTML(item.surgical_treatment || item.surgicalTreatment)}</p>` : ''}
      ${(item.followup_date || item.followupDate) ? `<p><b>${escapeHTML(t('labelFollowUp'))}:</b> ${escapeHTML(item.followup_date || item.followupDate)}</p>` : ''}
      ${item.notes ? `<p><b>${escapeHTML(t('labelNotes'))}:</b> ${escapeHTML(item.notes)}</p>` : ''}
    `;
    return recordCardShell(t('cardTreatment'), fmtDate(item.date), body, 'treatments', i);
  }

  function renderInvestigation(item, i) {
    const body = `
      ${item.details ? `<p><b>${escapeHTML(t('labelDetails'))}:</b> ${escapeHTML(item.details)}</p>` : ''}
      ${item.results ? `<p><b>${escapeHTML(t('labelResults'))}:</b> ${escapeHTML(item.results)}</p>` : ''}
      ${item.recommendations ? `<p><b>${escapeHTML(t('labelRecommendations'))}:</b> ${escapeHTML(item.recommendations)}</p>` : ''}
    `;
    return recordCardShell(item.type || t('cardInvestigation'), fmtDate(item.date), body, 'investigations', i);
  }

  function renderExamination(item, i) {
    const body = `
      ${item.unaided_va ? `<p><b>${escapeHTML(t('labelUnaidedVa'))}:</b> ${escapeHTML(t('labelOd'))} ${escapeHTML(item.unaided_va.right || '-')} / ${escapeHTML(t('labelOs'))} ${escapeHTML(item.unaided_va.left || '-')}</p>` : ''}
      ${item.iop ? `<p><b>${escapeHTML(t('labelIop'))}:</b> ${escapeHTML(t('labelOd'))} ${escapeHTML(item.iop.right || '-')} mmHg / ${escapeHTML(t('labelOs'))} ${escapeHTML(item.iop.left || '-')} mmHg</p>` : ''}
      ${formatExamFinding(item.lids) ? `<p><b>${escapeHTML(t('labelLids'))}:</b> ${escapeHTML(formatExamFinding(item.lids))}</p>` : ''}
      ${formatExamFinding(item.anterior_segment) ? `<p><b>${escapeHTML(t('labelAnterior'))}:</b> ${escapeHTML(formatExamFinding(item.anterior_segment))}</p>` : ''}
      ${formatExamFinding(item.posterior_segment) ? `<p><b>${escapeHTML(t('labelPosterior'))}:</b> ${escapeHTML(formatExamFinding(item.posterior_segment))}</p>` : ''}
      ${item.diagnosis ? `<p><b>${escapeHTML(t('labelDiagnosis'))}:</b> ${escapeHTML(item.diagnosis)}</p>` : ''}
      ${item.notes ? `<p><b>${escapeHTML(t('labelNotes'))}:</b> ${escapeHTML(item.notes)}</p>` : ''}
    `;
    return recordCardShell(t('cardExamination'), fmtDate(item.date || item.createdAt), body, 'examinations', i);
  }

  function renderReport(item, i) {
    const body = item.content ? `<p style="white-space:pre-wrap">${escapeHTML(item.content)}</p>` : '';
    return recordCardShell(item.type || t('cardReport'), fmtDate(item.date), body, 'reports', i);
  }

  function renderSurgery(item, i) {
    const body = `
      ${item.eye ? `<p><b>${escapeHTML(t('labelEye'))}:</b> ${escapeHTML(item.eye)}</p>` : ''}
      ${item.surgeryType ? `<p><b>${escapeHTML(t('labelType'))}:</b> ${escapeHTML(item.surgeryType)}</p>` : ''}
      ${item.preOpDiagnosis ? `<p><b>${escapeHTML(t('labelPreOp'))}:</b> ${escapeHTML(item.preOpDiagnosis)}</p>` : ''}
      ${item.iolPower ? `<p><b>${escapeHTML(t('labelIol'))}:</b> ${escapeHTML(`${item.iolType || ''} ${item.iolModel || ''} ${item.iolPower}D`)}</p>` : ''}
      ${item.complications ? `<p><b>${escapeHTML(t('labelComplications'))}:</b> ${escapeHTML(item.complications)}</p>` : ''}
      ${item.postOpInstructions ? `<p><b>${escapeHTML(t('labelPostOp'))}:</b> ${escapeHTML(item.postOpInstructions)}</p>` : ''}
    `;
    return recordCardShell(item.procedureName || t('cardSurgery'), fmtDate(item.datePerformed || item.dateScheduled), body, 'surgeries', i);
  }

  function renderLab(item, i) {
    const body = `
      ${item.purpose ? `<p><b>${escapeHTML(t('labelPurpose'))}:</b> ${escapeHTML(item.purpose)}</p>` : ''}
      ${item.results ? `<p><b>${escapeHTML(t('labelResults'))}:</b> ${escapeHTML(item.results)}</p>` : ''}
      ${item.fitnessStatus ? `<p><b>${escapeHTML(t('labelFitness'))}:</b> ${escapeHTML(item.fitnessStatus)}</p>` : ''}
      ${item.notes ? `<p><b>${escapeHTML(t('labelNotes'))}:</b> ${escapeHTML(item.notes)}</p>` : ''}
    `;
    return recordCardShell(item.panelType || t('cardLab'), fmtDate(item.date), body, 'labs', i);
  }

  const SECTIONS = [
    { key: 'glasses',        labelKey: 'sectionGlasses',        render: renderGlasses },
    { key: 'medications',    labelKey: 'sectionMedications',    render: renderMedication },
    { key: 'treatments',     labelKey: 'sectionTreatments',     render: renderTreatment },
    { key: 'investigations', labelKey: 'sectionInvestigations', render: renderInvestigation },
    { key: 'reports',        labelKey: 'sectionReports',        render: renderReport },
    { key: 'examinations',   labelKey: 'sectionExaminations',   render: renderExamination },
    { key: 'surgeries',      labelKey: 'sectionSurgeries',      render: renderSurgery },
    { key: 'labs',           labelKey: 'sectionLabs',           render: renderLab },
  ];

  function activateTab(key) {
    QSA('.record-tab').forEach((b) => b.classList.toggle('active', b.dataset.key === key));
    QSA('.record-panel').forEach((p) => p.classList.toggle('active', p.dataset.key === key));
  }

  function showBundle(bundle) {
    currentBundle = bundle;
    loginSection.classList.add('hidden');
    recordsSection.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');

    patientNameEl.textContent = bundle.patient.name || t('patientFallback');
    const metaBits = [`${t('metaId')} ${bundle.patient.id}`];
    if (bundle.patient.dob) metaBits.push(`${t('metaDob')} ${bundle.patient.dob}`);
    if (bundle.patient.contact) metaBits.push(bundle.patient.contact);
    patientMetaEl.textContent = metaBits.join(' · ');
    generatedAtEl.textContent = fmtDate(bundle.generatedAt);

    tabsEl.innerHTML = '';
    panelsEl.innerHTML = '';

    let firstNonEmpty = null;
    SECTIONS.forEach((sec) => {
      const items = Array.isArray(bundle[sec.key]) ? bundle[sec.key] : [];
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'record-tab';
      tab.dataset.key = sec.key;
      tab.innerHTML = `${t(sec.labelKey)}<span class="count">${items.length}</span>`;
      tab.addEventListener('click', () => activateTab(sec.key));
      tabsEl.appendChild(tab);

      const panel = document.createElement('div');
      panel.className = 'record-panel';
      panel.dataset.key = sec.key;
      panel.innerHTML = items.length
        ? items.map((it, i) => sec.render(it, i)).join('')
        : `<div class="empty">${escapeHTML(t('emptySection'))}</div>`;
      panelsEl.appendChild(panel);

      if (items.length && !firstNonEmpty) firstNonEmpty = sec.key;
    });

    activateTab(firstNonEmpty || SECTIONS[0].key);

  }

  function showLogin(errorMessage) {
    recordsSection.classList.add('hidden');
    loginSection.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
    if (errorMessage) {
      loginError.textContent = errorMessage;
      loginError.classList.remove('hidden');
    } else {
      loginError.classList.add('hidden');
    }
  }

  // =====================================================================
  // Event wiring
  // =====================================================================

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    const input = QS('#patient-id').value.trim();
    if (!input) return;
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = t('loginLoading');
    try {
      const result = await loginLookup(input);
      if (!result.ok) {
        if (result.reason === 'ambiguous_name') {
          showLogin(t('loginErrorAmbiguous'));
        } else {
          showLogin(t('loginErrorNotFound'));
        }
        return;
      }
      setSession(result.bundle);
      showBundle(result.bundle);
      postAccessLog(result.bundle);
      if (parseHashId()) history.replaceState(null, '', location.pathname);
    } catch (err) {
      console.error(err);
      showLogin(t('loginErrorGeneric'));
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = t('loginSubmit');
    }
  });

  logoutBtn.addEventListener('click', () => {
    clearSession();
    currentBundle = null;
    QS('#patient-id').value = '';
    showLogin('');
  });

  downloadAllJsonBtn.addEventListener('click', () => {
    if (!currentBundle) return;
    const blob = new Blob([JSON.stringify(currentBundle, null, 2)], { type: 'application/json' });
    const fileSafeName = safeFileSegment(currentBundle.patient.name || currentBundle.patient.id);
    downloadBlob(`records_${fileSafeName}.json`, blob);
  });

  downloadAllPdfsBtn.addEventListener('click', downloadAllAsZip);

  printBtn.addEventListener('click', () => window.print());

  // Per-record "Download PDF" buttons are delegated.
  panelsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.record-download-btn');
    if (!btn) return;
    const sectionKey = btn.dataset.section;
    const idx = Number(btn.dataset.index);
    if (!currentBundle) return;
    const items = Array.isArray(currentBundle[sectionKey]) ? currentBundle[sectionKey] : [];
    const item = items[idx];
    if (item) void downloadOneRecord(sectionKey, item);
  });

  if (window.PortalI18n) {
    PortalI18n.onChange(() => {
      PortalI18n.applyStaticI18n();
      if (currentBundle) showBundle(currentBundle);
    });
  }

  // Resume / deep-link entry point.
  (async function init() {
    const deepId = parseHashId();
    if (deepId) {
      QS('#patient-id').value = deepId;
      loginForm.dispatchEvent(new Event('submit'));
      return;
    }
    const sess = getSession();
    if (sess && sess.patientId) {
      const result = await loginLookup(sess.patientId);
      if (result.ok) showBundle(result.bundle);
      else clearSession();
    }
  })();
})();
