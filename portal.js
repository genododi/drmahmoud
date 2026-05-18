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
 * PDF generation runs entirely in the browser (no server) using jsPDF +
 * jsPDF-AutoTable, so a patient can download:
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

  // ----- Clinic info (kept in sync with the EMR's pdfExport.js) ---------
  const CLINIC = {
    name: 'Dr. Mahmoud Sami Abouzeid',
    title1: 'Consultant Ophthalmologist',
    title2: 'Fellow of Royal College of Surgeons',
    title3: 'Fellow of International Council of Ophthalmology',
    address: '1 Zaki Nabawi - Alkawthar tower - Tersa, Haram',
    phone: '01005602267',
    website: 'https://genododi.github.io/drmahmoud/',
    facebook: 'https://www.facebook.com/share/1D3CG2FwXh/?mibextid=wwXIfr',
  };

  /** Match EMR `pdfExport.js`: narrow left inset, wide right binding gutter (mm). */
  const PDF_MARGIN_LEFT = 10;
  const PDF_MARGIN_RIGHT = 30;
  const PDF_CONTENT_W = (doc) =>
    doc.internal.pageSize.getWidth() - PDF_MARGIN_LEFT - PDF_MARGIN_RIGHT;
  const PDF_CONTENT_CENTER_X = (pageWidth) =>
    PDF_MARGIN_LEFT + (pageWidth - PDF_MARGIN_LEFT - PDF_MARGIN_RIGHT) / 2;

  const buildPatientPortalURL = (patientId) => {
    const base = CLINIC.website.replace(/\/$/, '');
    return patientId ? `${base}/portal.html#id=${encodeURIComponent(patientId)}` : `${base}/`;
  };

  const _qrDataUrlCache = new Map();
  /**
   * @param {string} targetUrl
   * @param {{ dark?: string }} [opts]
   * @returns {Promise<string|null>}
   */
  async function getQRDataURL(targetUrl, opts) {
    const dark = (opts && opts.dark) || '#0e7490';
    const key = `${targetUrl}::${dark}`;
    if (_qrDataUrlCache.has(key)) return _qrDataUrlCache.get(key);
    const QR = window.QRCode;
    if (!QR) {
      console.warn('QRCode library not available');
      return null;
    }
    const p = typeof QR.toDataURL === 'function'
      ? new Promise((resolve) => {
          QR.toDataURL(
            targetUrl,
            { width: 200, margin: 1, color: { dark, light: '#ffffff' } },
            (err, dataUrl) => {
              if (err) {
                console.error('QR generation error', err);
                resolve(null);
              } else resolve(dataUrl);
            }
          );
        })
      : new Promise((resolve) => {
          try {
            const holder = document.createElement('div');
            new QR(holder, {
              text: targetUrl,
              width: 200,
              height: 200,
              colorDark: dark,
              colorLight: '#ffffff',
              correctLevel: QR.CorrectLevel && QR.CorrectLevel.M,
            });
            const canvas = holder.querySelector('canvas');
            const img = holder.querySelector('img');
            resolve(canvas ? canvas.toDataURL('image/png') : (img && img.src) || null);
          } catch (err) {
            console.error('QR generation error', err);
            resolve(null);
          }
        });
    _qrDataUrlCache.set(key, p);
    return p;
  }

  /** Warm caches in the background after login so ZIP downloads feel snappy. */
  function warmPortalQRCaches(patientId) {
    const web = buildPatientPortalURL(patientId);
    getQRDataURL(web).catch(() => {});
    getQRDataURL(CLINIC.facebook, { dark: '#1877F2' }).catch(() => {});
  }

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

  // The bundle we last loaded; cached so buttons can use it.
  let currentBundle = null;

  // ----- Session helpers ------------------------------------------------
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
    } catch { return null; }
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
  }

  // ----- Name normalisation (kept in sync with src/utils/nameMatch.js) ----
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

  // ----- Data loading ---------------------------------------------------
  // Cached name index — fetched lazily on the first name-style login attempt.
  let _nameIndexPromise = null;
  function loadNameIndex() {
    if (_nameIndexPromise) return _nameIndexPromise;
    _nameIndexPromise = fetch('name-index.json', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    return _nameIndexPromise;
  }

  /**
   * Lookup result is one of:
   *   { ok: true, bundle: {...} }                — success
   *   { ok: false, reason: 'not_found' }         — no patient with this id/name
   *   { ok: false, reason: 'ambiguous_name' }    — name belongs to multiple patients
   */
  async function loginLookup(rawInput) {
    const input = String(rawInput || '').trim();
    if (!input) return { ok: false, reason: 'not_found' };

    // 1) Try treating the input as an ID first (covers numeric and uuid ids).
    const indiv = `patients/${encodeURIComponent(input)}.json`;
    try {
      const r = await fetch(indiv, { cache: 'no-store' });
      if (r.ok) return { ok: true, bundle: await r.json() };
    } catch { /* fall through */ }

    // 2) Try the combined bundle (rare deployment style).
    try {
      const r = await fetch('portal_all_patients.json', { cache: 'no-store' });
      if (r.ok) {
        const all = await r.json();
        if (all && typeof all === 'object' && all[input]) {
          return { ok: true, bundle: all[input] };
        }
      }
    } catch { /* fall through */ }

    // 3) Treat the input as a full name (after normalisation).
    const index = await loadNameIndex();
    if (index && index.byName) {
      const key = normalizeName(input);
      if (key && Object.prototype.hasOwnProperty.call(index.byName, key)) {
        const mapped = index.byName[key];
        if (mapped == null) return { ok: false, reason: 'ambiguous_name' };
        // Resolve to the underlying bundle.
        try {
          const r = await fetch(`patients/${encodeURIComponent(mapped)}.json`, { cache: 'no-store' });
          if (r.ok) return { ok: true, bundle: await r.json() };
        } catch { /* fall through */ }
        // Try combined bundle as a final fallback.
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

  // ----- Formatting helpers --------------------------------------------
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
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  function safeFileSegment(s) {
    return String(s || 'record').replace(/[^a-z0-9_.-]+/gi, '_').replace(/^_+|_+$/g, '') || 'record';
  }

  function recordDateForFile(item) {
    const d = item.date || item.datePerformed || item.dateScheduled || item.createdAt;
    if (!d) return '';
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return safeFileSegment(d);
    return dt.toISOString().slice(0, 10);
  }

  // =====================================================================
  // PDF generation
  // =====================================================================

  function ensurePdfLibsReady() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      throw new Error(t('alertPdfLib'));
    }
  }

  function makeDoc() {
    ensurePdfLibsReady();
    const { jsPDF } = window.jspdf;
    return new jsPDF({ unit: 'mm', format: 'a4' });
  }

  function addPdfHeader(doc, pageWidth) {
    doc.setFontSize(17);
    doc.setFont('helvetica', 'bold');
    const cx = PDF_CONTENT_CENTER_X(pageWidth);
    doc.text(CLINIC.name, cx, 14, { align: 'center', maxWidth: PDF_CONTENT_W(doc) });

    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55);
    doc.text(CLINIC.title1, cx, 21, { align: 'center', maxWidth: PDF_CONTENT_W(doc) });
    doc.text(CLINIC.title2, cx, 26, { align: 'center', maxWidth: PDF_CONTENT_W(doc) });
    doc.text(CLINIC.title3, cx, 31, { align: 'center', maxWidth: PDF_CONTENT_W(doc) });
    doc.setTextColor(0);

    doc.setDrawColor(14, 116, 144);
    doc.setLineWidth(0.35);
    doc.line(PDF_MARGIN_LEFT, 36, pageWidth - PDF_MARGIN_RIGHT, 36);
  }

  function addPdfFooter(doc, pageWidth) {
    const pageHeight = doc.internal.pageSize.getHeight();
    const footerY = pageHeight - 21;
    const cx = PDF_CONTENT_CENTER_X(pageWidth);
    const mw = PDF_CONTENT_W(doc);

    doc.setFontSize(8.5);
    doc.setTextColor(82);
    doc.text(`Tel: ${CLINIC.phone}`, cx, footerY, { align: 'center', maxWidth: mw });
    doc.text(CLINIC.address, cx, footerY + 7, { align: 'center', maxWidth: mw });
    doc.setTextColor(0);
  }

  function getPortalPatientId(patient) {
    if (!patient || typeof patient !== 'object') return null;
    const v = patient.id ?? patient.patientId ?? patient.referenceId;
    return v != null && String(v).trim() !== '' ? String(v) : null;
  }

  function addPatientInfoBlock(doc, patient, x, y, recordDate) {
    const lh = 6;
    const pid = getPortalPatientId(patient);
    const rows = [
      `Patient: ${patient.name || '-'}`,
      ...(recordDate ? [`Date: ${recordDate}`] : []),
      ...(pid ? [`REFERENCE ID: ${pid}`] : []),
      ...(patient.dob ? [`DOB: ${patient.dob}`] : []),
      ...(patient.contact ? [`Phone: ${patient.contact}`] : []),
    ];
    const boxH = rows.length * lh + 8;
    const boxW = doc.internal.pageSize.getWidth() - PDF_MARGIN_LEFT - PDF_MARGIN_RIGHT;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(x, y - 4, boxW, boxH, 2, 2, 'FD');

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(30);
    rows.forEach((row, i) => doc.text(row, x + 4, y + 4 + i * lh));
    doc.setTextColor(0);
    return y + boxH + 4;
  }

  function drawQRWithLabels(doc, dataUrl, x, y, size, line1, line2) {
    if (!dataUrl) return;
    try {
      doc.addImage(dataUrl, 'PNG', x, y, size, size);
    } catch (e) {
      console.error('PDF QR addImage failed', e);
      return;
    }
    doc.setFontSize(6.5);
    doc.setTextColor(88);
    if (line1) doc.text(line1, x + size / 2, y + size + 3, { align: 'center' });
    if (line2) doc.text(line2, x + size / 2, y + size + 7, { align: 'center' });
    doc.setTextColor(0);
  }

  /** mm — when a medication table was drawn, keep at least this gap below its bottom before the QR row. */
  const MEDICATION_QR_CLEAR_BELOW_TABLE_MM = 8;

  /** Clinic website (right) + Facebook (left), same row — matches EMR printouts. */
  async function addDualClinicQRs(doc, pageWidth, patientId, options = {}) {
    const { medicationTableFinalY = null } = options;
    const pageHeight = doc.internal.pageSize.getHeight();
    const size = 22;
    const baselineY = pageHeight - size - 52;
    const y =
      medicationTableFinalY != null && Number.isFinite(medicationTableFinalY)
        ? Math.max(baselineY, medicationTableFinalY + MEDICATION_QR_CLEAR_BELOW_TABLE_MM)
        : baselineY;

    const webUrl = buildPatientPortalURL(patientId || null);
    const webData = await getQRDataURL(webUrl);
    drawQRWithLabels(
      doc,
      webData,
      pageWidth - size - PDF_MARGIN_RIGHT,
      y,
      size,
      'Clinic website',
      patientId ? 'Scan for your records' : 'Scan to visit'
    );

    const fbData = await getQRDataURL(CLINIC.facebook, { dark: '#1877F2' });
    drawQRWithLabels(doc, fbData, PDF_MARGIN_LEFT, y, size, 'Facebook page', 'Scan to follow us');
  }

  async function finalizePatientPdf(doc, pageWidth, patient, options = {}) {
    const pid = getPortalPatientId(patient);
    try {
      await addDualClinicQRs(doc, pageWidth, pid, options);
    } catch (e) {
      console.warn('Could not embed QR codes on PDF', e);
    }
    addPdfFooter(doc, pageWidth);
  }

  /** Glasses prescription PDF (mirrors the EMR layout, no Rx ID). */
  async function buildGlassesPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const cw = PDF_CONTENT_W(doc);
    addPdfHeader(doc, pageWidth);

    let titleY = 44;
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 116, 144);
    const cx = PDF_CONTENT_CENTER_X(pageWidth);
    const title = item.glassesType === 'old' ? 'OLD GLASSES PRESCRIPTION' : 'OPTICAL PRESCRIPTION';
    doc.text(title, cx, titleY, { align: 'center', maxWidth: cw });
    doc.setTextColor(0);

    let nextY = titleY + 9;
    if (item.glassesType === 'old') {
      doc.setFillColor(254, 243, 199);
      doc.roundedRect(cx - 30, nextY - 1, 60, 9, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setTextColor(146, 64, 14);
      doc.text('Historical record', cx, nextY + 5.5, { align: 'center', maxWidth: cw });
      doc.setTextColor(0);
      nextY += 13;
    }

    const tableStart = addPatientInfoBlock(doc, patient, PDF_MARGIN_LEFT, nextY + 2, item.date || '') + 2;

    const tableWidth = cw;
    const eyeColWidth = 58;
    const dataColWidth = (tableWidth - eyeColWidth) / 5;

    doc.autoTable({
      startY: tableStart,
      head: [['Eye', 'SPH', 'CYL', 'Axis', 'VA', 'ADD']],
      body: [
        ['Right Eye (OD)', item.sph_right || '-', item.cyl_right || '-', item.axis_right || '-', item.va_right || '-', item.add_power || '-'],
        ['Left Eye (OS)', item.sph_left || '-', item.cyl_left || '-', item.axis_left || '-', item.va_left || '-', item.add_power || '-'],
      ],
      theme: 'grid',
      tableWidth,
      headStyles: {
        fillColor: [14, 116, 144],
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 11,
        halign: 'center',
        cellPadding: { top: 6, right: 2, bottom: 6, left: 2 },
      },
      bodyStyles: {
        fontSize: 11,
        halign: 'center',
        font: 'helvetica',
        overflow: 'linebreak',
        cellPadding: { top: 7, right: 2, bottom: 7, left: 2 },
      },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'left', cellWidth: eyeColWidth, fontSize: 10 },
        1: { cellWidth: dataColWidth },
        2: { cellWidth: dataColWidth },
        3: { cellWidth: dataColWidth },
        4: { cellWidth: dataColWidth },
        5: { cellWidth: dataColWidth },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: PDF_MARGIN_LEFT, right: PDF_MARGIN_RIGHT },
    });

    let y = doc.lastAutoTable.finalY + 10;
    if (item.pd) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text(`Pupillary distance (PD): ${item.pd}`, PDF_MARGIN_LEFT, y);
      y += 10;
    }
    if (item.notes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Notes', PDF_MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      const noteLines = doc.splitTextToSize(String(item.notes), cw - 4);
      doc.text(noteLines, PDF_MARGIN_LEFT, y + 6);
    }

    await finalizePatientPdf(doc, pageWidth, patient);
    return {
      filename: `glasses_${item.glassesType === 'old' ? 'old' : 'rx'}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  async function buildMedicationPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const cw = PDF_CONTENT_W(doc);
    addPdfHeader(doc, pageWidth);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 116, 144);
    doc.text('MEDICATION PRESCRIPTION', PDF_CONTENT_CENTER_X(pageWidth), 43, { align: 'center', maxWidth: cw });
    doc.setTextColor(0);

    const startAfterPatient = addPatientInfoBlock(doc, patient, PDF_MARGIN_LEFT, 52, item.date || item.createdAt || '');

    doc.autoTable({
      startY: startAfterPatient + 2,
      head: [['#', 'Medication', 'Dosage', 'Frequency', 'Duration']],
      body: [[
        '1',
        `${item.name || '-'}${item.type ? `\n(${item.type})` : ''}`,
        item.dosage || '—',
        item.frequency || '—',
        item.duration || '—',
      ]],
      theme: 'grid',
      tableWidth: cw,
      headStyles: {
        fillColor: [14, 116, 144],
        textColor: 255,
        fontSize: 10,
        fontStyle: 'bold',
        cellPadding: { top: 6, bottom: 6, left: 3, right: 3 },
      },
      bodyStyles: {
        fontSize: 10,
        cellPadding: { top: 8, bottom: 8, left: 4, right: 4 },
        valign: 'middle',
      },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 64 },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 44 },
        4: { cellWidth: 24, halign: 'center' },
      },
      margin: { left: PDF_MARGIN_LEFT, right: PDF_MARGIN_RIGHT },
    });

    let y = doc.lastAutoTable.finalY + 10;
    if (item.instructions || item.tapering) {
      doc.setCharSpace(0);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Instructions', PDF_MARGIN_LEFT, y, { charSpace: 0 });
      doc.setFont('helvetica', 'normal');
      const text = [item.instructions, item.tapering].filter(Boolean).join('\n\n');
      const lines = doc.splitTextToSize(text, cw);
      doc.text(lines, PDF_MARGIN_LEFT, y + 6, { charSpace: 0 });
    }

    await finalizePatientPdf(doc, pageWidth, patient, {
      medicationTableFinalY: doc.lastAutoTable?.finalY ?? null,
    });
    return {
      filename: `medication_${safeFileSegment(item.name)}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  async function buildTreatmentPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const cw = PDF_CONTENT_W(doc);
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 116, 144);
    doc.text('TREATMENT PLAN', PDF_CONTENT_CENTER_X(pageWidth), 43, { align: 'center', maxWidth: cw });
    doc.setTextColor(0);

    let y = addPatientInfoBlock(doc, patient, PDF_MARGIN_LEFT, 52, item.date || '') + 6;

    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${label}`, PDF_MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(value), cw);
      doc.text(lines, PDF_MARGIN_LEFT, y + 5);
      y += 5 + Math.max(lines.length, 1) * 4.8 + 10;
    };

    writeBlock('Medical treatment', item.medical_treatment || item.medicalTreatment);
    writeBlock('Surgical treatment', item.surgical_treatment || item.surgicalTreatment);
    if (item.followup_date || item.followupDate) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`Follow-up date: ${item.followup_date || item.followupDate}`, PDF_MARGIN_LEFT, y);
      y += 12;
    }
    writeBlock('Notes', item.notes);

    await finalizePatientPdf(doc, pageWidth, patient);
    return {
      filename: `treatment_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  async function buildInvestigationPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const cw = PDF_CONTENT_W(doc);
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 116, 144);
    doc.text('INVESTIGATION REPORT', PDF_CONTENT_CENTER_X(pageWidth), 43, { align: 'center', maxWidth: cw });
    doc.setTextColor(0);

    let y = addPatientInfoBlock(doc, patient, PDF_MARGIN_LEFT, 52, item.date || '') + 8;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Type: ${item.type || '—'}`, PDF_MARGIN_LEFT, y);
    y += 12;

    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${label}`, PDF_MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(value), cw);
      doc.text(lines, PDF_MARGIN_LEFT, y + 5);
      y += 5 + Math.max(lines.length, 1) * 4.8 + 8;
    };
    writeBlock('Details', item.details);
    writeBlock('Results', item.results);
    writeBlock('Recommendations', item.recommendations);

    await finalizePatientPdf(doc, pageWidth, patient);
    return {
      filename: `investigation_${safeFileSegment(item.type)}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  async function buildExaminationPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const cw = PDF_CONTENT_W(doc);
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 116, 144);
    doc.text('EYE EXAMINATION REPORT', PDF_CONTENT_CENTER_X(pageWidth), 43, { align: 'center', maxWidth: cw });
    doc.setTextColor(0);

    let y = addPatientInfoBlock(doc, patient, PDF_MARGIN_LEFT, 52, item.date || item.createdAt || '') + 6;

    if (item.unaided_va) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Visual acuity (unaided)', PDF_MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `OD: ${item.unaided_va.right || '—'}          OS: ${item.unaided_va.left || '—'}`,
        PDF_MARGIN_LEFT + 52,
        y
      );
      y += 11;
    }
    if (item.iop) {
      doc.setFont('helvetica', 'bold');
      doc.text('Intraocular pressure', PDF_MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `OD: ${item.iop.right || '—'} mmHg          OS: ${item.iop.left || '—'} mmHg`,
        PDF_MARGIN_LEFT + 52,
        y
      );
      y += 11;
    }

    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${label}`, PDF_MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(value), cw);
      doc.text(lines, PDF_MARGIN_LEFT, y + 5);
      y += 5 + Math.max(lines.length, 1) * 4.8 + 8;
    };
    writeBlock('Lids', formatExamFinding(item.lids));
    writeBlock('Adnexa', formatExamFinding(item.adnexa));
    writeBlock('Anterior segment', formatExamFinding(item.anterior_segment));
    writeBlock('Pupils', formatExamFinding(item.pupils));
    writeBlock('Ocular motility', formatExamFinding(item.ocular_motility));
    writeBlock('Posterior segment', formatExamFinding(item.posterior_segment));
    writeBlock('Neuro-ophthalmic', formatExamFinding(item.neuro_ophthalmic));
    writeBlock('Diagnosis', item.diagnosis);
    writeBlock('Notes', item.notes);

    await finalizePatientPdf(doc, pageWidth, patient);
    return {
      filename: `examination_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  async function buildReportPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const cw = PDF_CONTENT_W(doc);
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 116, 144);
    doc.text((item.type || 'MEDICAL REPORT').toUpperCase(), PDF_CONTENT_CENTER_X(pageWidth), 43, { align: 'center', maxWidth: cw });
    doc.setTextColor(0);

    const y0 = addPatientInfoBlock(doc, patient, PDF_MARGIN_LEFT, 52, item.date || '') + 8;
    if (item.content) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(String(item.content), cw);
      doc.text(lines, PDF_MARGIN_LEFT, y0);
    }

    await finalizePatientPdf(doc, pageWidth, patient);
    return {
      filename: `report_${safeFileSegment(item.type) || 'report'}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  async function buildSurgeryPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const cw = PDF_CONTENT_W(doc);
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 116, 144);
    doc.text('SURGICAL REPORT', PDF_CONTENT_CENTER_X(pageWidth), 43, { align: 'center', maxWidth: cw });
    doc.setTextColor(0);

    let y = addPatientInfoBlock(doc, patient, PDF_MARGIN_LEFT, 52, item.datePerformed || item.dateScheduled || '') + 6;

    const writeLine = (label, value) => {
      if (value == null || value === '') return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${label}:`, PDF_MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), PDF_MARGIN_LEFT + 42, y);
      y += 9;
    };
    writeLine('Procedure', item.procedureName);
    writeLine('Eye', item.eye);
    writeLine('Type', item.surgeryType);
    if (item.iolPower) {
      writeLine('IOL', `${item.iolType || ''} ${item.iolModel || ''} ${item.iolPower}D`.trim());
    }

    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${label}`, PDF_MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(value), cw);
      doc.text(lines, PDF_MARGIN_LEFT, y + 5);
      y += 5 + Math.max(lines.length, 1) * 4.8 + 8;
    };
    writeBlock('Pre-operative diagnosis', item.preOpDiagnosis);
    writeBlock('Complications', item.complications);
    writeBlock('Post-operative instructions', item.postOpInstructions);

    await finalizePatientPdf(doc, pageWidth, patient);
    return {
      filename: `surgery_${safeFileSegment(item.procedureName)}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  async function buildLabPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    const cw = PDF_CONTENT_W(doc);
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 116, 144);
    doc.text('LABORATORY RESULTS', PDF_CONTENT_CENTER_X(pageWidth), 43, { align: 'center', maxWidth: cw });
    doc.setTextColor(0);

    let y = addPatientInfoBlock(doc, patient, PDF_MARGIN_LEFT, 52, item.date || '') + 6;

    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(`${label}`, PDF_MARGIN_LEFT, y);
      doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(String(value), cw);
      doc.text(lines, PDF_MARGIN_LEFT, y + 5);
      y += 5 + Math.max(lines.length, 1) * 4.8 + 8;
    };
    writeBlock('Panel type', item.panelType);
    writeBlock('Purpose', item.purpose);
    writeBlock('Results', item.results);
    writeBlock('Fitness status', item.fitnessStatus);
    writeBlock('Notes', item.notes);

    await finalizePatientPdf(doc, pageWidth, patient);
    return {
      filename: `lab_${safeFileSegment(item.panelType)}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  // Maps each section key to its PDF generator + display label.
  const PDF_BUILDERS = {
    glasses:        { folder: 'Glasses',        build: buildGlassesPDF },
    medications:    { folder: 'Medications',    build: buildMedicationPDF },
    treatments:     { folder: 'Treatments',     build: buildTreatmentPDF },
    investigations: { folder: 'Investigations', build: buildInvestigationPDF },
    examinations:   { folder: 'Examinations',   build: buildExaminationPDF },
    reports:        { folder: 'Reports',        build: buildReportPDF },
    surgeries:      { folder: 'Surgeries',      build: buildSurgeryPDF },
    labs:           { folder: 'Labs',           build: buildLabPDF },
  };

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
    const builder = PDF_BUILDERS[sectionKey];
    if (!builder) return;
    try {
      const { filename, blob } = await builder.build(item, currentBundle.patient);
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
      for (const [key, builder] of Object.entries(PDF_BUILDERS)) {
        const items = Array.isArray(currentBundle[key]) ? currentBundle[key] : [];
        if (!items.length) continue;
        const folder = zip.folder(builder.folder);
        for (const item of items) {
          const { filename, blob } = await builder.build(item, currentBundle.patient);
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

    warmPortalQRCaches(bundle.patient && bundle.patient.id != null ? String(bundle.patient.id) : null);
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
