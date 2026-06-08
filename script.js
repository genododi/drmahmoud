const translations = {
  en: {
    dir: "ltr",
    title: "Dr. Mahmoud Sami | Consultant Ophthalmologist - Talbeya El-Haram, Giza",
    items: {
      "عيادة عيون متخصصة · طالبية الهرم، الجيزة": "Specialized eye clinic · Talbeya El-Haram, Giza",
      "رعاية عيون دقيقة تجمع بين الخبرة الجراحية والاهتمام الشخصي.": "Precise eye care combining surgical experience with personal attention.",
      "تقييم طبي منظم، شرح مفهوم للنتائج، وخطة علاج ومتابعة تناسب حالة كل مريض — من فحوصات النظر والعدسات إلى جراحات المياه البيضاء، تصحيح الإبصار، الجفون، القنوات الدمعية، والشبكية.": "Structured assessment, clear explanation of results, and a treatment and follow-up plan tailored to each patient.",
      "احجز موعدك الآن": "Book now",
      "دردشة مباشرة": "Live chat",
      "واتساب العيادة": "Clinic WhatsApp",
      "استعرض الخدمات": "View services",
      "الرئيسية": "Home",
      "عن الطبيب": "About",
      "الخبرة الجراحية": "Surgical experience",
      "الخدمات": "Services",
      "الدردشة المباشرة": "Live chat",
      "رحلة المريض": "Patient journey",
      "بوابة المريض": "Patient portal",
      "التواصل": "Contact",
      "عن الطبيب": "About",
      "د. محمود سامي أبوزيد": "Dr. Mahmoud Sami Abouzeid",
      "الخبرة الجراحية": "Surgical experience",
      "خبرة عملية في جراحات العيون مع اهتمام بالتقنيات الحديثة": "Practical surgical experience with modern eye-care technologies",
      "تصحيح الإبصار الحديث": "Modern refractive surgery",
      "FemtoSMILE Pro باستخدام ZEISS VISUMAX 800": "FemtoSMILE Pro using ZEISS VISUMAX 800",
      "جراحات المياه البيضاء والعدسات": "Cataract and lens surgery",
      "جراحات الجفون والقنوات الدمعية": "Eyelid and lacrimal surgery",
      "الشبكية وفحوصات الأطفال المبتسرين": "Retina and premature infant screening",
      "ميزة جديدة عند بداية الصفحة": "New homepage feature",
      "دردشة مباشرة داخل الموقع مع رفع المستندات": "On-site live chat with document upload",
      "إعجاب بالصفحة أولًا": "Like the page first",
      "ابدأ الدردشة وارفع ملفاتك": "Start chat and upload files",
      "متابعة أسرع": "Faster follow-up",
      "صندوق دردشة للمريض مع رفع المستندات": "Patient chat box with document upload",
      "افتح صندوق الدردشة": "Open chat box",
      "ابدأ المحادثة الآن": "Start conversation now",
      "دردشة مباشرة ورفع مستندات": "Live chat and document upload",
      "ابدأ الدردشة": "Start chat",
      "دردشة مباشرة مع العيادة": "Live chat with the clinic",
      "اكتب رسالتك وارفع صور التقارير": "Write your message and upload report images",
      "الاسم": "Name",
      "رقم الهاتف": "Phone number",
      "الرسالة": "Message",
      "رفع مستندات أو صور": "Upload documents or images",
      "إرسال الطلب داخل الدردشة": "Send request in chat",
      "تابع الصفحة للرد السريع": "Follow the page for faster replies",
      "التخصصات والخدمات": "Services",
      "رعاية متكاملة لصحة العين": "Comprehensive eye care",
      "فحص شامل للعين": "Comprehensive eye exam",
      "المياه البيضاء": "Cataract surgery",
      "تصحيح الإبصار": "Refractive surgery",
      "جراحات الجفون": "Eyelid surgery",
      "القنوات الدمعية": "Lacrimal surgery",
      "الشبكية وROP": "Retina & ROP",
      "من الحجز إلى المتابعة": "From booking to follow-up",
      "خدمات إلكترونية": "Digital services",
      "بوابة المريض وTelexam": "Patient portal & Telexam",
      "افتح بوابة المريض": "Open patient portal",
      "تواصل مع العيادة": "Contact the clinic",
      "أسئلة شائعة": "FAQ",
      "قبل زيارة العيادة": "Before your visit",
      "التواصل والحجز": "Contact & booking",
      "زيارة العيادة": "Visit the clinic",
      "التليفون": "Phone",
      "واتساب": "WhatsApp",
      "العنوان": "Address",
      "اتصل الآن": "Call now"
    }
  },
  ar: { dir: "rtl" }
};

const menuToggle = document.querySelector(".menu-toggle");
const navLinks = document.querySelector(".nav-links");
const startupChatPop = document.getElementById("startupChatPop");
const inlineChatBox = document.getElementById("inlineChatBox");
const inlineChatBackdrop = document.getElementById("inlineChatBackdrop");
const inlineChatMessages = document.getElementById("inlineChatMessages");
const inlineChatForm = document.getElementById("inlineChatForm");
const chatFiles = document.getElementById("chatFiles");
const chatFileList = document.getElementById("chatFileList");

function enforceStandardWebsiteView() {
  const readerClasses = [
    "reader-mode",
    "reading-mode",
    "read-mode",
    "simplified-mode",
    "is-reader",
    "reader"
  ];

  document.documentElement.dataset.siteView = "standard";
  document.body?.setAttribute("data-standard-view", "true");
  document.documentElement.classList.remove(...readerClasses);
  document.body?.classList.remove(...readerClasses);

  const url = new URL(window.location.href);
  const readerParams = ["reader", "readermode", "reading", "simplified"];
  let changed = false;

  readerParams.forEach(param => {
    if (url.searchParams.has(param)) {
      url.searchParams.delete(param);
      changed = true;
    }
  });

  if (url.searchParams.get("mode") === "reader") {
    url.searchParams.delete("mode");
    changed = true;
  }

  if (/^#(?:reader|readermode|reading|simplified)$/i.test(url.hash)) {
    url.hash = "";
    changed = true;
  }

  if (changed) {
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }
}

enforceStandardWebsiteView();
window.addEventListener("pageshow", enforceStandardWebsiteView);

document.querySelectorAll("[data-home-link]").forEach(link => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const onHome = /\/(?:index\.html)?$/.test(window.location.pathname);
    if (onHome && !window.location.hash && !window.location.search) {
      window.location.reload();
    } else {
      window.location.assign("index.html");
    }
  });
});

if (startupChatPop && sessionStorage.getItem("drmahmoudChatPopClosed") === "1") {
  startupChatPop.classList.add("is-hidden");
}

document.querySelector(".chat-pop-close")?.addEventListener("click", () => {
  startupChatPop?.classList.add("is-hidden");
  sessionStorage.setItem("drmahmoudChatPopClosed", "1");
});

function openInlineChat() {
  inlineChatBox?.classList.remove("is-hidden");
  inlineChatBackdrop?.classList.remove("is-hidden");
  startupChatPop?.classList.add("is-hidden");
  document.getElementById("chatPatientName")?.focus();
}

function closeInlineChat() {
  inlineChatBox?.classList.add("is-hidden");
  inlineChatBackdrop?.classList.add("is-hidden");
}

function addChatBubble(text, type = "clinic") {
  if (!inlineChatMessages) return;
  const bubble = document.createElement("div");
  bubble.className = `chat-bubble ${type === "patient" ? "patient-bubble" : "clinic-bubble"}`;
  bubble.textContent = text;
  inlineChatMessages.appendChild(bubble);
  inlineChatMessages.scrollTop = inlineChatMessages.scrollHeight;
}

document.querySelectorAll("[data-open-chat]").forEach(button => {
  button.addEventListener("click", openInlineChat);
});

document.querySelector(".inline-chat-close")?.addEventListener("click", closeInlineChat);
inlineChatBackdrop?.addEventListener("click", closeInlineChat);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeInlineChat();
});

chatFiles?.addEventListener("change", () => {
  if (!chatFileList) return;
  const files = Array.from(chatFiles.files || []);
  chatFileList.innerHTML = "";

  if (!files.length) {
    chatFileList.textContent = "";
    return;
  }

  files.forEach(file => {
    const item = document.createElement("span");
    const size = file.size >= 1024 * 1024
      ? `${(file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(file.size / 1024))} KB`;
    item.textContent = `${file.name} · ${size}`;
    chatFileList.appendChild(item);
  });
});

inlineChatForm?.addEventListener("submit", (event) => {
  event.preventDefault();
  if (!inlineChatForm.reportValidity()) return;

  const name = document.getElementById("chatPatientName")?.value.trim() || "المريض";
  const message = document.getElementById("chatPatientMessage")?.value.trim() || "";
  const filesCount = chatFiles?.files?.length || 0;
  const fileText = filesCount ? ` وتم اختيار ${filesCount} ملف/ملفات للمعاينة.` : "";

  addChatBubble(`${name}: ${message}${fileText}`, "patient");
  addChatBubble("تم تجهيز طلبك داخل صندوق الدردشة. الإرسال الفعلي للمرفقات يحتاج ربط الموقع بخدمة رسائل أو نظام العيادة، وللحالات العاجلة اتصل بالعيادة فورًا.", "clinic");

  inlineChatForm.reset();
  if (chatFileList) chatFileList.textContent = "";
});

menuToggle?.addEventListener("click", () => {
  const expanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!expanded));
  navLinks.classList.toggle("open");
});

document.querySelectorAll(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    navLinks.classList.remove("open");
    menuToggle?.setAttribute("aria-expanded", "false");
  });
});

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) entry.target.classList.add("is-visible");
  });
}, { threshold: 0.12 });

document.querySelectorAll(".reveal").forEach(el => observer.observe(el));

document.getElementById("telexamForm")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;

  const name = document.getElementById("patientName").value.trim();
  const phone = document.getElementById("patientPhone")?.value.trim() || "";
  const age = document.getElementById("patientAge")?.value.trim() || "";
  const purpose = document.getElementById("patientPurpose")?.value || "";
  const duration = document.getElementById("symptomDuration")?.value.trim() || "";
  const message = document.getElementById("patientMessage").value.trim();
  const redFlags = document.getElementById("redFlags")?.checked ? "نعم - توجد علامة خطر ويُرجى الرد العاجل" : "لا";

  const text = [
    "مرحبًا عيادة د. محمود سامي، أريد طلب Telexam.",
    `الاسم: ${name}`,
    `رقم الهاتف: ${phone}`,
    `العمر/رقم الملف: ${age || "غير مذكور"}`,
    `نوع الطلب: ${purpose || "غير محدد"}`,
    `مدة الشكوى: ${duration || "غير مذكورة"}`,
    `علامات خطر: ${redFlags}`,
    `الشكوى/المتابعة: ${message}`,
    "",
    "سأرفق صور التقارير أو الروشتات في هذه المحادثة إن وجدت."
  ].join("\n");

  window.open(`https://wa.me/201005602267?text=${encodeURIComponent(text)}`, "_blank", "noopener");
});

const originalTexts = new Map();

document.querySelector(".lang-toggle")?.addEventListener("click", (event) => {
  const btn = event.currentTarget;
  const current = btn.dataset.lang;

  if (current === "en") {
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.title = translations.en.title;
    document.querySelectorAll("body *").forEach(el => {
      if (el.children.length === 0) {
        const text = el.textContent.trim();
        if (!originalTexts.has(el)) originalTexts.set(el, el.textContent);
        if (translations.en.items[text]) el.textContent = translations.en.items[text];
      }
    });
    btn.textContent = "AR";
    btn.dataset.lang = "ar";
  } else {
    document.documentElement.lang = "ar";
    document.documentElement.dir = "rtl";
    document.title = "د. محمود سامي | استشاري طب وجراحة العيون - طالبية الهرم، الجيزة";
    originalTexts.forEach((text, el) => { el.textContent = text; });
    btn.textContent = "EN";
    btn.dataset.lang = "en";
  }
});
