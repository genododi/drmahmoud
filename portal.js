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
  const SESSION_KEY = 'mahmoud_portal_session_v1';
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
  };

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
    } catch (e) { /* ignore quota errors */ }
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

  // ----- Data loading ---------------------------------------------------
  async function fetchPatientBundle(rawId) {
    const id = String(rawId || '').trim();
    if (!id) throw new Error('Empty Patient ID');
    const indiv = `patients/${encodeURIComponent(id)}.json`;
    try {
      const r = await fetch(indiv, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch { /* fall through */ }
    try {
      const r = await fetch('portal_all_patients.json', { cache: 'no-store' });
      if (r.ok) {
        const all = await r.json();
        if (all && typeof all === 'object' && all[id]) return all[id];
      }
    } catch { /* fall through */ }
    return null;
  }

  // ----- Formatting helpers --------------------------------------------
  function fmtDate(s) {
    if (!s) return '—';
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return s;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
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
      throw new Error('PDF library failed to load. Check your internet connection and try again.');
    }
  }

  function makeDoc() {
    ensurePdfLibsReady();
    const { jsPDF } = window.jspdf;
    return new jsPDF();
  }

  function addPdfHeader(doc, pageWidth) {
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text(CLINIC.name, pageWidth / 2, 15, { align: 'center' });

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(CLINIC.title1, pageWidth / 2, 22, { align: 'center' });
    doc.text(CLINIC.title2, pageWidth / 2, 27, { align: 'center' });
    doc.text(CLINIC.title3, pageWidth / 2, 32, { align: 'center' });

    doc.setDrawColor(0, 128, 128);
    doc.setLineWidth(0.5);
    doc.line(20, 38, pageWidth - 20, 38);
  }

  function addPdfFooter(doc, pageWidth, message) {
    const footerY = doc.internal.pageSize.getHeight() - 30;
    doc.setDrawColor(200, 200, 200);
    doc.line(20, footerY - 5, pageWidth - 20, footerY - 5);

    doc.setFontSize(9);
    doc.setTextColor(100);
    if (message) doc.text(message, pageWidth / 2, footerY, { align: 'center' });
    doc.text(`Tel: ${CLINIC.phone}`, pageWidth / 2, footerY + 7, { align: 'center' });
    doc.text(CLINIC.address, pageWidth / 2, footerY + 14, { align: 'center' });
    doc.setTextColor(0);
  }

  function addPatientInfoBlock(doc, patient, x, y, recordDate) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0);
    const rows = [
      `Patient: ${patient.name || '-'}`,
      patient.id ? `Patient ID: ${patient.id}` : '',
      patient.dob ? `DOB: ${patient.dob}` : '',
      patient.contact ? `Phone: ${patient.contact}` : '',
      recordDate ? `Date: ${recordDate}` : '',
    ].filter(Boolean);
    rows.forEach((row, i) => doc.text(row, x, y + i * 6));
    return y + rows.length * 6 + 4;
  }

  /** Glasses prescription PDF (mirrors the EMR layout, no Rx ID). */
  function buildGlassesPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    addPdfHeader(doc, pageWidth);

    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 128, 128);
    const title = item.glassesType === 'old' ? 'OLD GLASSES PRESCRIPTION' : 'OPTICAL PRESCRIPTION';
    doc.text(title, pageWidth / 2, 50, { align: 'center' });
    doc.setTextColor(0);

    if (item.glassesType === 'old') {
      doc.setFillColor(254, 243, 199);
      doc.roundedRect(pageWidth / 2 - 25, 54, 50, 8, 2, 2, 'F');
      doc.setFontSize(8);
      doc.setTextColor(146, 64, 14);
      doc.text('Historical Record', pageWidth / 2, 59, { align: 'center' });
      doc.setTextColor(0);
    }

    addPatientInfoBlock(doc, patient, 20, 70, item.date || '');

    const tableMargin = 10;
    const tableWidth = pageWidth - tableMargin * 2;
    const eyeColWidth = 60;
    const dataColWidth = (tableWidth - eyeColWidth) / 5;

    doc.autoTable({
      startY: 88,
      head: [['Eye', 'SPH', 'CYL', 'Axis', 'VA', 'ADD']],
      body: [
        ['Right Eye (OD)', item.sph_right || '-', item.cyl_right || '-', item.axis_right || '-', item.va_right || '-', item.add_power || '-'],
        ['Left Eye (OS)', item.sph_left || '-', item.cyl_left || '-', item.axis_left || '-', item.va_left || '-', item.add_power || '-'],
      ],
      theme: 'grid',
      tableWidth,
      headStyles: {
        fillColor: [0, 128, 128], textColor: 255, fontStyle: 'bold', fontSize: 12, halign: 'center',
        cellPadding: { top: 5, right: 3, bottom: 5, left: 3 },
      },
      bodyStyles: {
        fontSize: 13, halign: 'center', font: 'helvetica', overflow: 'visible',
        cellPadding: { top: 6, right: 3, bottom: 6, left: 3 },
      },
      columnStyles: {
        0: { fontStyle: 'bold', halign: 'left', cellWidth: eyeColWidth, fontSize: 12 },
        1: { cellWidth: dataColWidth },
        2: { cellWidth: dataColWidth },
        3: { cellWidth: dataColWidth },
        4: { cellWidth: dataColWidth },
        5: { cellWidth: dataColWidth },
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      margin: { left: tableMargin, right: tableMargin },
    });

    let y = doc.lastAutoTable.finalY + 15;
    if (item.pd) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.text(`Pupillary Distance (PD): ${item.pd}`, 20, y);
      y += 15;
    }
    if (item.notes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('Notes:', 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(item.notes), 20, y + 8, { maxWidth: pageWidth - 40 });
    }

    addPdfFooter(doc, pageWidth, 'This prescription is valid for 6 months from the date of issue.');
    return {
      filename: `glasses_${item.glassesType === 'old' ? 'old' : 'rx'}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  function buildMedicationPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    addPdfHeader(doc, pageWidth);

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('MEDICATION PRESCRIPTION', pageWidth / 2, 48, { align: 'center' });

    addPatientInfoBlock(doc, patient, 20, 58, item.date || item.createdAt || '');

    doc.autoTable({
      startY: 90,
      head: [['#', 'Medication', 'Dosage', 'Frequency', 'Duration']],
      body: [[
        '1',
        `${item.name || '-'}\n${item.type ? `(${item.type})` : ''}`,
        item.dosage || '-',
        item.frequency || '-',
        item.duration || '-',
      ]],
      theme: 'grid',
      headStyles: { fillColor: [0, 128, 128], textColor: 255, fontSize: 11, cellPadding: 5 },
      bodyStyles: { fontSize: 10, cellPadding: 6 },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 60 },
        2: { cellWidth: 30, halign: 'center' },
        3: { cellWidth: 45 },
        4: { cellWidth: 30, halign: 'center' },
      },
    });

    let y = doc.lastAutoTable.finalY + 15;
    if (item.instructions || item.tapering) {
      doc.setFont('helvetica', 'bold');
      doc.text('Instructions:', 20, y);
      doc.setFont('helvetica', 'normal');
      const text = [item.instructions, item.tapering].filter(Boolean).join(' ');
      doc.text(text, 20, y + 8, { maxWidth: pageWidth - 40 });
    }

    addPdfFooter(doc, pageWidth, 'Please follow instructions carefully.');
    return {
      filename: `medication_${safeFileSegment(item.name)}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  function buildTreatmentPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('TREATMENT PLAN', pageWidth / 2, 50, { align: 'center' });
    addPatientInfoBlock(doc, patient, 20, 60, item.date || '');

    let y = 80;
    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 20, y + 7, { maxWidth: pageWidth - 40 });
      y += 25;
    };
    writeBlock('Medical Treatment', item.medical_treatment || item.medicalTreatment);
    writeBlock('Surgical Treatment', item.surgical_treatment || item.surgicalTreatment);
    if (item.followup_date || item.followupDate) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Follow-up Date: ${item.followup_date || item.followupDate}`, 20, y);
      y += 15;
    }
    writeBlock('Notes', item.notes);

    addPdfFooter(doc, pageWidth, '');
    return {
      filename: `treatment_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  function buildInvestigationPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('INVESTIGATION REPORT', pageWidth / 2, 52, { align: 'center' });
    addPatientInfoBlock(doc, patient, 20, 62, item.date || '');

    let y = 82;
    doc.setFont('helvetica', 'bold');
    doc.text(`Type: ${item.type || '-'}`, 20, y);
    y += 10;
    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 20, y + 7, { maxWidth: pageWidth - 40 });
      y += 20;
    };
    writeBlock('Details', item.details);
    writeBlock('Results', item.results);
    writeBlock('Recommendations', item.recommendations);

    addPdfFooter(doc, pageWidth, '');
    return {
      filename: `investigation_${safeFileSegment(item.type)}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  function buildExaminationPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('EYE EXAMINATION REPORT', pageWidth / 2, 48, { align: 'center' });
    addPatientInfoBlock(doc, patient, 20, 58, item.date || item.createdAt || '');

    let y = 80;
    if (item.unaided_va) {
      doc.setFont('helvetica', 'bold');
      doc.text('Visual Acuity (Unaided):', 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`OD: ${item.unaided_va.right || '-'}   OS: ${item.unaided_va.left || '-'}`, 80, y);
      y += 10;
    }
    if (item.iop) {
      doc.setFont('helvetica', 'bold');
      doc.text('Intraocular Pressure:', 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(`OD: ${item.iop.right || '-'} mmHg   OS: ${item.iop.left || '-'} mmHg`, 80, y);
      y += 12;
    }
    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 20, y + 7, { maxWidth: pageWidth - 40 });
      y += 20;
    };
    writeBlock('Anterior Segment', item.anterior_segment);
    writeBlock('Posterior Segment', item.posterior_segment);
    writeBlock('Diagnosis', item.diagnosis);
    writeBlock('Notes', item.notes);

    addPdfFooter(doc, pageWidth, '');
    return {
      filename: `examination_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  function buildReportPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text((item.type || 'MEDICAL REPORT').toUpperCase(), pageWidth / 2, 55, { align: 'center' });
    addPatientInfoBlock(doc, patient, 20, 65, item.date || '');
    if (item.content) {
      doc.setFont('helvetica', 'normal');
      doc.text(doc.splitTextToSize(String(item.content), pageWidth - 40), 20, 90);
    }
    addPdfFooter(doc, pageWidth, '');
    return {
      filename: `report_${safeFileSegment(item.type) || 'report'}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  function buildSurgeryPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('SURGICAL REPORT', pageWidth / 2, 52, { align: 'center' });
    addPatientInfoBlock(doc, patient, 20, 62, item.datePerformed || item.dateScheduled || '');

    let y = 82;
    const writeLine = (label, value) => {
      if (value == null || value === '') return;
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 60, y);
      y += 9;
    };
    writeLine('Procedure', item.procedureName);
    writeLine('Eye', item.eye);
    writeLine('Type', item.surgeryType);
    if (item.iolPower) writeLine('IOL', `${item.iolType || ''} ${item.iolModel || ''} ${item.iolPower}D`.trim());

    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 20, y + 7, { maxWidth: pageWidth - 40 });
      y += 20;
    };
    writeBlock('Pre-op Diagnosis', item.preOpDiagnosis);
    writeBlock('Complications', item.complications);
    writeBlock('Post-op Instructions', item.postOpInstructions);

    addPdfFooter(doc, pageWidth, '');
    return {
      filename: `surgery_${safeFileSegment(item.procedureName)}_${recordDateForFile(item) || safeFileSegment(item.id)}.pdf`,
      blob: doc.output('blob'),
    };
  }

  function buildLabPDF(item, patient) {
    const doc = makeDoc();
    const pageWidth = doc.internal.pageSize.getWidth();
    addPdfHeader(doc, pageWidth);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('LABORATORY RESULTS', pageWidth / 2, 52, { align: 'center' });
    addPatientInfoBlock(doc, patient, 20, 62, item.date || '');

    let y = 82;
    const writeBlock = (label, value) => {
      if (!value) return;
      doc.setFont('helvetica', 'bold');
      doc.text(`${label}:`, 20, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), 20, y + 7, { maxWidth: pageWidth - 40 });
      y += 20;
    };
    writeBlock('Panel Type', item.panelType);
    writeBlock('Purpose', item.purpose);
    writeBlock('Results', item.results);
    writeBlock('Fitness Status', item.fitnessStatus);
    writeBlock('Notes', item.notes);

    addPdfFooter(doc, pageWidth, '');
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

  function downloadOneRecord(sectionKey, item) {
    if (!currentBundle) return;
    const builder = PDF_BUILDERS[sectionKey];
    if (!builder) return;
    try {
      const { filename, blob } = builder.build(item, currentBundle.patient);
      downloadBlob(filename, blob);
    } catch (e) {
      console.error('PDF generation failed', e);
      alert('Could not generate the PDF. Please try again or contact the clinic.');
    }
  }

  async function downloadAllAsZip() {
    if (!currentBundle) return;
    if (typeof window.JSZip !== 'function') {
      alert('ZIP library failed to load. Please refresh and try again.');
      return;
    }
    downloadAllPdfsBtn.disabled = true;
    const originalLabel = downloadAllPdfsBtn.textContent;
    downloadAllPdfsBtn.textContent = 'Preparing your records…';
    setStatus('Building PDFs…');
    try {
      const zip = new window.JSZip();
      let total = 0;
      for (const [key, builder] of Object.entries(PDF_BUILDERS)) {
        const items = Array.isArray(currentBundle[key]) ? currentBundle[key] : [];
        if (!items.length) continue;
        const folder = zip.folder(builder.folder);
        items.forEach((item) => {
          const { filename, blob } = builder.build(item, currentBundle.patient);
          folder.file(filename, blob);
          total += 1;
        });
        setStatus(`Built ${total} record${total === 1 ? '' : 's'}…`);
        // Yield to the UI so the status text actually paints.
        await new Promise((r) => setTimeout(r, 0));
      }
      if (total === 0) {
        alert('There are no records to download yet.');
        return;
      }
      // Include the raw JSON too for safekeeping.
      zip.file('records.json', JSON.stringify(currentBundle, null, 2));

      setStatus('Compressing ZIP…');
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const stamp = new Date().toISOString().slice(0, 10);
      const fileSafeName = safeFileSegment(currentBundle.patient.name || currentBundle.patient.id);
      downloadBlob(`records_${fileSafeName}_${stamp}.zip`, blob);
      setStatus(`Downloaded ${total} record${total === 1 ? '' : 's'} as PDF.`);
    } catch (e) {
      console.error('ZIP build failed', e);
      alert('Could not build the ZIP. Please try again or contact the clinic.');
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
              Download PDF
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
            <th>Eye</th><th>SPH</th><th>CYL</th><th>Axis</th><th>VA</th><th>ADD</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>OD</strong></td>
            <td>${escapeHTML(g.sph_right || '-')}</td>
            <td>${escapeHTML(g.cyl_right || '-')}</td>
            <td>${escapeHTML(g.axis_right || '-')}</td>
            <td>${escapeHTML(g.va_right || '-')}</td>
            <td rowspan="2">${escapeHTML(g.add_power || '-')}</td>
          </tr>
          <tr>
            <td><strong>OS</strong></td>
            <td>${escapeHTML(g.sph_left || '-')}</td>
            <td>${escapeHTML(g.cyl_left || '-')}</td>
            <td>${escapeHTML(g.axis_left || '-')}</td>
            <td>${escapeHTML(g.va_left || '-')}</td>
          </tr>
        </tbody>
      </table>
      ${g.pd ? `<p><b>PD:</b> ${escapeHTML(g.pd)}</p>` : ''}
      ${g.notes ? `<p><b>Notes:</b> ${escapeHTML(g.notes)}</p>` : ''}
    `;
  }

  function renderGlasses(item, i) {
    const isOld = item.glassesType === 'old';
    return recordCardShell(
      isOld ? 'Old Glasses' : 'Glasses Prescription',
      fmtDate(item.date),
      glassesRowsHTML(item),
      'glasses', i
    );
  }

  function renderMedication(item, i) {
    const body = `
      <div class="record-grid">
        ${item.type ? `<div><b>Type:</b> ${escapeHTML(item.type)}</div>` : ''}
        ${item.dosage ? `<div><b>Dosage:</b> ${escapeHTML(item.dosage)}</div>` : ''}
        ${item.frequency ? `<div><b>Frequency:</b> ${escapeHTML(item.frequency)}</div>` : ''}
        ${item.duration ? `<div><b>Duration:</b> ${escapeHTML(item.duration)}</div>` : ''}
      </div>
      ${item.instructions ? `<p><b>Instructions:</b> ${escapeHTML(item.instructions)}</p>` : ''}
      ${item.tapering ? `<p><b>Tapering:</b> ${escapeHTML(item.tapering)}</p>` : ''}
    `;
    return recordCardShell(item.name || 'Medication', fmtDate(item.date || item.createdAt), body, 'medications', i);
  }

  function renderTreatment(item, i) {
    const body = `
      ${(item.medical_treatment || item.medicalTreatment) ? `<p><b>Medical:</b> ${escapeHTML(item.medical_treatment || item.medicalTreatment)}</p>` : ''}
      ${(item.surgical_treatment || item.surgicalTreatment) ? `<p><b>Surgical:</b> ${escapeHTML(item.surgical_treatment || item.surgicalTreatment)}</p>` : ''}
      ${(item.followup_date || item.followupDate) ? `<p><b>Follow-up:</b> ${escapeHTML(item.followup_date || item.followupDate)}</p>` : ''}
      ${item.notes ? `<p><b>Notes:</b> ${escapeHTML(item.notes)}</p>` : ''}
    `;
    return recordCardShell('Treatment Plan', fmtDate(item.date), body, 'treatments', i);
  }

  function renderInvestigation(item, i) {
    const body = `
      ${item.details ? `<p><b>Details:</b> ${escapeHTML(item.details)}</p>` : ''}
      ${item.results ? `<p><b>Results:</b> ${escapeHTML(item.results)}</p>` : ''}
      ${item.recommendations ? `<p><b>Recommendations:</b> ${escapeHTML(item.recommendations)}</p>` : ''}
    `;
    return recordCardShell(item.type || 'Investigation', fmtDate(item.date), body, 'investigations', i);
  }

  function renderExamination(item, i) {
    const body = `
      ${item.unaided_va ? `<p><b>Unaided VA:</b> OD ${escapeHTML(item.unaided_va.right || '-')} / OS ${escapeHTML(item.unaided_va.left || '-')}</p>` : ''}
      ${item.iop ? `<p><b>IOP:</b> OD ${escapeHTML(item.iop.right || '-')} mmHg / OS ${escapeHTML(item.iop.left || '-')} mmHg</p>` : ''}
      ${item.anterior_segment ? `<p><b>Anterior segment:</b> ${escapeHTML(item.anterior_segment)}</p>` : ''}
      ${item.posterior_segment ? `<p><b>Posterior segment:</b> ${escapeHTML(item.posterior_segment)}</p>` : ''}
      ${item.diagnosis ? `<p><b>Diagnosis:</b> ${escapeHTML(item.diagnosis)}</p>` : ''}
      ${item.notes ? `<p><b>Notes:</b> ${escapeHTML(item.notes)}</p>` : ''}
    `;
    return recordCardShell('Examination', fmtDate(item.date || item.createdAt), body, 'examinations', i);
  }

  function renderReport(item, i) {
    const body = item.content ? `<p style="white-space:pre-wrap">${escapeHTML(item.content)}</p>` : '';
    return recordCardShell(item.type || 'Medical Report', fmtDate(item.date), body, 'reports', i);
  }

  function renderSurgery(item, i) {
    const body = `
      ${item.eye ? `<p><b>Eye:</b> ${escapeHTML(item.eye)}</p>` : ''}
      ${item.surgeryType ? `<p><b>Type:</b> ${escapeHTML(item.surgeryType)}</p>` : ''}
      ${item.preOpDiagnosis ? `<p><b>Pre-op diagnosis:</b> ${escapeHTML(item.preOpDiagnosis)}</p>` : ''}
      ${item.iolPower ? `<p><b>IOL:</b> ${escapeHTML(`${item.iolType || ''} ${item.iolModel || ''} ${item.iolPower}D`)}</p>` : ''}
      ${item.complications ? `<p><b>Complications:</b> ${escapeHTML(item.complications)}</p>` : ''}
      ${item.postOpInstructions ? `<p><b>Post-op:</b> ${escapeHTML(item.postOpInstructions)}</p>` : ''}
    `;
    return recordCardShell(item.procedureName || 'Surgery', fmtDate(item.datePerformed || item.dateScheduled), body, 'surgeries', i);
  }

  function renderLab(item, i) {
    const body = `
      ${item.purpose ? `<p><b>Purpose:</b> ${escapeHTML(item.purpose)}</p>` : ''}
      ${item.results ? `<p><b>Results:</b> ${escapeHTML(item.results)}</p>` : ''}
      ${item.fitnessStatus ? `<p><b>Fitness:</b> ${escapeHTML(item.fitnessStatus)}</p>` : ''}
      ${item.notes ? `<p><b>Notes:</b> ${escapeHTML(item.notes)}</p>` : ''}
    `;
    return recordCardShell(item.panelType || 'Lab Result', fmtDate(item.date), body, 'labs', i);
  }

  const SECTIONS = [
    { key: 'glasses',        label: 'Glasses',         render: renderGlasses },
    { key: 'medications',    label: 'Medications',     render: renderMedication },
    { key: 'treatments',     label: 'Treatments',      render: renderTreatment },
    { key: 'investigations', label: 'Investigations',  render: renderInvestigation },
    { key: 'reports',        label: 'Medical Reports', render: renderReport },
    { key: 'examinations',   label: 'Examinations',    render: renderExamination },
    { key: 'surgeries',      label: 'Surgeries',       render: renderSurgery },
    { key: 'labs',           label: 'Lab Results',     render: renderLab },
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

    patientNameEl.textContent = bundle.patient.name || 'Patient';
    const metaBits = [`ID ${bundle.patient.id}`];
    if (bundle.patient.dob) metaBits.push(`DOB ${bundle.patient.dob}`);
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
      tab.innerHTML = `${sec.label}<span class="count">${items.length}</span>`;
      tab.addEventListener('click', () => activateTab(sec.key));
      tabsEl.appendChild(tab);

      const panel = document.createElement('div');
      panel.className = 'record-panel';
      panel.dataset.key = sec.key;
      panel.innerHTML = items.length
        ? items.map((it, i) => sec.render(it, i)).join('')
        : '<div class="empty">No records in this section.</div>';
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
    const id = QS('#patient-id').value.trim();
    if (!id) return;
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Loading…';
    try {
      const bundle = await fetchPatientBundle(id);
      if (!bundle) {
        showLogin('No records found for that Patient ID. Please double-check the ID or contact the clinic.');
        return;
      }
      setSession(bundle);
      showBundle(bundle);
      if (parseHashId()) history.replaceState(null, '', location.pathname);
    } catch (err) {
      console.error(err);
      showLogin('Something went wrong. Please try again or contact the clinic.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
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
    if (item) downloadOneRecord(sectionKey, item);
  });

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
      const bundle = await fetchPatientBundle(sess.patientId);
      if (bundle) showBundle(bundle);
      else clearSession();
    }
  })();
})();
