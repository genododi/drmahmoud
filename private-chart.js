'use strict';
const $=id=>document.getElementById(id);
const sections={patient:'بيانات المريض · Patient details',visits:'الزيارات · Visits',appointments:'المواعيد · Appointments',examinations:'الفحص الطبي · Examinations',glasses:'وصفات النظارات · Glasses',medications:'الأدوية · Medications',treatments:'الخطة العلاجية · Treatment',investigations:'الفحوصات · Investigations',reports:'التقارير · Reports',surgeries:'العمليات · Surgery',labs:'التحاليل · Laboratory',dischargeSummaries:'ملخصات الخروج · Discharge summaries',patientDocuments:'المرفقات · Documents',insuranceApprovals:'موافقات التأمين · Insurance',serviceInvoices:'الفواتير · Invoices',sampleRecords:'العينات · Samples'};
const arabic={name:'الاسم',id:'رقم الملف',dob:'تاريخ الميلاد',contact:'رقم الهاتف',age:'السن',frequency:'عدد مرات الاستخدام',dosage:'الجرعة',duration:'مدة العلاج',instructions:'تعليمات الاستخدام',followup_date:'موعد المتابعة',date:'التاريخ',notes:'ملاحظات',diagnosis:'التشخيص',selectedTests:'التحاليل المطلوبة',indication:'دواعي الطلب',allergies:'الحساسية',pd:'المسافة الحدقية'};
// Bookkeeping that is not part of the patient's medical record.
const hidden=new Set(['patientName','patientId','diseases','autoTests','createdAt','updatedAt','ageManual','clinicAdvertSmsOptIn','insuranceProviderId','insuranceCardDiscount','welcomeSmsSentAt','welcomeMessageChannel','portalWelcomePending','portalAccess','visitId']);
const glassesKey=/^(?:sph|cyl|axis|va)_(?:right|left)$|^(?:rightEye|leftEye|add_power)$/;
const STORE='emr-private-chart';

function element(tag,value,cls){const el=document.createElement(tag);el.dir='auto';if(cls)el.className=cls;if(value!=null)el.textContent=value;return el;}
function label(key){
  const en=(window.PortalPatientPdf?.fieldLabel||(k=>String(k).replace(/_/g,' ').replace(/([a-z])([A-Z])/g,'$1 $2').replace(/^./,c=>c.toUpperCase())))(key);
  return arabic[key]?`${en} · ${arabic[key]}`:en;
}
const empty=v=>v==null||v===''||(Array.isArray(v)&&!v.length)||(typeof v==='object'&&!Array.isArray(v)&&!Object.keys(v).length);
function show(key,value,record,patient){
  if(empty(value)||hidden.has(key)||key.startsWith('_'))return false;
  if(key==='insurancePolicyLevel'&&String(value).toLowerCase()==='standard')return false;
  if(key==='id'||(record===patient&&key==='name'))return false; // both shown in the page header
  return true;
}
function valueNode(key,value){
  if(typeof value==='boolean')return element('span',value?'Yes · نعم':'No · لا');
  if(typeof value==='string'&&/^data:image\/(?:png|jpeg|webp);base64,/i.test(value)){const img=element('img');img.alt=label(key);img.loading='lazy';img.src=value;return img;}
  if(typeof value==='string'&&/^data:application\/pdf;base64,/i.test(value)){const link=element('a','Download PDF · تنزيل');link.download='document.pdf';link.href=value;return link;}
  if(Array.isArray(value)){
    if(value.every(v=>typeof v!=='object')){const list=element('ul');list.className='plain';for(const v of value)list.append(element('li',String(v)));return list;}
    const box=element('div');for(const v of value){const sub=element('div',null,'nested');sub.append(fields(v,v,null));box.append(sub);}return box;
  }
  if(typeof value==='object'){const sub=element('div',null,'nested');sub.append(fields(value,value,null));return sub;}
  return element('span',String(value));
}
function fields(record,ctx,patient,skip=()=>false){
  const list=element('dl');list.className='facts';
  for(const [key,value] of Object.entries(record)){
    if(skip(key)||!show(key,value,ctx,patient))continue;
    list.append(element('dt',label(key)));
    const dd=element('dd');dd.append(valueNode(key,value));list.append(dd);
  }
  return list;
}
function glassesTable(record){
  const pick=(side,k)=>record[k+'_'+side]??record[side+'Eye']?.[k]??'';
  if(!['right','left'].some(side=>['sph','cyl','axis','va'].some(k=>!empty(pick(side,k)))))return null;
  const table=element('table');table.className='rx';
  const head=element('tr');for(const h of ['Eye · العين','SPH','CYL','AXIS','VA','ADD'])head.append(element('th',h));table.append(head);
  for(const side of ['right','left']){
    const row=element('tr');row.append(element('th',side==='right'?'Right (OD) · اليمنى':'Left (OS) · اليسرى'));
    for(const k of ['sph','cyl','axis','va'])row.append(element('td',empty(pick(side,k))?'–':String(pick(side,k))));
    row.append(element('td',empty(record.add_power)?'–':String(record.add_power)));table.append(row);
  }
  return table;
}
function chartSections(data,link){
  const target=document.createDocumentFragment();
  for(const [key,title] of Object.entries(sections)){
    const rows=key==='patient'?[data.patient]:data[key];
    if(!rows?.length)continue;
    const section=element('section',null,'card');section.append(element('h2',title));
    for(const row of rows){
      const article=element('article',null,'record');
      const when=row.date||row.date_prescribed||row.dateScheduled||row.datePerformed;
      if(key!=='patient'&&when)article.append(element('p',String(when).slice(0,10),'record-date'));
      if(key==='glasses'){const t=glassesTable(row);if(t)article.append(t);article.append(fields(row,row,data.patient,k=>glassesKey.test(k)||k==='date'));}
      else article.append(fields(row,row,data.patient,k=>key!=='patient'&&k==='date'));
      const button=element('button','Open PDF · عرض للطباعة','secondary');
      button.type='button';button.onclick=()=>window.PortalPatientPdf.preview(key,row,data.patient,link);
      article.append(button);section.append(article);
    }
    target.append(section);
  }
  return target;
}

(async()=>{
  // The key arrives in the QR link fragment (never sent to a server). Keep it
  // for this browser tab only, so a reload or returning from the PDF viewer
  // stays signed in; closing the chart or the tab forgets it.
  let credential=location.hash.slice(1);
  try{if(credential)sessionStorage.setItem(STORE,credential);else credential=sessionStorage.getItem(STORE)||'';}catch{}
  history.replaceState(null,'',location.pathname);
  $('close').onclick=()=>{try{sessionStorage.removeItem(STORE);}catch{}location.replace('./portal.html');};
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
    $('name').textContent=chart.patient.name;
    $('file-id').textContent='File · رقم الملف: '+chart.patient.id;
    $('status').hidden=true;
    $('close').hidden=false;
  } catch {
    try{sessionStorage.removeItem(STORE);}catch{}
    $('status').textContent='Unable to open this chart. Scan the original private QR again. · تعذر فتح الملف. يرجى مسح الرمز الأصلي مرة أخرى.';
    $('status').className='notice error';
  }
})();
