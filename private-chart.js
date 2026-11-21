'use strict';
const $=id=>document.getElementById(id);
const sections={patient:'بيانات المريض · Patient details',visits:'الزيارات · Visits',appointments:'المواعيد · Appointments',examinations:'الفحص الطبي · Examinations',glasses:'وصفات النظارات · Glasses',medications:'الأدوية · Medications',treatments:'الخطة العلاجية · Treatment',investigations:'الفحوصات · Investigations',reports:'التقارير · Reports',surgeries:'العمليات · Surgery',labs:'التحاليل · Laboratory',dischargeSummaries:'ملخصات الخروج · Discharge summaries',patientDocuments:'المرفقات · Documents',insuranceApprovals:'موافقات التأمين · Insurance',serviceInvoices:'الفواتير · Invoices',sampleRecords:'العينات · Samples'};
const labels={name:'الاسم',id:'رقم الملف',dob:'تاريخ الميلاد',contact:'رقم الهاتف',frequency:'عدد مرات الاستخدام',dosage:'الجرعة',duration:'مدة العلاج',instructions:'تعليمات الاستخدام',followup_date:'موعد المتابعة'};
function element(tag,value){const el=document.createElement(tag);el.dir='auto';if(value!=null)el.textContent=value;return el;}
function fields(obj,parent){
  for(const [key,value] of Object.entries(obj)){
    if(value==null || value==='' || ['patientName','patientId','diseases','autoTests'].includes(key))continue;
    const row=element('div');row.className='portal-field';
    if(!Array.isArray(obj))row.append(element('strong',(labels[key]||key.replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2'))+' '));
    if(typeof value==='object')fields(value,row);
    else if(typeof value==='string' && /^data:image\/(?:png|jpeg|webp);base64,/i.test(value)){const img=element('img');img.alt=key;img.loading='lazy';img.src=value;row.append(img);}
    else if(typeof value==='string' && /^data:application\/pdf;base64,/i.test(value)){const link=element('a','Download PDF · تنزيل');link.download='document.pdf';link.href=value;row.append(link);}
    else row.append(element('span',String(value)));
    parent.append(row);
  }
}
function chartSections(data,link){
  const target=document.createDocumentFragment();
  for(const [key,title] of Object.entries(sections)){
    const rows=key==='patient'?[data.patient]:data[key];
    if(!rows?.length)continue;
    const section=element('section');section.className='card';section.append(element('h3',title));
    for(const row of rows){const article=element('article');article.className='record';fields(row,article);const button=element('button','Open PDF · عرض للطباعة');button.onclick=()=>window.PortalPatientPdf.preview(key,row,data.patient,link);article.append(button);section.append(article);}
    target.append(section);
  }
  return target;
}

(async()=>{
  const credential=location.hash.slice(1);
  history.replaceState(null,'',location.pathname);
  $('close').onclick=()=>location.replace('./portal.html');
  try {
    const match=/^([\w-]{24})\.([\w-]{43})$/.exec(credential);
    if(!match)throw Error();
    const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
    const key=await crypto.subtle.importKey('raw',bytes(match[2]),{name:'AES-GCM'},false,['decrypt']);
    const response=await fetch('./sealed-charts/'+match[1]+'.bin',{cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer'});
    if(!response.ok)throw Error();
    const file=bytes(await response.text());
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:file.slice(0,12)},key,file.slice(12));
    const chart=JSON.parse(new TextDecoder().decode(plain));
    const link=location.origin+location.pathname+'#'+credential;
    $('records').replaceChildren(chartSections(chart,link));
    $('chart-pdf').hidden=false;
    $('chart-pdf').onclick=()=>window.PortalPatientPdf.preview('chart',chart,chart.patient,link);
    $('name').textContent=chart.patient.name+' · '+chart.patient.id;
    $('status').hidden=true;
    $('close').hidden=false;
  } catch {
    $('status').textContent='Unable to open this chart. Scan the original private QR again. · تعذر فتح الملف. يرجى مسح الرمز الأصلي مرة أخرى.';
  }
})();
