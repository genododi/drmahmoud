/* Patient portal locale (default: Arabic). */
(function (global) {
  const LOCALE_KEY = 'mahmoud_portal_locale_v1';
  const DEFAULT_LOCALE = 'ar';

  const messages = {
    en: {
      pageTitle: 'Patient Portal · Dr. Mahmoud Sami',
      metaDescription:
        'Patient portal: log in with your Patient ID to access and download your eye-care records.',
      brandTitle: 'Patient Portal',
      brandSub: 'Dr. Mahmoud Sami Abouzeid · Consultant Ophthalmologist',
      navHome: '← Home',
      navSignOut: 'Sign out',
      langSwitchToAr: 'العربية',
      langSwitchToEn: 'English',
      langSwitchTitleToEn: 'Switch to English',
      langSwitchTitleToAr: 'Switch to Arabic',
      loginHeading: 'Access your records',
      loginIntroHtml:
        'Sign in with either the <strong>Patient ID</strong> highlighted on your prescription, or with your <strong>full name</strong> (first&nbsp;+&nbsp;middle&nbsp;+&nbsp;last, exactly as registered at the clinic).',
      loginLabel: 'Patient ID or full name',
      loginPlaceholder: 'e.g. 12345  or  Ahmed Hassan Ali',
      loginSubmit: 'Sign in',
      loginLoading: 'Loading…',
      loginHelpHtml:
        "Don't have your ID or your name doesn't work? Contact the clinic at <a href=\"tel:+201005602267\">01005602267</a>.",
      loginErrorAmbiguous:
        'Multiple patients share that exact name. Please sign in with your Patient ID (the highlighted ID on your prescription) instead.',
      loginErrorNotFound:
        'No records found. Please double-check your Patient ID or full name, or contact the clinic at 01005602267.',
      loginErrorGeneric: 'Something went wrong. Please try again or contact the clinic.',
      downloadAllZip: 'Download all my records (ZIP of PDFs)',
      downloadAllZipTitle: 'Download every record as a PDF, bundled into a single ZIP',
      printPage: 'Print this page',
      downloadJson: 'Download as JSON',
      downloadJsonTitle: 'Power-user option: raw JSON of every record',
      footerNoteHtml:
        'Records last published on <span id="generated-at">—</span>. If something is missing, ask the clinic to re-publish your bundle.',
      siteFooter: '© {year} Dr. Mahmoud Sami Eye Care Clinic.',
      patientFallback: 'Patient',
      metaId: 'ID',
      metaDob: 'DOB',
      downloadPdf: 'Download PDF',
      emptySection: 'No records in this section.',
      sectionGlasses: 'Glasses',
      sectionMedications: 'Medications',
      sectionTreatments: 'Treatments',
      sectionInvestigations: 'Investigations',
      sectionReports: 'Medical Reports',
      sectionExaminations: 'Examinations',
      sectionSurgeries: 'Surgeries',
      sectionLabs: 'Lab Results',
      cardOldGlasses: 'Old Glasses',
      cardGlassesRx: 'Glasses Prescription',
      cardMedication: 'Medication',
      cardTreatment: 'Treatment Plan',
      cardInvestigation: 'Investigation',
      cardExamination: 'Examination',
      cardReport: 'Medical Report',
      cardSurgery: 'Surgery',
      cardLab: 'Lab Result',
      labelEye: 'Eye',
      labelSph: 'SPH',
      labelCyl: 'CYL',
      labelAxis: 'Axis',
      labelVa: 'VA',
      labelAdd: 'ADD',
      labelOd: 'OD',
      labelOs: 'OS',
      labelPd: 'PD',
      labelNotes: 'Notes',
      labelType: 'Type',
      labelDosage: 'Dosage',
      labelFrequency: 'Frequency',
      labelDuration: 'Duration',
      labelInstructions: 'Instructions',
      labelTapering: 'Tapering',
      labelMedical: 'Medical',
      labelSurgical: 'Surgical',
      labelFollowUp: 'Follow-up',
      labelDetails: 'Details',
      labelResults: 'Results',
      labelRecommendations: 'Recommendations',
      labelUnaidedVa: 'Unaided VA',
      labelIop: 'IOP',
      labelLids: 'Lids',
      labelAnterior: 'Anterior segment',
      labelPosterior: 'Posterior segment',
      labelDiagnosis: 'Diagnosis',
      labelPurpose: 'Purpose',
      labelFitness: 'Fitness',
      labelPreOp: 'Pre-op diagnosis',
      labelIol: 'IOL',
      labelComplications: 'Complications',
      labelPostOp: 'Post-op',
      statusBuildingPdfs: 'Building PDFs…',
      statusBuiltRecords: 'Built {count} record{plural}…',
      statusCompressing: 'Compressing ZIP…',
      statusDownloaded: 'Downloaded {count} record{plural} as PDF.',
      zipPreparing: 'Preparing your records…',
      alertPdfLib: 'PDF library failed to load. Check your internet connection and try again.',
      alertPdfFailed: 'Could not generate the PDF. Please try again or contact the clinic.',
      alertZipLib: 'ZIP library failed to load. Please refresh and try again.',
      alertNoRecords: 'There are no records to download yet.',
      alertZipFailed: 'Could not build the ZIP. Please try again or contact the clinic.',
    },
    ar: {
      pageTitle: 'بوابة المريض · د. محمود سامي',
      metaDescription:
        'بوابة المريض: سجّل الدخول برقم المريض للاطلاع على سجلاتك وتحميلها.',
      brandTitle: 'بوابة المريض',
      brandSub: 'د. محمود سامي أبوزيد · استشاري طب وجراحة العيون',
      navHome: 'الرئيسية ←',
      navSignOut: 'تسجيل الخروج',
      langSwitchToAr: 'العربية',
      langSwitchToEn: 'English',
      langSwitchTitleToEn: 'التبديل إلى الإنجليزية',
      langSwitchTitleToAr: 'التبديل إلى العربية',
      loginHeading: 'الوصول إلى سجلاتك',
      loginIntroHtml:
        'سجّل الدخول إما بـ<strong>رقم المريض</strong> الظاهر على وصفتك، أو بـ<strong>اسمك الكامل</strong> (الاسم الأول + الأوسط + الأخير، كما هو مسجّل في العيادة تماماً).',
      loginLabel: 'رقم المريض أو الاسم الكامل',
      loginPlaceholder: 'مثال: 12345  أو  أحمد حسن علي',
      loginSubmit: 'تسجيل الدخول',
      loginLoading: 'جاري التحميل…',
      loginHelpHtml:
        'ليس لديك الرقم أو الاسم لا يعمل؟ تواصل مع العيادة على <a href="tel:+201005602267">01005602267</a>.',
      loginErrorAmbiguous:
        'يوجد أكثر من مريض بهذا الاسم. يرجى تسجيل الدخول برقم المريض (الرقم البارز على وصفتك).',
      loginErrorNotFound:
        'لم يتم العثور على سجلات. تحقق من رقم المريض أو الاسم الكامل، أو تواصل مع العيادة على 01005602267.',
      loginErrorGeneric: 'حدث خطأ. يرجى المحاولة مرة أخرى أو التواصل مع العيادة.',
      downloadAllZip: 'تحميل كل السجلات (ZIP من ملفات PDF)',
      downloadAllZipTitle: 'تحميل كل السجل كملف PDF في أرشيف ZIP واحد',
      printPage: 'طباعة هذه الصفحة',
      downloadJson: 'تحميل JSON',
      downloadJsonTitle: 'خيار متقدم: بيانات JSON الخام',
      footerNoteHtml:
        'آخر نشر للسجلات في <span id="generated-at">—</span>. إذا كان شيء ناقصاً، اطلب من العيادة إعادة نشر ملفك.',
      siteFooter: '© {year} عيادة د. محمود سامي لطب العيون.',
      patientFallback: 'مريض',
      metaId: 'رقم',
      metaDob: 'تاريخ الميلاد',
      downloadPdf: 'تحميل PDF',
      emptySection: 'لا توجد سجلات في هذا القسم.',
      sectionGlasses: 'النظارات',
      sectionMedications: 'الأدوية',
      sectionTreatments: 'خطط العلاج',
      sectionInvestigations: 'الفحوصات',
      sectionReports: 'التقارير الطبية',
      sectionExaminations: 'الفحوص السريرية',
      sectionSurgeries: 'العمليات',
      sectionLabs: 'نتائج المختبر',
      cardOldGlasses: 'نظارة قديمة',
      cardGlassesRx: 'وصفة نظارة',
      cardMedication: 'دواء',
      cardTreatment: 'خطة علاج',
      cardInvestigation: 'فحص',
      cardExamination: 'فحص سريري',
      cardReport: 'تقرير طبي',
      cardSurgery: 'عملية',
      cardLab: 'نتيجة مختبر',
      labelEye: 'العين',
      labelSph: 'كرة',
      labelCyl: 'أسطوانة',
      labelAxis: 'محور',
      labelVa: 'حدة',
      labelAdd: 'إضافة',
      labelOd: 'OD',
      labelOs: 'OS',
      labelPd: 'المسافة البؤرية',
      labelNotes: 'ملاحظات',
      labelType: 'النوع',
      labelDosage: 'الجرعة',
      labelFrequency: 'التكرار',
      labelDuration: 'المدة',
      labelInstructions: 'التعليمات',
      labelTapering: 'التدرج',
      labelMedical: 'علاج طبي',
      labelSurgical: 'علاج جراحي',
      labelFollowUp: 'متابعة',
      labelDetails: 'التفاصيل',
      labelResults: 'النتائج',
      labelRecommendations: 'التوصيات',
      labelUnaidedVa: 'حدة البصر بدون تصحيح',
      labelIop: 'ضغط العين',
      labelLids: 'الجفون',
      labelAnterior: 'القطاع الأمامي',
      labelPosterior: 'القطاع الخلفي',
      labelDiagnosis: 'التشخيص',
      labelPurpose: 'الغرض',
      labelFitness: 'اللياقة',
      labelPreOp: 'تشخيص ما قبل العملية',
      labelIol: 'عدسة داخلية',
      labelComplications: 'المضاعفات',
      labelPostOp: 'تعليمات ما بعد العملية',
      statusBuildingPdfs: 'جاري إنشاء ملفات PDF…',
      statusBuiltRecords: 'تم إنشاء {count} سجل{plural}…',
      statusCompressing: 'جاري ضغط ZIP…',
      statusDownloaded: 'تم تحميل {count} سجل{plural} بصيغة PDF.',
      zipPreparing: 'جاري تجهيز سجلاتك…',
      alertPdfLib: 'تعذّر تحميل مكتبة PDF. تحقق من الاتصال بالإنترنت وحاول مرة أخرى.',
      alertPdfFailed: 'تعذّر إنشاء ملف PDF. حاول مرة أخرى أو تواصل مع العيادة.',
      alertZipLib: 'تعذّر تحميل مكتبة ZIP. حدّث الصفحة وحاول مرة أخرى.',
      alertNoRecords: 'لا توجد سجلات للتحميل بعد.',
      alertZipFailed: 'تعذّر إنشاء ملف ZIP. حاول مرة أخرى أو تواصل مع العيادة.',
    },
  };

  let locale = DEFAULT_LOCALE;
  const listeners = new Set();

  function getLocale() {
    try {
      const stored = localStorage.getItem(LOCALE_KEY);
      if (stored === 'en' || stored === 'ar') return stored;
    } catch { /* ignore */ }
    return DEFAULT_LOCALE;
  }

  function interpolate(template, vars) {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (_, key) => {
      if (key === 'plural' && 'count' in vars) {
        const n = Number(vars.count);
        return locale === 'ar'
          ? (n === 1 ? '' : 'ات')
          : (n === 1 ? '' : 's');
      }
      return vars[key] != null ? String(vars[key]) : '';
    });
  }

  function t(key, vars) {
    const bag = messages[locale] || messages.en;
    const raw = bag[key] ?? messages.en[key] ?? key;
    return interpolate(raw, vars);
  }

  function applyDocumentLocale() {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.title = t('pageTitle');
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t('metaDescription'));
  }

  function applyStaticI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      const val = t(key);
      if (el.hasAttribute('data-i18n-html')) el.innerHTML = val;
      else el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
      langBtn.textContent = locale === 'ar' ? t('langSwitchToEn') : t('langSwitchToAr');
      langBtn.setAttribute(
        'title',
        locale === 'ar' ? t('langSwitchTitleToEn') : t('langSwitchTitleToAr')
      );
    }
    const yearEl = document.getElementById('year');
    if (yearEl) {
      const footer = document.querySelector('[data-i18n="siteFooter"]');
      if (footer) footer.textContent = t('siteFooter', { year: yearEl.textContent });
    }
  }

  function setLocale(next) {
    if (next !== 'en' && next !== 'ar') return;
    locale = next;
    try {
      localStorage.setItem(LOCALE_KEY, locale);
    } catch { /* ignore */ }
    applyDocumentLocale();
    applyStaticI18n();
    listeners.forEach((fn) => {
      try { fn(locale); } catch (e) { console.error(e); }
    });
  }

  function toggleLocale() {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function init() {
    locale = getLocale();
    applyDocumentLocale();
    applyStaticI18n();
    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) langBtn.addEventListener('click', toggleLocale);
  }

  global.PortalI18n = {
    getLocale: () => locale,
    setLocale,
    toggleLocale,
    t,
    applyStaticI18n,
    onChange,
    init,
    dateLocale: () => (locale === 'ar' ? 'ar-EG' : undefined),
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(typeof window !== 'undefined' ? window : globalThis);
