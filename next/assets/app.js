(() => {
  'use strict';

  const CFG = window.__DEMEDICO_CONFIG__;
  const DIAL = window.__DEMEDICO_DIAL__ || {};
  const LOGO = window.__DEMEDICO_LOGO__;
  const root = document.body;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const nowIso = () => new Date().toISOString();
  const fmtDate = (v) => v ? new Date(v).toLocaleDateString('fr-FR') : '—';
  const fmtDateTime = (v) => v ? new Date(v).toLocaleString('fr-FR',{dateStyle:'short',timeStyle:'short'}) : '—';
  const startOfWeek = (d = new Date()) => { const x = new Date(d); x.setHours(0,0,0,0); x.setDate(x.getDate()-((x.getDay()+6)%7)); return x; };
  const initials = (p) => `${p?.first_name?.[0] || ''}${p?.last_name?.[0] || ''}`.toUpperCase() || '?';
  const KEEP_LEADING_ZERO = new Set(['IT','SM','VA']);
  const countryNames = typeof Intl.DisplayNames === 'function' ? new Intl.DisplayNames(['fr'], {type:'region'}) : null;
  const countryLabel = (iso) => `${countryNames?.of(iso) || iso} (+${DIAL[iso]})`;
  const countryOptions = (selected='FR') => Object.keys(DIAL).sort((a,b)=>countryLabel(a).localeCompare(countryLabel(b),'fr')).map(iso=>`<option value="${iso}" ${iso===selected?'selected':''}>${esc(countryLabel(iso))}</option>`).join('');
  function normalizePhone(raw,country='FR'){
    const input=String(raw||'').trim(); if(!input)return '';
    let digits=input.replace(/[^\d+]/g,'');
    if(digits.indexOf('+')>0) digits=digits.replace(/\+/g,'');
    let e164;
    if(digits.startsWith('+')) e164='+'+digits.slice(1).replace(/\D/g,'');
    else if(digits.startsWith('00')) e164='+'+digits.slice(2).replace(/\D/g,'');
    else { const iso=DIAL[String(country||'').toUpperCase()]?String(country).toUpperCase():'FR'; let national=digits.replace(/\D/g,''); if(national.startsWith('0')&&!KEEP_LEADING_ZERO.has(iso)) national=national.slice(1); e164='+'+DIAL[iso]+national; }
    const n=e164.length-1; if(n<7||n>15) throw new Error(`Numéro de téléphone invalide : « ${input} ». Vérifie le pays et le numéro.`); return e164;
  }
  const channelLabel=(c)=>({EMAIL:'Email',WHATSAPP:'WhatsApp',SMS:'SMS'}[c]||c);
  const statusLabel=(s)=>({SENT:'Envoyé',FAILED:'Échec',OPENED:'Ouvert',PREPARED:'Préparé'}[s]||s);
  const COMM_TEMPLATES={
    REMINDER:{label:'Rappel de rendez-vous',subject:'Rappel de votre rendez-vous',body:'Bonjour {prenom},\n\nPetit rappel : votre rendez-vous au {cabinet} est prévu le {date} à {heure}.\n\nEn cas d’empêchement, merci de nous prévenir.\n\n{signature}',needsAppt:true},
    CONFIRM:{label:'Confirmation de rendez-vous',subject:'Confirmation de votre rendez-vous',body:'Bonjour {prenom},\n\nVotre rendez-vous du {date} à {heure} est bien confirmé.\n\nÀ bientôt,\n{signature}',needsAppt:true},
    MOVED:{label:'Changement d’horaire',subject:'Changement d’horaire de votre rendez-vous',body:'Bonjour {prenom},\n\nVotre rendez-vous est désormais prévu le {date} à {heure}.\n\nMerci de nous confirmer que cet horaire vous convient.\n\n{signature}',needsAppt:true},
    CANCEL:{label:'Annulation',subject:'Annulation de votre rendez-vous',body:'Bonjour {prenom},\n\nNous sommes contraints d’annuler votre rendez-vous. Nous vous recontactons pour en fixer un nouveau.\n\nToutes nos excuses,\n{signature}'},
    AFTER:{label:'Suite à la séance',subject:'Suite à votre séance',body:'Bonjour {prenom},\n\nMerci pour votre venue. Comme convenu, n’hésitez pas à revenir vers nous si vous avez une question.\n\n{signature}'},
    FREE:{label:'Message libre',subject:'',body:'Bonjour {prenom},\n\n\n\n{signature}'}
  };

  const PLAN_CATALOG = Object.freeze({
    FREE:{id:'FREE',label:'Free',price:0,annual:0,users:1,patients:20,appointments:30,description:'Pour découvrir Demédico sereinement.',features:['Agenda, fiches patients et tâches','Tableau de bord essentiel']},
    STARTER:{id:'STARTER',label:'Starter',price:4.90,annual:49,users:1,patients:150,appointments:null,description:'Pour les praticiens indépendants.',features:['Consultations et notes cliniques','Statistiques simples','150 patients actifs']},
    PRO:{id:'PRO',label:'Pro',price:9.90,annual:99,users:2,patients:null,appointments:null,description:'L’offre la plus complète pour développer ton activité.',features:['Patients illimités','Statistiques complètes','Google Agenda et Outlook','Support prioritaire'],recommended:true,founderPrice:6.90},
    CABINET_PLUS:{id:'CABINET_PLUS',label:'Cabinet',price:19.90,annual:199,users:5,patients:null,appointments:null,description:'Pour les cabinets et les équipes.',features:['5 utilisateurs inclus','Gestion des rôles et secrétariat','Plusieurs agendas','Statistiques du cabinet'],extraUserPrice:3.90}
  });
  const INTEGRATION_CATALOG = Object.freeze([
    {id:'google_workspace',short:'G',name:'Google Agenda',category:'CALENDAR',state:'SERVER_REQUIRED',sync:'Demédico ↔ Google Agenda',caps:['Calendar','Auto 15 min','Privé'],description:'Tes rendez-vous dans ton agenda Google, avec intitulés neutres et événements privés.',requirement:'OAuth serveur + synchronisation sécurisée. L’ancienne version Apps Script le faisait déjà ; Next doit utiliser une Edge Function ou un backend dédié.'},
    {id:'microsoft_365',short:'M',name:'Microsoft 365 / Outlook',category:'CALENDAR',state:'SERVER_REQUIRED',sync:'Demédico ↔ Outlook',caps:['Outlook Calendar','Graph','Auto 15 min'],description:'Tes rendez-vous dans ton agenda Outlook, avec gestion des conflits.',requirement:'OAuth Microsoft Graph côté serveur. Aucun secret ne doit être placé dans GitHub Pages.'},
    {id:'planity',short:'PL',name:'Planity',category:'BOOKING',state:'PARTNER',sync:'Accès à confirmer',caps:['Réservation','Widget','Agenda'],description:'Connecteur prévu selon les capacités réellement ouvertes au compte professionnel.',requirement:'Accès partenaire ou API officiellement disponible requis.'},
    {id:'phorest',short:'PH',name:'Phorest',category:'BUSINESS',state:'PARTNER',sync:'API',caps:['Clients','Agenda','Réservations'],description:'Connexion métier envisageable pour les structures qui utilisent Phorest.',requirement:'Clés/API partenaire nécessaires.'},
    {id:'pabau',short:'PB',name:'Pabau',category:'BUSINESS',state:'PARTNER',sync:'API',caps:['Patients','Agenda','CRM'],description:'Connexion possible via API selon le contrat et les droits du cabinet.',requirement:'Accès API requis.'},
    {id:'ics',short:'ICS',name:'ICS / Calendrier générique',category:'STANDARD',state:'PLANNED',sync:'Import / export',caps:['ICS','1 sens','Interopérable'],description:'Import ou export d’indisponibilités via le standard iCalendar.',requirement:'Le moteur d’import serveur n’est pas encore activé dans Next.'}
  ]);

  const S = {
    sb:null,user:null,member:null,org:null,route:'dashboard',patientId:null,patientTab:'overview',
    patients:[],appointments:[],tasks:[],members:[],profiles:{},subscription:null,usage:null,commSettings:null,planRequests:[],
    weekStart:startOfWeek(), perf:[]
  };

  function toast(msg, type='') {
    let box = $('#toasts');
    if (!box) { box = document.createElement('div'); box.id='toasts'; box.className='toasts'; document.body.appendChild(box); }
    const d = document.createElement('div'); d.className=`toast ${type}`; d.textContent=msg; box.appendChild(d); setTimeout(()=>d.remove(),4200);
  }
  function fail(err) { console.error(err); toast(frErr(err),'error'); }
  function frErr(e) {
    const m = e?.message || e?.error_description || String(e || 'Erreur inconnue');
    if (/Invalid login credentials/i.test(m)) return 'Email ou mot de passe incorrect.';
    if (/row-level security/i.test(m)) return 'Action refusée par les règles de sécurité.';
    if (/patients_phone_e164_check/i.test(m)) return 'Numéro de téléphone invalide.';
    if (/duplicate key/i.test(m)) return 'Cette donnée existe déjà.';
    return m;
  }
  async function timed(label, fn) {
    const t0 = performance.now();
    try { return await fn(); }
    finally { S.perf.unshift({label,ms:Math.round(performance.now()-t0),at:new Date()}); S.perf=S.perf.slice(0,40); }
  }
  async function ensureSupabase() {
    if (window.supabase?.createClient) return;
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
      s.onload=resolve; s.onerror=()=>reject(new Error('Bibliothèque Supabase indisponible.'));
      document.head.appendChild(s);
    });
  }

  const roleLabel = (r) => ({OWNER:'Propriétaire',ADMIN:'Administrateur',PRACTITIONER:'Praticien',ASSISTANT:'Secrétariat',READ_ONLY:'Lecture seule'}[r] || r);
  const isClinical = () => ['OWNER','ADMIN','PRACTITIONER'].includes(S.member?.role);
  const isAdmin = () => ['OWNER','ADMIN'].includes(S.member?.role);

  const NAV_ICONS={
    dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 10.8 12 3l9 7.8v9.2a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
    agenda:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/></svg>',
    patients:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    tasks:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
    stats:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
    integrations:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 12h6M12 9v6"/><path d="M7 3v4M17 3v4M5 7h14v4a7 7 0 0 1-14 0z"/></svg>',
    subscription:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m3 7 4 4 5-7 5 7 4-4-2 13H5z"/></svg>',
    settings:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.1A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.1A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.28.35.48.76.6 1 .12.35.1.73.1 1.1v1.8c0 .37.02.75-.1 1.1-.12.24-.32.65-.6 1z"/></svg>',
    diagnostic:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 12h4l2-7 4 14 2-7h6"/></svg>'
  };
  const ROUTE_META={dashboard:['Accueil','Votre journée, en un coup d’œil.'],agenda:['Agenda','Planifier sans perdre le contexte patient.'],patients:['Patients','Une vue 360° claire, sans jargon CRM.'],patient:['Patients','Dossier patient et suivi clinique.'],tasks:['Tâches','Les prochaines actions, pas une liste oubliée.'],stats:['Statistiques','Des indicateurs utiles au cabinet.'],integrations:['Intégrations','Connecter Demédico sans perdre la maîtrise des données.'],subscription:['Abonnement','Ton offre, ton utilisation et les formules disponibles.'],settings:['Paramètres','Cabinet, communications et équipe.'],diagnostic:['Diagnostic','Performance réelle de Supabase.']};
  function appShell() {
    root.innerHTML = `
      <div id="toasts" class="toasts"></div>
      <div class="shell">
        <aside class="sidebar" id="sidebar">
          <div class="brand"><img src="${LOGO}" alt="Demédico"></div>
          <nav class="nav" id="nav">
            ${navButton('dashboard','Accueil')}
            ${navButton('agenda','Agenda')}
            ${navButton('patients','Patients')}
            ${navButton('tasks','Tâches')}
            ${navButton('stats','Statistiques')}
            ${navButton('integrations','Intégrations')}
            ${navButton('subscription','Abonnement')}
            ${navButton('settings','Paramètres')}
            ${navButton('diagnostic','Diagnostic')}
          </nav>
          <div class="sidebar-spacer"></div>
          <div class="version-label">DEMÉDICO · SUPABASE</div>
          <button class="plan-side-card" data-route="subscription">
            <span><strong>Demédico ${esc(planLabel(S.subscription?.plan_id))}</strong><small>${esc(subscriptionStatusLabel(S.subscription?.status))}</small></span>
            <span class="plan-arrow">›</span>
          </button>
          <div class="user-card"><strong>${esc(S.user.email)}</strong><span class="meta">${esc(roleLabel(S.member.role))} · ${esc(S.org.name)}</span><button class="link" id="logoutBtn">Se déconnecter</button></div>
          <div class="side-card"><div class="eyebrow">Action rapide</div><p>Crée un rendez-vous sans quitter l’écran en cours.</p><button class="btn primary" id="sideQuickAppt">+ Rendez-vous</button></div>
        </aside>
        <div class="content">
          <header class="topbar">
            <button class="icon-btn mobile-menu" id="menuBtn" aria-label="Menu">☰</button>
            <div class="mobile-brand"><img src="${LOGO}" alt="Demédico"></div>
            <div class="topbar-left"><h1 id="topbarTitle">Accueil</h1><p id="topbarSubtitle">Votre journée, en un coup d’œil.</p></div>
            <div class="top-actions"><div class="global-search"><span class="search-icon">⌕</span><input id="globalSearch" placeholder="Rechercher un patient…"><span class="kbd">⌘K</span></div><button class="btn primary" id="topNewPatient">+ Nouveau patient</button></div>
          </header>
          <main class="page" id="page"></main>
        </div>
      </div>
      <div id="modalRoot"></div>`;
    $('#logoutBtn').onclick = async()=>{await S.sb.auth.signOut(); location.reload();};
    $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
    $('#nav').onclick=(e)=>{const b=e.target.closest('[data-route]');if(!b)return;go(b.dataset.route);$('#sidebar').classList.remove('open');};
    $('#sideQuickAppt').onclick=()=>openAppointmentModal();
    $('#topNewPatient').onclick=()=>openPatientModal();
    const gs=$('#globalSearch');
    gs.oninput=()=>{const q=gs.value.trim().toLowerCase();if(!q)return;go('patients');setTimeout(()=>{const ps=$('#patientSearch');if(ps){ps.value=q;ps.dispatchEvent(new Event('input'));}},0);};
    document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();gs.focus();}});
    updateTopbar();
  }
  function navButton(route,label){ return `<button data-route="${route}"><span class="nav-ico">${NAV_ICONS[route]||''}</span><span>${label}</span></button>`; }
  function updateTopbar(){const m=ROUTE_META[S.route]||ROUTE_META.dashboard; const t=$('#topbarTitle'),s=$('#topbarSubtitle');if(t)t.textContent=m[0];if(s)s.textContent=m[1];}
  function markNav(){ $$('#nav [data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===S.route || (S.route==='patient'&&b.dataset.route==='patients'))); updateTopbar(); }
  function go(route, opts={}){ S.route=route; if(opts.patientId!==undefined) S.patientId=opts.patientId; if(opts.patientTab) S.patientTab=opts.patientTab; markNav(); render(); window.scrollTo({top:0,behavior:'instant'}); }

  function authView(message='') {
    root.innerHTML=`<section class="auth"><div class="auth-card"><img class="logo" src="${LOGO}" alt="Demédico"><div><span class="eyebrow">Cabinet OS · Supabase</span><h1>Connexion</h1><p class="muted">Retrouve ton cabinet, sans Apps Script.</p></div>${message?`<p class="danger-text">${esc(message)}</p>`:''}<form id="loginForm" class="grid"><div class="field"><label>Email</label><input id="email" type="email" autocomplete="username" required></div><div class="field"><label>Mot de passe</label><input id="password" type="password" autocomplete="current-password" required></div><button class="btn primary" type="submit">Se connecter</button></form><button class="link" id="forgotBtn">Mot de passe oublié ?</button><p class="tiny muted">Cette version utilise uniquement des données fictives tant qu’un hébergement HDS n’est pas en place.</p></div></section><div id="toasts" class="toasts"></div>`;
    $('#loginForm').onsubmit=async(e)=>{e.preventDefault();const btn=$('button[type=submit]',e.target);btn.disabled=true;try{const {error}=await timed('Connexion',()=>S.sb.auth.signInWithPassword({email:$('#email').value.trim(),password:$('#password').value}));if(error)throw error;await boot();}catch(err){fail(err)}finally{btn.disabled=false;}};
    $('#forgotBtn').onclick=async()=>{const email=$('#email').value.trim();if(!email)return toast('Entre ton email d’abord.','error');const {error}=await S.sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});toast(error?frErr(error):'Email de réinitialisation envoyé.',error?'error':'');};
  }

  async function boot(){
    try{
      await ensureSupabase();
      if(!S.sb) S.sb=window.supabase.createClient(CFG.url,CFG.publishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      const {data:{session}}=await S.sb.auth.getSession();
      if(!session) return authView();
      S.user=session.user;
      const {data,error}=await timed('Cabinet et rôle',()=>S.sb.from('organization_members').select('organization_id,role,active,organizations(name,profession_template_key,timezone)').eq('user_id',S.user.id).eq('active',true).limit(1));
      if(error) throw error; if(!data?.length) return authView('Ce compte n’est rattaché à aucun cabinet.');
      S.member=data[0]; S.org={id:data[0].organization_id,...(data[0].organizations||{})};
      await Promise.all([loadPatients(),loadAppointments(),loadTasks(),loadMembers(),loadSubscription(),loadCommSettings(),loadPlanRequests()]);
      appShell(); render();
    }catch(e){console.error(e);authView(frErr(e));}
  }

  async function loadPatients(){const {data,error}=await timed('Patients',()=>S.sb.from('patients').select('*').eq('organization_id',S.org.id).is('archived_at',null).order('last_name'));if(error)throw error;S.patients=data||[];}
  async function loadAppointments(){const from=new Date();from.setMonth(from.getMonth()-3);const to=new Date();to.setMonth(to.getMonth()+6);const {data,error}=await timed('Agenda',()=>S.sb.from('appointments').select('*').eq('organization_id',S.org.id).gte('starts_at',from.toISOString()).lte('starts_at',to.toISOString()).order('starts_at'));if(error)throw error;S.appointments=data||[];}
  async function loadTasks(){const {data,error}=await timed('Tâches',()=>S.sb.from('tasks').select('*').eq('organization_id',S.org.id).order('created_at',{ascending:false}).limit(200));if(error)throw error;S.tasks=data||[];}
  async function loadMembers(){const {data,error}=await timed('Équipe',()=>S.sb.from('organization_members').select('user_id,role,active').eq('organization_id',S.org.id).order('created_at'));if(error)throw error;S.members=data||[];const ids=S.members.map(m=>m.user_id);if(ids.length){const {data:p}=await S.sb.from('profiles').select('id,display_name').in('id',ids);S.profiles=Object.fromEntries((p||[]).map(x=>[x.id,x]));}}
  async function loadSubscription(){const [{data:s},{data:u}]=await Promise.all([S.sb.from('subscriptions').select('*').eq('organization_id',S.org.id).maybeSingle(),S.sb.from('usage_counters').select('*').eq('organization_id',S.org.id).maybeSingle()]);S.subscription=s||null;S.usage=u||null;}
  async function loadPlanRequests(){
    if(!isAdmin()){S.planRequests=[];return;}
    const {data,error}=await S.sb.from('subscription_change_requests').select('*').eq('organization_id',S.org.id).order('created_at',{ascending:false}).limit(10);
    if(error){ if(/subscription_change_requests/i.test(error.message||'')){console.warn('Migration 008 missing',error);S.planRequests=[];return;} throw error; }
    S.planRequests=data||[];
  }
  async function loadCommSettings(){
    const defaults={sender_name:S.org?.name||'Votre cabinet',reply_to:'',default_country:'FR',pro_phone:'',signature:'',email_enabled:true,whatsapp_enabled:true,sms_enabled:true};
    const {data,error}=await S.sb.from('organization_communication_settings').select('*').eq('organization_id',S.org.id).maybeSingle();
    if(error){ console.warn('Communication settings unavailable',error); S.commSettings={...defaults,_migrationMissing:true}; return; }
    S.commSettings={...defaults,...(data||{})};
  }

  function render(){markNav(); const p=$('#page'); if(!p)return; ({dashboard:renderDashboard,patients:renderPatients,patient:renderPatient,agenda:renderAgenda,tasks:renderTasks,stats:renderStats,integrations:renderIntegrations,subscription:renderSubscription,settings:renderSettings,diagnostic:renderDiagnostic}[S.route]||renderDashboard)();}
  function pageHead(title,sub,actions=''){return `<div class="page-head"><div><h1>${esc(title)}</h1><p class="muted">${esc(sub)}</p></div>${actions?`<div class="actions">${actions}</div>`:''}</div>`;}
  function patientName(id){const p=S.patients.find(x=>x.id===id);return p?`${p.first_name} ${p.last_name}`:'Patient';}
  function patientById(id){return S.patients.find(x=>x.id===id);}
  function planLabel(id){return PLAN_CATALOG[id]?.label||PLAN_CATALOG.FREE.label;}
  function subscriptionStatusLabel(s){return ({FREE:'Actif',TRIALING:'Essai',ACTIVE:'Actif',PAST_DUE:'Paiement à régulariser',CANCELED:'Résilié',SUSPENDED:'Suspendu'}[s]||'Actif');}
  function euro(v){return Number(v||0).toLocaleString('fr-FR',{minimumFractionDigits:Number(v)%1?2:0,maximumFractionDigits:2})+' €';}
  function usagePct(used,limit){if(limit===null||!Number.isFinite(Number(limit)))return 100; return Math.max(0,Math.min(100,Math.round(Number(used||0)/Math.max(1,Number(limit))*100)));}
  function integrationStatus(i){return i.state==='PARTNER'?['Accès partenaire','partner']:i.state==='SERVER_REQUIRED'?['Backend sécurisé requis','warn']:['Prévu',''];}

  function renderDashboard(){
    const today=new Date(); const day=today.toISOString().slice(0,10); const todayA=S.appointments.filter(a=>a.starts_at.slice(0,10)===day && a.status!=='CANCELLED'); const open=S.tasks.filter(t=>t.status!=='DONE'); const next=[...S.appointments].filter(a=>new Date(a.starts_at)>=today&&a.status!=='CANCELLED').sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)); const first=next[0];
    $('#page').innerHTML=`<div class="hero"><article class="hero-card"><div class="hero-kicker">${today.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'}).toUpperCase()}</div><h2>Bonjour.</h2><p>Demédico fait remonter la bonne information au bon moment, sans transformer le praticien en opérateur de logiciel.</p><div class="hero-actions"><button class="btn" id="quickAppt">Nouveau rendez-vous</button><button class="btn" id="quickPatient">Voir les patients</button></div></article><aside class="next-card"><div class="card-head"><div class="eyebrow">Prochaine consultation</div><span class="status-dot"></span></div>${first?`<div class="next-time">${new Date(first.starts_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div><div class="next-name">${esc(patientName(first.patient_id))}</div><div class="next-meta">${esc(first.appointment_type||'Consultation')} · ${fmtDate(first.starts_at)}</div><div class="next-foot"><span class="badge">${esc(first.location||'Cabinet')}</span><button class="btn sm primary" data-patient="${first.patient_id}">Dossier</button></div>`:'<div class="empty"><div><strong>Aucune consultation à venir</strong><p>Ajoute un rendez-vous pour commencer à piloter la journée.</p></div></div>'}</aside></div>
      <div class="grid grid4 metrics"><div class="card stat"><div class="metric-icon">▣</div><div class="metric-badge">Aujourd’hui</div><div class="value">${todayA.length}</div><div class="label">consultations planifiées</div></div><div class="card stat"><div class="metric-icon">◎</div><div class="metric-badge">Base active</div><div class="value">${S.patients.length}</div><div class="label">patients actifs</div></div><div class="card stat"><div class="metric-icon">✓</div><div class="metric-badge">À traiter</div><div class="value">${open.length}</div><div class="label">tâches ouvertes</div></div><div class="card stat"><div class="metric-icon">↗</div><div class="metric-badge">Offre</div><div class="value value-plan">${esc(S.subscription?.plan_id||'FREE')}</div><div class="label">${esc(S.subscription?.status||'active')}</div></div></div>
      <div class="grid grid2 dashboard-lower"><section class="card"><div class="card-head"><div><h2>Programme du jour</h2><p class="sub muted">Ce qui mérite ton attention aujourd’hui.</p></div><button class="btn sm" data-go="agenda">Agenda complet</button></div><div class="list">${todayA.length?todayA.map(a=>`<div class="schedule-row"><div class="schedule-time">${new Date(a.starts_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</div><span class="schedule-bar"></span><div class="grow"><strong>${esc(patientName(a.patient_id))}</strong><div class="meta">${esc(a.appointment_type||'Consultation')} · ${esc(a.location||'Cabinet')}</div></div><span class="badge">${esc(a.status)}</span></div>`).join(''):'<div class="empty"><div><strong>Journée libre</strong><p>Aucun rendez-vous enregistré aujourd’hui.</p></div></div>'}</div></section><section class="card"><div class="card-head"><div><h2>À faire</h2><p class="sub muted">Actions cliniques et administratives.</p></div><button class="icon-btn" id="dashAddTask">+</button></div><div class="list">${open.slice(0,5).map(t=>`<div class="task-row"><span class="task-check">✓</span><div class="grow"><strong>${esc(t.title)}</strong><div class="meta">${t.patient_id?esc(patientName(t.patient_id))+' · ':''}${t.due_at?fmtDateTime(t.due_at):'Sans échéance'}</div></div><span class="badge ${t.priority==='HIGH'?'warn':''}">${esc(t.priority)}</span></div>`).join('')||'<div class="empty">Rien à traiter.</div>'}</div></section></div>`;
    $$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go)); $('#quickPatient').onclick=()=>go('patients'); $('#quickAppt').onclick=()=>openAppointmentModal(); if($('#dashAddTask'))$('#dashAddTask').onclick=()=>openTaskModal(); $$('[data-patient]').forEach(b=>b.onclick=()=>go('patient',{patientId:b.dataset.patient,patientTab:'overview'}));
  }


  function renderPatients(){
    $('#page').innerHTML=pageHead('Patients','Recherche, dossier clinique, objectifs, mesures et historique.',`<button class="btn primary" id="addPatient">+ Nouveau patient</button>`)+`<section class="card"><div class="toolbar"><div class="search"><input id="patientSearch" placeholder="Rechercher un nom, téléphone, email…"></div><span class="badge brand">${S.patients.length} patient(s)</span></div><div class="list" id="patientList"></div></section>`;
    const draw=()=>{const q=$('#patientSearch').value.toLowerCase().trim();const list=S.patients.filter(p=>`${p.first_name} ${p.last_name} ${p.phone||''} ${p.email||''}`.toLowerCase().includes(q));$('#patientList').innerHTML=list.map(p=>`<div class="row-item clickable" data-pid="${p.id}"><div class="avatar">${esc(initials(p))}</div><div class="grow"><strong>${esc(p.first_name)} ${esc(p.last_name)}</strong><div class="meta">${esc([p.phone,p.email].filter(Boolean).join(' · ')||'Aucune coordonnée')}</div></div><span class="badge">Ouvrir</span></div>`).join('')||'<div class="empty">Aucun patient trouvé.</div>'; $$('[data-pid]').forEach(x=>x.onclick=()=>go('patient',{patientId:x.dataset.pid,patientTab:'overview'}));};
    draw();$('#patientSearch').oninput=draw;$('#addPatient').onclick=()=>openPatientModal();
  }

  async function renderPatient(){
    const p=patientById(S.patientId); if(!p)return go('patients');
    $('#page').innerHTML=`<div class="page-head"><div class="patient-head"><button class="btn sm" id="backPatients">←</button><div class="avatar">${esc(initials(p))}</div><div><h1>${esc(p.first_name)} ${esc(p.last_name)}</h1><p class="muted">${esc([p.phone,p.email,fmtDate(p.birth_date)].filter(Boolean).join(' · '))}</p></div></div><div class="actions"><button class="btn" id="editPatient">Modifier</button><button class="btn" id="contactPatient">💬 Contacter</button><button class="btn primary" id="patientAppt">+ Rendez-vous</button></div></div>
      <div class="tabs" id="patientTabs">${['overview','clinical','goals','consultations','appointments','messages'].map(t=>`<button data-tab="${t}" class="${S.patientTab===t?'active':''}">${({overview:'Aperçu',clinical:'Dossier',goals:'Objectifs & mesures',consultations:'Séances',appointments:'Rendez-vous',messages:'Messages'})[t]}</button>`).join('')}</div><div id="patientBody"><div class="empty">Chargement…</div></div>`;
    $('#backPatients').onclick=()=>go('patients'); $('#editPatient').onclick=()=>openPatientModal(p); $('#contactPatient').onclick=()=>{S.patientTab='messages';renderPatient();}; $('#patientAppt').onclick=()=>openAppointmentModal(p.id); $$('#patientTabs button').forEach(b=>b.onclick=()=>{S.patientTab=b.dataset.tab;renderPatient();});
    try { await renderPatientTab(p); } catch(e){ $('#patientBody').innerHTML=`<div class="card"><p class="danger-text">${esc(frErr(e))}</p></div>`; }
  }

  async function patientBundle(p){
    const clinical = isClinical() ? await S.sb.from('clinical_profiles').select('*').eq('organization_id',S.org.id).eq('patient_id',p.id).maybeSingle() : {data:null};
    const [alerts,goals,defs,vals,consults,comms] = await Promise.all([
      S.sb.from('patient_alerts').select('*').eq('organization_id',S.org.id).eq('patient_id',p.id).eq('active',true).order('created_at',{ascending:false}),
      isClinical()?S.sb.from('goals').select('*').eq('organization_id',S.org.id).eq('patient_id',p.id).order('created_at',{ascending:false}):Promise.resolve({data:[]}),
      isClinical()?S.sb.from('measure_definitions').select('*').eq('organization_id',S.org.id).eq('active',true).order('name'):Promise.resolve({data:[]}),
      isClinical()?S.sb.from('measure_values').select('*').eq('organization_id',S.org.id).eq('patient_id',p.id).order('measured_at',{ascending:false}):Promise.resolve({data:[]}),
      isClinical()?S.sb.from('consultations').select('*').eq('organization_id',S.org.id).eq('patient_id',p.id).order('occurred_at',{ascending:false}).limit(50):Promise.resolve({data:[]}),
      S.sb.from('communications').select('*').eq('organization_id',S.org.id).eq('patient_id',p.id).order('created_at',{ascending:false}).limit(50)
    ]);
    return {clinical:clinical.data,alerts:alerts.data||[],goals:goals.data||[],defs:defs.data||[],vals:vals.data||[],consults:consults.data||[],comms:comms.data||[]};
  }

  async function renderPatientTab(p){
    const b=await patientBundle(p); const body=$('#patientBody');
    if(S.patientTab==='overview'){
      const next=S.appointments.filter(a=>a.patient_id===p.id&&new Date(a.starts_at)>=new Date()&&a.status!=='CANCELLED').sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0];
      const last=b.consults[0]; const openGoal=b.goals.find(g=>g.status==='ACTIVE');
      body.innerHTML=`<div class="grid grid2"><section class="card"><div class="card-head"><h2>Prochaine séance</h2>${next?'<span class="badge ok">Planifiée</span>':'<span class="badge">Aucune date</span>'}</div>${next?`<div class="kpi">${fmtDateTime(next.starts_at)}</div><p class="muted">${esc(next.appointment_type||'Rendez-vous')}</p>`:'<div class="empty">Aucun rendez-vous futur.</div>'}<div class="divider"></div><div class="metric-line"><span>Motif</span><strong>${esc(b.clinical?.motive||p.important_info||'—')}</strong></div><div class="metric-line"><span>Objectif principal</span><strong>${esc(openGoal?.title||'—')}</strong></div>${openGoal?`<div class="progress"><span style="width:${openGoal.progress}%"></span></div>`:''}<div class="metric-line"><span>Dernière séance</span><strong>${last?fmtDateTime(last.occurred_at):'—'}</strong></div></section><section class="card"><div class="card-head"><h2>Alertes</h2>${isClinical()?'<button class="btn sm" id="addAlert">+ Ajouter</button>':''}</div><div class="list">${b.alerts.map(a=>`<div class="row-item alert-card ${a.severity==='HIGH'?'high':''}"><div class="grow"><strong>${esc(a.label)}</strong><span class="meta">${esc(a.severity)}</span></div></div>`).join('')||'<div class="empty">Aucune alerte active.</div>'}</div></section></div><section class="card" style="margin-top:16px"><div class="card-head"><h2>Chronologie</h2></div><div class="timeline">${timelineRows(p,b).join('')||'<div class="empty">Aucun événement.</div>'}</div></section>`;
      if($('#addAlert'))$('#addAlert').onclick=()=>openAlertModal(p);
    }
    if(S.patientTab==='clinical'){
      if(!isClinical()){body.innerHTML='<div class="card"><h2>Dossier clinique protégé</h2><p class="muted">Le rôle Secrétariat n’a pas accès aux données cliniques. La restriction est appliquée par Supabase RLS.</p></div>';return;}
      const c=b.clinical||{}; body.innerHTML=`<section class="card"><div class="card-head"><div><h2>Dossier clinique</h2><p class="sub muted">Anamnèse et informations utiles au suivi.</p></div></div><form id="clinicalForm" class="form-grid">${ta('Motif','motive',c.motive)}${ta('Anamnèse','anamnesis',c.anamnesis)}${ta('Antécédents','history',c.history)}${ta('Traitements','treatments',c.treatments)}${ta('Allergies','allergies',c.allergies)}${ta('Mode de vie','lifestyle',c.lifestyle)}<div class="field"><label>Séances prescrites</label><input name="prescribed_sessions" type="number" min="1" max="200" value="${esc(c.prescribed_sessions||'')}"></div><div class="full"><button class="btn primary">Enregistrer</button></div></form></section>`;
      $('#clinicalForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const row={patient_id:p.id,organization_id:S.org.id,updated_by:S.user.id,updated_at:nowIso()};['motive','anamnesis','history','treatments','allergies','lifestyle'].forEach(k=>row[k]=fd.get(k)||null);row.prescribed_sessions=fd.get('prescribed_sessions')?Number(fd.get('prescribed_sessions')):null;const {error}=await S.sb.from('clinical_profiles').upsert(row,{onConflict:'patient_id'});if(error)return fail(error);toast('Dossier clinique enregistré.');renderPatient();};
    }
    if(S.patientTab==='goals'){
      if(!isClinical()){body.innerHTML='<div class="card"><p class="muted">Accès clinique requis.</p></div>';return;}
      body.innerHTML=`<div class="grid grid2"><section class="card"><div class="card-head"><h2>Objectifs</h2><button class="btn sm" id="addGoal">+ Objectif</button></div><div class="list">${b.goals.map(g=>`<div class="row-item"><div class="grow"><strong>${esc(g.title)}</strong><div class="meta">${esc(g.status)}${g.target_date?' · cible '+fmtDate(g.target_date):''}</div><div class="progress" style="margin-top:7px"><span style="width:${g.progress}%"></span></div></div><span class="badge brand">${g.progress}%</span></div>`).join('')||'<div class="empty">Aucun objectif.</div>'}</div></section><section class="card"><div class="card-head"><h2>Mesures</h2><button class="btn sm" id="addMeasure">+ Valeur</button></div><div class="list">${b.vals.slice(0,15).map(v=>{const d=b.defs.find(x=>x.id===v.measure_definition_id);return `<div class="row-item"><div class="grow"><strong>${esc(d?.name||'Mesure')}</strong><div class="meta">${fmtDateTime(v.measured_at)}</div></div><span class="kpi">${esc(v.value)} ${esc(d?.unit||'')}</span></div>`}).join('')||'<div class="empty">Aucune mesure.</div>'}</div><div class="divider"></div><button class="btn" id="manageMeasureDefs">Gérer les types de mesure</button></section></div>`;
      $('#addGoal').onclick=()=>openGoalModal(p);$('#addMeasure').onclick=()=>openMeasureModal(p,b.defs);$('#manageMeasureDefs').onclick=()=>openMeasureDefinitionModal(b.defs);
    }
    if(S.patientTab==='consultations'){
      if(!isClinical()){body.innerHTML='<div class="card"><p class="muted">Les notes de séance sont invisibles pour le secrétariat.</p></div>';return;}
      body.innerHTML=`<section class="card"><div class="card-head"><div><h2>Séances</h2><p class="sub muted">Notes structurées, stockées dans consultations.data.</p></div><button class="btn primary sm" id="addConsult">+ Nouvelle séance</button></div><div class="list">${b.consults.map(c=>{const d=c.data||{};return `<div class="row-item"><div class="grow"><strong>${fmtDateTime(c.occurred_at)} · ${esc(c.status)}</strong><div class="meta">${esc(d.motive||'Sans motif')} ${d.painScore!==undefined?'· douleur '+esc(d.painScore)+'/10':''}</div><div class="small" style="margin-top:6px">${esc(d.observations||'')}</div></div></div>`}).join('')||'<div class="empty">Aucune séance enregistrée.</div>'}</div></section>`;$('#addConsult').onclick=()=>openConsultationModal(p);
    }
    if(S.patientTab==='appointments'){
      const rows=S.appointments.filter(a=>a.patient_id===p.id).sort((a,b)=>new Date(b.starts_at)-new Date(a.starts_at));body.innerHTML=`<section class="card"><div class="card-head"><h2>Rendez-vous</h2><button class="btn sm" id="addPatientAppt">+ Ajouter</button></div><div class="list">${rows.map(a=>`<div class="row-item"><div class="grow"><strong>${fmtDateTime(a.starts_at)}</strong><div class="meta">${esc(a.appointment_type||'Rendez-vous')} · ${esc(a.location||'')}</div></div><span class="badge">${esc(a.status)}</span></div>`).join('')||'<div class="empty">Aucun rendez-vous.</div>'}</div></section>`;$('#addPatientAppt').onclick=()=>openAppointmentModal(p.id);
    }
    if(S.patientTab==='messages'){
      const cs=S.commSettings||{}; const channels=['WHATSAPP','SMS','EMAIL'].filter(c=>cs[`${c.toLowerCase()}_enabled`]!==false); const preferred=channels.includes(p.preferred_channel)?p.preferred_channel:(channels[0]||'WHATSAPP');
      body.innerHTML=`<div class="grid grid2"><section class="card"><div class="card-head"><div><h2>💬 Contacter ${esc(p.first_name)}</h2><p class="sub muted">Prévisualise puis ouvre le canal choisi. Aucun contenu médical sensible.</p></div>${p.preferred_channel?`<span class="badge brand">⭐ ${esc(channelLabel(p.preferred_channel))}</span>`:''}</div>${cs._migrationMissing?'<div class="notice warn">Migration 007 requise pour enregistrer les réglages du cabinet.</div>':''}<form id="messageForm" class="grid" style="margin-top:14px"><div class="field"><label>Canal</label><select name="channel">${channels.map(c=>`<option value="${c}" ${c===preferred?'selected':''}>${esc(channelLabel(c))}${c===p.preferred_channel?' · Préféré':''}</option>`).join('')}</select></div><div class="field"><label>Modèle</label><select name="template">${Object.entries(COMM_TEMPLATES).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('')}</select></div><div class="field"><label>Prévisualisation</label><textarea name="message" rows="11"></textarea><div class="help">Tu peux modifier le message avant de continuer.</div></div><button class="btn primary">Continuer →</button></form></section><section class="card"><h2>Historique</h2><div class="list" style="margin-top:14px">${b.comms.map(c=>`<div class="row-item"><div class="grow"><strong>${esc(channelLabel(c.channel))} · ${esc(COMM_TEMPLATES[c.template]?.label||c.template||'Libre')}</strong><div class="meta">${fmtDateTime(c.created_at)} · ${esc(statusLabel(c.status))}</div></div></div>`).join('')||'<div class="empty">Aucune communication enregistrée.</div>'}</div></section></div>`;
      const form=$('#messageForm'), template=form.elements.template, message=form.elements.message; const refill=()=>{message.value=renderTemplate(template.value,p);}; refill(); template.onchange=refill; form.onsubmit=(e)=>prepareMessage(e,p);
    }
  }
  function timelineRows(p,b){const rows=[];b.consults.forEach(c=>rows.push({d:c.occurred_at,t:'Séance',s:(c.data||{}).motive||'Note clinique'}));S.appointments.filter(a=>a.patient_id===p.id).forEach(a=>rows.push({d:a.starts_at,t:'Rendez-vous',s:a.status}));b.comms.forEach(c=>rows.push({d:c.created_at,t:`Message ${c.channel}`,s:c.template||''}));return rows.sort((a,b)=>new Date(b.d)-new Date(a.d)).slice(0,20).map(x=>`<div class="timeline-item"><strong>${esc(x.t)}</strong><div class="meta">${fmtDateTime(x.d)} · ${esc(x.s)}</div></div>`);}
  function ta(label,name,value){return `<div class="field"><label>${label}</label><textarea name="${name}">${esc(value||'')}</textarea></div>`;}

  function renderAgenda(){
    const ws=S.weekStart;const days=[0,1,2,3,4].map(i=>{const d=new Date(ws);d.setDate(d.getDate()+i);return d;});
    let cal='<div class="cal-cell cal-head"></div>'+days.map(d=>`<div class="cal-cell cal-head">${d.toLocaleDateString('fr-FR',{weekday:'short',day:'2-digit',month:'short'})}</div>`).join('');
    for(let hour=8;hour<19;hour++){
      cal+=`<div class="cal-cell cal-time">${String(hour).padStart(2,'0')}:00</div>`;
      days.forEach(d=>{const events=S.appointments.filter(a=>{const ad=new Date(a.starts_at);return ad.getFullYear()===d.getFullYear()&&ad.getMonth()===d.getMonth()&&ad.getDate()===d.getDate()&&ad.getHours()===hour;}).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));cal+=`<div class="cal-cell">${events.map(a=>`<div class="cal-event" data-patient="${a.patient_id}">${new Date(a.starts_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})} · ${esc(patientName(a.patient_id))}<br><span>${esc(a.appointment_type||'Rendez-vous')}</span></div>`).join('')}</div>`;});
    }
    const end=days[4];
    $('#page').innerHTML=pageHead('Agenda',`${days[0].toLocaleDateString('fr-FR',{day:'numeric',month:'short'})} — ${end.toLocaleDateString('fr-FR',{day:'numeric',month:'short'})}`,`<div class="segmented"><button class="active">Semaine</button><button disabled>Jour</button><button disabled>Mois</button></div><button class="btn primary" id="addAppt">+ Rendez-vous</button>`)+`<section class="card calendar-card"><div class="calendar-scroll"><div class="calendar-shell">${cal}</div></div></section><div class="week-nav"><button class="btn sm" id="prevWeek">← Semaine précédente</button><button class="btn sm" id="todayWeek">Aujourd’hui</button><button class="btn sm" id="nextWeek">Semaine suivante →</button></div>`;
    $('#prevWeek').onclick=()=>{S.weekStart=new Date(S.weekStart);S.weekStart.setDate(S.weekStart.getDate()-7);renderAgenda();};$('#nextWeek').onclick=()=>{S.weekStart=new Date(S.weekStart);S.weekStart.setDate(S.weekStart.getDate()+7);renderAgenda();};$('#todayWeek').onclick=()=>{S.weekStart=startOfWeek();renderAgenda();};$('#addAppt').onclick=()=>openAppointmentModal();$$('.cal-event').forEach(e=>e.onclick=()=>go('patient',{patientId:e.dataset.patient,patientTab:'appointments'}));
  }


  function renderTasks(){
    $('#page').innerHTML=pageHead('Tâches','Suivi administratif et clinique sans perdre le fil.',`<button class="btn primary" id="addTask">+ Nouvelle tâche</button>`)+`<section class="card"><div class="toolbar"><button class="btn sm" data-filter="OPEN">Ouvertes</button><button class="btn sm" data-filter="ALL">Toutes</button></div><div class="list" id="taskList"></div></section>`;
    let filter='OPEN';const draw=()=>{const rows=S.tasks.filter(t=>filter==='ALL'||t.status!=='DONE');$('#taskList').innerHTML=rows.map(t=>`<div class="row-item"><button class="btn sm" data-done="${t.id}">${t.status==='DONE'?'↺':'✓'}</button><div class="grow"><strong style="${t.status==='DONE'?'text-decoration:line-through;opacity:.6':''}">${esc(t.title)}</strong><div class="meta">${t.patient_id?esc(patientName(t.patient_id))+' · ':''}${t.due_at?fmtDateTime(t.due_at):'Sans échéance'}</div></div><span class="badge ${t.priority==='HIGH'?'warn':''}">${esc(t.priority)}</span></div>`).join('')||'<div class="empty">Aucune tâche.</div>';$$('[data-done]').forEach(b=>b.onclick=async()=>{const t=S.tasks.find(x=>x.id===b.dataset.done);const {error}=await S.sb.from('tasks').update({status:t.status==='DONE'?'OPEN':'DONE',updated_at:nowIso()}).eq('id',t.id);if(error)return fail(error);await loadTasks();draw();});};draw();$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;draw();});$('#addTask').onclick=()=>openTaskModal();
  }

  function renderStats(){
    const completed=S.appointments.filter(a=>a.status==='DONE').length;const noShow=S.appointments.filter(a=>a.status==='NO_SHOW').length;const open=S.tasks.filter(t=>t.status!=='DONE').length;const byMonth={};S.appointments.forEach(a=>{const k=a.starts_at.slice(0,7);byMonth[k]=(byMonth[k]||0)+1;});const max=Math.max(1,...Object.values(byMonth));
    $('#page').innerHTML=pageHead('Statistiques','Des indicateurs simples, sans exposer de contenu clinique.')+`<div class="grid grid4"><div class="card stat"><div class="label">Patients</div><div class="value">${S.patients.length}</div></div><div class="card stat"><div class="label">RDV suivis</div><div class="value">${S.appointments.length}</div></div><div class="card stat"><div class="label">RDV terminés</div><div class="value">${completed}</div></div><div class="card stat"><div class="label">Absences</div><div class="value">${noShow}</div></div></div><section class="card" style="margin-top:16px"><div class="card-head"><h2>Activité par mois</h2><span class="badge">${open} tâche(s) ouverte(s)</span></div><div class="grid">${Object.entries(byMonth).sort().slice(-8).map(([m,n])=>`<div><div class="metric-line"><span>${esc(m)}</span><strong>${n} RDV</strong></div><div class="bar"><span style="width:${Math.round(n/max*100)}%"></span></div></div>`).join('')||'<div class="empty">Pas assez de données.</div>'}</div></section>`;
  }

  function renderIntegrations(){
    const groups={CALENDAR:'Calendriers',BOOKING:'Réservation & booking',BUSINESS:'Systèmes métier',STANDARD:'Standards & autres'};
    $('#page').innerHTML=pageHead('Intégrations','Vos outils connectés, vos disponibilités unifiées.',`<button class="btn" id="refreshIntegrations">Actualiser</button>`)
      +`<div class="integration-hero"><section class="integration-connect-hero"><span class="eyebrow light">DEMÉDICO CONNECT</span><h2>Tout connecter.<br>Tout garder sous contrôle.</h2><p>Centralisez vos agendas et services externes sans perdre la maîtrise des données. Les événements externes restent des indisponibilités, jamais des dossiers patients.</p></section><section class="card integration-principles"><div class="integration-principle"><span class="integration-symbol">◇</span><div><strong>Privacy by default</strong><p>Intitulés externes neutres et aucune donnée clinique envoyée aux calendriers.</p></div></div><div class="integration-principle"><span class="integration-symbol">↻</span><div><strong>Conflits maîtrisés</strong><p>Une source de vérité explicite et des identifiants externes pour éviter les doublons.</p></div></div><div class="integration-principle"><span class="integration-symbol">⌁</span><div><strong>Connecteurs interchangeables</strong><p>Google, Microsoft, ICS ou API partenaire sans coupler le cœur clinique.</p></div></div></section></div>`
      +`<div class="integration-section-head"><div><span class="eyebrow">CATALOGUE</span><h2>Disponibles</h2><p class="muted">Seuls les boutons réellement exploitables seront activés.</p></div></div>`
      +`<div class="integration-grid">${Object.entries(groups).map(([key,label])=>{const items=INTEGRATION_CATALOG.filter(i=>i.category===key);if(!items.length)return'';return `<div class="provider-label">${esc(label)}</div>${items.map(i=>{const [st,cls]=integrationStatus(i);return `<article class="integration-card"><div class="integration-card-head"><span class="integration-logo">${esc(i.short)}</span><span class="badge">${esc(i.sync)}</span></div><h3>${esc(i.name)}</h3><p>${esc(i.description)}</p><div class="integration-caps">${i.caps.map(c=>`<span>${esc(c)}</span>`).join('')}</div><div class="integration-card-foot"><span class="integration-state ${cls}">${esc(st)}</span><button class="btn sm" data-integration="${esc(i.id)}">Détails</button></div></article>`}).join('')}`}).join('')}</div>`;
    $('#refreshIntegrations').onclick=()=>{toast('Catalogue actualisé.');renderIntegrations();};
    $$('[data-integration]').forEach(b=>b.onclick=()=>openIntegrationDetails(b.dataset.integration));
  }

  function openIntegrationDetails(id){
    const i=INTEGRATION_CATALOG.find(x=>x.id===id); if(!i)return;
    const [st]=integrationStatus(i);
    modal(i.name,`<div class="integration-detail"><span class="badge brand">${esc(st)}</span><p>${esc(i.description)}</p><div class="divider"></div><div class="metric-line"><span>Synchronisation</span><strong>${esc(i.sync)}</strong></div><div class="metric-line"><span>État Next</span><strong>${esc(st)}</strong></div><div class="notice warn" style="margin-top:14px">${esc(i.requirement)}</div><p class="small muted">Demédico n’active pas de faux bouton OAuth : tant que le backend sécurisé n’est pas branché, aucune clé ni secret n’est placé dans le navigateur.</p></div>`);
  }

  function renderSubscription(){
    const currentId=S.subscription?.plan_id||'FREE', current=PLAN_CATALOG[currentId]||PLAN_CATALOG.FREE, usage=S.usage||{};
    const users=usage.active_users ?? S.members.filter(m=>m.active).length;
    const patients=usage.active_patients ?? S.patients.length;
    const appts=usage.appointments_current_month ?? S.appointments.filter(a=>String(a.starts_at).slice(0,7)===new Date().toISOString().slice(0,7)&&a.status!=='CANCELLED').length;
    const pending=S.planRequests.find(r=>r.status==='PENDING');
    $('#page').innerHTML=pageHead('Abonnement','Ton offre, ton utilisation et les offres disponibles.')
      +`${pending?`<div class="subscription-banner warn"><span class="status-dot amber"></span><strong>Demande en attente.</strong> Passage vers ${esc(planLabel(pending.requested_plan_id))} demandé le ${fmtDate(pending.created_at)}.</div>`:`<div class="subscription-banner"><span class="status-dot"></span><strong>Compte ${S.subscription?.status==='TRIALING'?'en essai':'actif'}.</strong> ${currentId==='FREE'?'Tu profites de l’offre gratuite.':`Ton offre ${esc(current.label)} est active.`}</div>`}`
      +`<div class="subscription-overview"><section class="card current-plan-card"><div class="current-plan-title"><div class="plan-icon">♛</div><div><span class="eyebrow">Ton abonnement</span><h2>Demédico ${esc(current.label)}</h2></div><span class="badge ok">${esc(subscriptionStatusLabel(S.subscription?.status))}</span></div><div class="current-price">${euro(S.subscription?.founder_price&&currentId==='PRO'?current.founderPrice:current.price)} <small>/ mois</small></div><p class="muted">${currentId==='FREE'?'Offert par Demédico':S.subscription?.billing_cycle==='ANNUAL'?'Facturation annuelle':'Facturation mensuelle'}</p><button class="btn primary" id="scrollPlans">Changer d’offre</button></section>`
      +`<section class="card usage-card"><div class="card-head"><div><h2>Ton utilisation</h2><p class="sub muted">Ce mois-ci</p></div></div>${usageLine('Patients actifs',patients,current.patients)}${usageLine('Rendez-vous ce mois',appts,current.appointments)}${usageLine('Utilisateurs',users,current.users)}</section>`
      +`<section class="card payment-card"><div class="card-head"><h2>Paiement</h2></div><div class="notice"><strong>Paiement en ligne bientôt disponible.</strong><p>Stripe n’est pas encore branché dans Next. Aucune carte bancaire n’est enregistrée ici.</p></div><p class="muted">Les changements vers une offre payante créent une demande administrateur sécurisée. Aucune facturation fictive n’est simulée.</p></section></div>`
      +`<div class="plans-head" id="plansSection"><div><h2>Choisis l’offre adaptée à ton activité</h2><p class="muted">Tu peux demander une autre formule sans perdre tes données.</p></div><div class="segmented billing-toggle"><button class="active" data-cycle="MONTHLY">Mensuel</button><button data-cycle="ANNUAL">Annuel <span class="annual-gift">2 mois offerts</span></button></div></div>`
      +`<div class="plan-grid">${Object.values(PLAN_CATALOG).map(p=>planCard(p,currentId)).join('')}</div>`
      +`${isAdmin()?`<section class="card request-history"><div class="card-head"><div><h2>Demandes récentes</h2><p class="sub muted">Historique visible uniquement par l’administration du cabinet.</p></div></div><div class="list">${S.planRequests.map(r=>`<div class="row-item"><div class="grow"><strong>${esc(planLabel(r.requested_plan_id))}</strong><div class="meta">${fmtDateTime(r.created_at)} · ${esc(r.billing_cycle||'MONTHLY')}</div></div><span class="badge ${r.status==='PENDING'?'warn':r.status==='APPROVED'?'ok':''}">${esc(r.status)}</span></div>`).join('')||'<div class="empty">Aucune demande.</div>'}</div></section>`:''}`;
    $('#scrollPlans').onclick=()=>$('#plansSection').scrollIntoView({behavior:'smooth'});
    $$('.billing-toggle button').forEach(b=>b.onclick=()=>{$$('.billing-toggle button').forEach(x=>x.classList.toggle('active',x===b));root.dataset.billingCycle=b.dataset.cycle;$$('.plan-price').forEach(x=>{const p=PLAN_CATALOG[x.dataset.plan];const annual=b.dataset.cycle==='ANNUAL';x.innerHTML=`${euro(annual?p.annual:p.price)} <small>${annual?'/ an':'/ mois'}</small>`;});});
    $$('[data-request-plan]').forEach(b=>b.onclick=()=>requestPlanChange(b.dataset.requestPlan));
  }

  function usageLine(label,used,limit){
    const text=limit===null?`${used} / Illimités`:`${used} / ${limit}`; const pct=usagePct(used,limit);
    return `<div class="usage-line"><div class="usage-copy"><strong>${esc(label)}</strong><span>${esc(text)}</span></div><div class="usage-bar"><span style="width:${pct}%"></span></div></div>`;
  }
  function planCard(p,currentId){
    const active=p.id===currentId; return `<article class="plan-card ${p.recommended?'recommended':''} ${active?'active-plan':''}">${p.recommended?'<span class="recommend-pill">Offre recommandée</span>':''}<span class="eyebrow">${esc(p.label.toUpperCase())}</span><div class="plan-price" data-plan="${p.id}">${euro(p.price)} <small>/ mois</small></div>${p.founderPrice?`<div class="founder-price">${euro(p.founderPrice)} / mois en tarif fondateur</div>`:''}<p>${esc(p.description)}</p><ul>${p.features.map(f=>`<li>✓ ${esc(f)}</li>`).join('')}<li>✓ ${p.users} utilisateur${p.users>1?'s':''}${p.id==='CABINET_PLUS'?' inclus':''}</li>${p.extraUserPrice?`<li>+ ${euro(p.extraUserPrice)} / utilisateur supplémentaire</li>`:''}</ul><button class="btn ${active?'':'primary'}" ${active?'disabled':''} data-request-plan="${p.id}">${active?'Offre actuelle':p.price===0?'Passer en Free':`Demander ${esc(p.label)}`}</button></article>`;
  }

  async function requestPlanChange(planId){
    if(!isAdmin())return toast('Seuls le propriétaire ou un administrateur peuvent changer d’offre.','error');
    const current=S.subscription?.plan_id||'FREE'; if(planId===current)return;
    const cycle=root.dataset.billingCycle||'MONTHLY';
    if(planId==='FREE'){
      const p=PLAN_CATALOG.FREE, patients=S.usage?.active_patients??S.patients.length, users=S.usage?.active_users??S.members.filter(m=>m.active).length, appts=S.usage?.appointments_current_month??0;
      if(patients>p.patients||users>p.users||appts>p.appointments)return toast('Ton usage dépasse actuellement les limites Free. Réduis l’usage ou choisis une autre offre.','error');
    }
    const row={organization_id:S.org.id,requested_plan_id:planId,billing_cycle:cycle,status:'PENDING',requested_by:S.user.id};
    const {error}=await S.sb.from('subscription_change_requests').insert(row);
    if(error){ if(/subscription_change_requests/i.test(error.message||''))return toast('Migration Supabase 008 requise avant de pouvoir envoyer la demande.','error'); return fail(error); }
    await loadPlanRequests(); toast(`Demande ${planLabel(planId)} enregistrée.`); renderSubscription();
  }

  function renderSettings(){
    const team=S.members.map(m=>`<div class="row-item"><div class="avatar">${esc((S.profiles[m.user_id]?.display_name||'?').slice(0,2).toUpperCase())}</div><div class="grow"><strong>${esc(S.profiles[m.user_id]?.display_name || (m.user_id===S.user.id?'Moi':'Membre'))}</strong><div class="meta">${esc(roleLabel(m.role))} · ${m.active?'Actif':'Inactif'}</div></div></div>`).join('');
    const c=S.commSettings||{}; const dis=isAdmin()?'':'disabled';
    $('#page').innerHTML=pageHead('Paramètres','Cabinet, communications, équipe, abonnement et compte.')+`<div class="grid grid2"><section class="card"><div class="card-head"><h2>Cabinet</h2></div><div class="metric-line"><span>Nom</span><strong>${esc(S.org.name)}</strong></div><div class="metric-line"><span>Modèle métier</span><strong>${esc(S.org.profession_template_key||'—')}</strong></div><div class="metric-line"><span>Fuseau</span><strong>${esc(S.org.timezone||'—')}</strong></div></section><section class="card"><div class="card-head"><h2>Abonnement</h2></div><div class="metric-line"><span>Offre</span><strong>${esc(S.subscription?.plan_id||'FREE')}</strong></div><div class="metric-line"><span>Statut</span><strong>${esc(S.subscription?.status||'FREE')}</strong></div><div class="metric-line"><span>Patients actifs</span><strong>${S.usage?.active_patients ?? S.patients.length}</strong></div><div class="metric-line"><span>RDV ce mois</span><strong>${S.usage?.appointments_current_month ?? '—'}</strong></div><p class="small muted" style="margin-top:12px">Stripe n’est pas encore branché. Aucun faux écran de paiement n’est affiché.</p></section>
    <section class="card full-span"><div class="card-head"><div><h2>💬 Communications</h2><p class="sub muted">Réglé une fois pour tout le cabinet.</p></div>${c._migrationMissing?'<span class="badge warn">Migration 007 requise</span>':''}</div><form id="commSettingsForm" class="form-grid"><div class="field"><label>Nom affiché</label><input name="sender_name" maxlength="80" value="${esc(c.sender_name||S.org.name)}" ${dis}></div><div class="field"><label>Email de réponse</label><input name="reply_to" type="email" value="${esc(c.reply_to||'')}" ${dis}></div><div class="field"><label>Pays du cabinet</label><select name="default_country" ${dis}>${countryOptions(c.default_country||'FR')}</select></div><div class="field"><label>Téléphone professionnel</label><input name="pro_phone" type="tel" value="${esc(c.pro_phone||'')}" placeholder="052-123-4567" ${dis}></div><div class="field full"><label>Signature</label><textarea name="signature" maxlength="400" ${dis}>${esc(c.signature||'')}</textarea></div><div class="field full"><label>Canaux activés</label><div class="channel-checks"><label><input type="checkbox" name="email_enabled" ${c.email_enabled!==false?'checked':''} ${dis}> 📧 Email</label><label><input type="checkbox" name="whatsapp_enabled" ${c.whatsapp_enabled!==false?'checked':''} ${dis}> 💬 WhatsApp</label><label><input type="checkbox" name="sms_enabled" ${c.sms_enabled!==false?'checked':''} ${dis}> 📱 SMS</label></div></div><div class="full actions">${isAdmin()?'<button class="btn primary">Enregistrer</button>':''}<button type="button" class="btn" id="testWhatsApp">Tester WhatsApp</button><button type="button" class="btn" id="testSms">Tester SMS</button><button type="button" class="btn" id="testEmail">Tester Email</button></div><p class="full small muted">WhatsApp et SMS ouvrent l’application correspondante. L’email nécessite l’Edge Function serveur et un fournisseur d’envoi configuré.</p></form></section>
    <section class="card"><div class="card-head"><div><h2>Équipe</h2><p class="sub muted">Rôles réellement appliqués par la base.</p></div>${isAdmin()?'<button class="btn sm" id="inviteInfo">Inviter</button>':''}</div><div class="list">${team||'<div class="empty">Aucun membre.</div>'}</div></section><section class="card"><h2>Mon compte</h2><div class="metric-line"><span>Email</span><strong>${esc(S.user.email)}</strong></div><div class="metric-line"><span>Rôle</span><strong>${esc(roleLabel(S.member.role))}</strong></div><div style="margin-top:14px"><button class="btn" id="changePw">Changer le mot de passe</button></div></section></div>`;
    if($('#commSettingsForm')&&isAdmin()) $('#commSettingsForm').onsubmit=saveCommSettings;
    $('#testWhatsApp').onclick=()=>testChannel('WHATSAPP'); $('#testSms').onclick=()=>testChannel('SMS'); $('#testEmail').onclick=()=>testChannel('EMAIL');
    if($('#inviteInfo'))$('#inviteInfo').onclick=()=>toast('L’invitation sécurisée nécessite l’Edge Function serveur prévue au prochain lot.');
    $('#changePw').onclick=async()=>{const {error}=await S.sb.auth.resetPasswordForEmail(S.user.email,{redirectTo:location.origin+location.pathname});toast(error?frErr(error):'Email de changement de mot de passe envoyé.',error?'error':'');};
  }

  async function saveCommSettings(e){e.preventDefault();const fd=new FormData(e.target);let pro='';try{pro=fd.get('pro_phone')?normalizePhone(fd.get('pro_phone'),fd.get('default_country')):'';}catch(err){return fail(err);}const row={organization_id:S.org.id,sender_name:String(fd.get('sender_name')||'').trim(),reply_to:String(fd.get('reply_to')||'').trim().toLowerCase()||null,default_country:fd.get('default_country'),pro_phone:pro||null,signature:String(fd.get('signature')||'').trim(),email_enabled:fd.get('email_enabled')==='on',whatsapp_enabled:fd.get('whatsapp_enabled')==='on',sms_enabled:fd.get('sms_enabled')==='on',updated_at:nowIso()};const {error}=await S.sb.from('organization_communication_settings').upsert(row,{onConflict:'organization_id'});if(error)return fail(error);S.commSettings={...S.commSettings,...row,_migrationMissing:false};toast('Paramètres de communication enregistrés.');renderSettings();}
  async function testChannel(channel){const c=S.commSettings||{};if(channel==='EMAIL'){try{const {error}=await S.sb.functions.invoke('send-email-test',{body:{organization_id:S.org.id}});if(error)throw error;toast('Email de test demandé.');}catch(e){toast('Email test non configuré : ajoute l’Edge Function + Resend/Brevo.','error');}return;}if(!c.pro_phone)return toast('Renseigne d’abord le téléphone professionnel.','error');const msg='Demédico · test de votre configuration';const tel=c.pro_phone.replace(/[^+0-9]/g,'');window.open(channel==='WHATSAPP'?`https://wa.me/${tel.replace('+','')}?text=${encodeURIComponent(msg)}`:`sms:${tel}?body=${encodeURIComponent(msg)}`,'_blank','noopener');}

  function renderDiagnostic(){const avg=S.perf.length?Math.round(S.perf.reduce((a,b)=>a+b.ms,0)/S.perf.length):0;$('#page').innerHTML=pageHead('Diagnostic','Mesures réelles des appels Supabase dans cette session.')+`<div class="grid grid3"><div class="card stat"><div class="label">Moyenne</div><div class="value">${avg} ms</div></div><div class="card stat"><div class="label">Appels mesurés</div><div class="value">${S.perf.length}</div></div><div class="card stat"><div class="label">Backend</div><div class="value" style="font-size:22px">Supabase</div></div></div><section class="card" style="margin-top:16px"><div class="list">${S.perf.map(x=>`<div class="row-item"><div class="grow"><strong>${esc(x.label)}</strong><div class="meta">${x.at.toLocaleTimeString('fr-FR')}</div></div><span class="badge ${x.ms<250?'ok':x.ms<800?'warn':'danger'}">${x.ms} ms</span></div>`).join('')||'<div class="empty">Aucune mesure.</div>'}</div></section>`;}

  function modal(title,html,onReady){$('#modalRoot').innerHTML=`<div class="modal-backdrop" id="modalBg"><div class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button class="btn sm" id="modalClose">✕</button></div>${html}</div></div>`;$('#modalClose').onclick=closeModal;$('#modalBg').onclick=e=>{if(e.target.id==='modalBg')closeModal();};onReady?.();}
  function closeModal(){const m=$('#modalRoot');if(m)m.innerHTML='';}

  function openPatientModal(p=null){const defCountry=p?.phone_country||S.commSettings?.default_country||'FR';modal(p?'Modifier le patient':'Nouveau patient',`<form id="patientForm" class="form-grid"><div class="field"><label>Prénom</label><input name="first_name" required value="${esc(p?.first_name||'')}"></div><div class="field"><label>Nom</label><input name="last_name" required value="${esc(p?.last_name||'')}"></div><div class="field"><label>Pays du téléphone</label><select name="phone_country">${countryOptions(defCountry)}</select></div><div class="field"><label>Téléphone</label><input name="phone" type="tel" placeholder="052-123-4567" value="${esc(p?.phone||'')}"><div class="help">Demédico l’enregistre automatiquement au format international.</div></div><div class="field"><label>Email</label><input name="email" type="email" value="${esc(p?.email||'')}"></div><div class="field"><label>Canal préféré</label><select name="preferred_channel"><option value="">Aucun</option><option value="WHATSAPP" ${p?.preferred_channel==='WHATSAPP'?'selected':''}>WhatsApp</option><option value="SMS" ${p?.preferred_channel==='SMS'?'selected':''}>SMS</option><option value="EMAIL" ${p?.preferred_channel==='EMAIL'?'selected':''}>Email</option></select></div><div class="field"><label>Date de naissance</label><input name="birth_date" type="date" value="${esc(p?.birth_date||'')}"></div><div class="field full"><label>Information importante</label><textarea name="important_info">${esc(p?.important_info||'')}</textarea></div><div class="full actions"><button class="btn primary">${p?'Enregistrer':'Créer'}</button></div></form>`,()=>{$('#patientForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);let phone='';try{phone=fd.get('phone')?normalizePhone(fd.get('phone'),fd.get('phone_country')):'';}catch(err){return fail(err);}const row={organization_id:S.org.id,first_name:fd.get('first_name').trim(),last_name:fd.get('last_name').trim(),phone:phone||null,phone_country:fd.get('phone_country')||null,preferred_channel:fd.get('preferred_channel')||null,email:fd.get('email').trim()||null,birth_date:fd.get('birth_date')||null,important_info:fd.get('important_info').trim()||null,updated_at:nowIso()};const q=p?S.sb.from('patients').update(row).eq('id',p.id):S.sb.from('patients').insert(row);const {error}=await q;if(error)return fail(error);await loadPatients();closeModal();toast(p?'Patient mis à jour.':'Patient créé.');render();};});}

  function openAppointmentModal(patientId=''){modal('Nouveau rendez-vous',`<form id="apptForm" class="form-grid"><div class="field full"><label>Patient</label><select name="patient_id" required><option value="">Choisir…</option>${S.patients.map(p=>`<option value="${p.id}" ${p.id===patientId?'selected':''}>${esc(p.first_name+' '+p.last_name)}</option>`).join('')}</select></div><div class="field"><label>Début</label><input name="starts_at" type="datetime-local" required></div><div class="field"><label>Durée (min)</label><input name="duration" type="number" min="10" step="5" value="30"></div><div class="field"><label>Type</label><input name="appointment_type" value="Consultation"></div><div class="field"><label>Lieu</label><input name="location"></div><div class="full actions"><button class="btn primary">Créer</button></div></form>`,()=>{$('#apptForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const start=new Date(fd.get('starts_at'));const end=new Date(start.getTime()+Number(fd.get('duration'))*60000);const {error}=await S.sb.from('appointments').insert({organization_id:S.org.id,patient_id:fd.get('patient_id'),practitioner_user_id:isClinical()?S.user.id:null,starts_at:start.toISOString(),ends_at:end.toISOString(),status:'BOOKED',appointment_type:fd.get('appointment_type')||null,location:fd.get('location')||null});if(error)return fail(error);await loadAppointments();closeModal();toast('Rendez-vous créé.');render();};});}

  function openTaskModal(){modal('Nouvelle tâche',`<form id="taskForm" class="form-grid"><div class="field full"><label>Titre</label><input name="title" required></div><div class="field"><label>Patient</label><select name="patient_id"><option value="">Aucun</option>${S.patients.map(p=>`<option value="${p.id}">${esc(p.first_name+' '+p.last_name)}</option>`).join('')}</select></div><div class="field"><label>Priorité</label><select name="priority"><option>NORMAL</option><option>HIGH</option><option>LOW</option></select></div><div class="field full"><label>Échéance</label><input name="due_at" type="datetime-local"></div><div class="full"><button class="btn primary">Créer</button></div></form>`,()=>{$('#taskForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('tasks').insert({organization_id:S.org.id,title:fd.get('title').trim(),patient_id:fd.get('patient_id')||null,priority:fd.get('priority'),status:'OPEN',due_at:fd.get('due_at')?new Date(fd.get('due_at')).toISOString():null});if(error)return fail(error);await loadTasks();closeModal();toast('Tâche créée.');renderTasks();};});}

  function openAlertModal(p){modal('Ajouter une alerte',`<form id="alertForm" class="form-grid"><div class="field full"><label>Alerte</label><input name="label" required></div><div class="field full"><label>Niveau</label><select name="severity"><option>INFO</option><option>MEDIUM</option><option>HIGH</option></select></div><div class="full"><button class="btn primary">Ajouter</button></div></form>`,()=>{$('#alertForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('patient_alerts').insert({organization_id:S.org.id,patient_id:p.id,label:fd.get('label').trim(),severity:fd.get('severity'),active:true});if(error)return fail(error);closeModal();toast('Alerte ajoutée.');renderPatient();};});}

  function openGoalModal(p){modal('Nouvel objectif',`<form id="goalForm" class="form-grid"><div class="field full"><label>Titre</label><input name="title" required></div><div class="field"><label>Progression</label><input name="progress" type="number" min="0" max="100" value="0"></div><div class="field"><label>Date cible</label><input name="target_date" type="date"></div><div class="field full"><label>Description</label><textarea name="description"></textarea></div><div class="full"><button class="btn primary">Créer</button></div></form>`,()=>{$('#goalForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('goals').insert({organization_id:S.org.id,patient_id:p.id,title:fd.get('title').trim(),description:fd.get('description')||null,progress:Number(fd.get('progress')||0),status:'ACTIVE',target_date:fd.get('target_date')||null,created_by:S.user.id});if(error)return fail(error);closeModal();toast('Objectif créé.');renderPatient();};});}

  function openMeasureDefinitionModal(defs){modal('Types de mesure',`<div class="list">${defs.map(d=>`<div class="row-item"><div class="grow"><strong>${esc(d.name)}</strong><div class="meta">${esc(d.unit||'Sans unité')} · ${esc(d.direction)}</div></div></div>`).join('')||'<div class="empty">Aucun type.</div>'}</div><div class="divider"></div><form id="defForm" class="form-grid"><div class="field"><label>Nom</label><input name="name" required></div><div class="field"><label>Unité</label><input name="unit"></div><div class="field"><label>Sens</label><select name="direction"><option value="TARGET">Cible</option><option value="UP">Mieux si augmente</option><option value="DOWN">Mieux si diminue</option></select></div><div class="field"><label>Cible</label><input name="target_value" type="number" step="any"></div><div class="full"><button class="btn primary">Créer</button></div></form>`,()=>{$('#defForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('measure_definitions').insert({organization_id:S.org.id,name:fd.get('name').trim(),unit:fd.get('unit')||null,direction:fd.get('direction'),target_value:fd.get('target_value')||null,active:true});if(error)return fail(error);closeModal();toast('Type de mesure créé.');renderPatient();};});}

  function openMeasureModal(p,defs){if(!defs.length){toast('Crée d’abord un type de mesure.','error');return openMeasureDefinitionModal(defs);}modal('Ajouter une mesure',`<form id="measureForm" class="form-grid"><div class="field full"><label>Mesure</label><select name="measure_definition_id">${defs.map(d=>`<option value="${d.id}">${esc(d.name)} ${esc(d.unit||'')}</option>`).join('')}</select></div><div class="field"><label>Valeur</label><input name="value" type="number" step="any" required></div><div class="field"><label>Date</label><input name="measured_at" type="datetime-local"></div><div class="full"><button class="btn primary">Ajouter</button></div></form>`,()=>{$('#measureForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('measure_values').insert({organization_id:S.org.id,patient_id:p.id,measure_definition_id:fd.get('measure_definition_id'),value:Number(fd.get('value')),measured_at:fd.get('measured_at')?new Date(fd.get('measured_at')).toISOString():nowIso(),created_by:S.user.id});if(error)return fail(error);closeModal();toast('Mesure ajoutée.');renderPatient();};});}

  function openConsultationModal(p){modal('Nouvelle séance',`<form id="consultForm" class="form-grid"><div class="field"><label>Date</label><input name="occurred_at" type="datetime-local"></div><div class="field"><label>Douleur /10</label><input name="painScore" type="number" min="0" max="10"></div><div class="field full"><label>Motif</label><input name="motive"></div>${ta('Observations','observations','')}${ta('Traitement','treatment','')}${ta('Recommandations','recommendations','')}${ta('Suivi','followUp','')}<div class="full"><button class="btn primary">Enregistrer</button></div></form>`,()=>{$('#consultForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const data={motive:fd.get('motive')||'',painScore:fd.get('painScore')===''?null:Number(fd.get('painScore')),observations:fd.get('observations')||'',treatment:fd.get('treatment')||'',recommendations:fd.get('recommendations')||'',followUp:fd.get('followUp')||''};const {error}=await S.sb.from('consultations').insert({organization_id:S.org.id,patient_id:p.id,practitioner_user_id:S.user.id,status:'FINAL',data,occurred_at:fd.get('occurred_at')?new Date(fd.get('occurred_at')).toISOString():nowIso()});if(error)return fail(error);closeModal();toast('Séance enregistrée.');renderPatient();};});}

  function nextAppointment(p){return S.appointments.filter(a=>a.patient_id===p.id&&new Date(a.starts_at)>=new Date()&&a.status!=='CANCELLED').sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0];}
  function renderTemplate(key,p){const t=COMM_TEMPLATES[key]||COMM_TEMPLATES.FREE;const appt=nextAppointment(p);let date='[date]',heure='[heure]';if(appt){const d=new Date(appt.starts_at);date=d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});heure=d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});}return t.body.replaceAll('{prenom}',p.first_name||'').replaceAll('{cabinet}',S.org.name||'').replaceAll('{date}',date).replaceAll('{heure}',heure).replaceAll('{signature}',S.commSettings?.signature||S.commSettings?.sender_name||S.org.name||'');}
  async function prepareMessage(e,p){e.preventDefault();const fd=new FormData(e.target),channel=fd.get('channel'),template=fd.get('template'),message=String(fd.get('message')||'').trim()||renderTemplate(template,p),subject=COMM_TEMPLATES[template]?.subject||null;if(channel==='EMAIL'){try{const {error}=await S.sb.functions.invoke('send-patient-email',{body:{organization_id:S.org.id,patient_id:p.id,template,subject,message}});if(error)throw error;toast('Email envoyé.');await renderPatient();}catch(err){toast('Email non configuré : Edge Function + Resend/Brevo requis.','error');}return;}if(!p.phone){toast('Ce patient n’a pas de téléphone.','error');return;}const {error}=await S.sb.from('communications').insert({organization_id:S.org.id,patient_id:p.id,channel,template,subject,status:'OPENED',author:S.user.id});if(error)return fail(error);const tel=p.phone.replace(/[^+0-9]/g,'');const url=channel==='WHATSAPP'?`https://wa.me/${tel.replace('+','')}?text=${encodeURIComponent(message)}`:`sms:${tel}?body=${encodeURIComponent(message)}`;window.open(url,'_blank','noopener');toast(`${channelLabel(channel)} ouvert.`);renderPatient();}

  boot();
})();
