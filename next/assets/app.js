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

  const S = {
    sb:null,user:null,member:null,org:null,route:'dashboard',patientId:null,patientTab:'overview',
    patients:[],appointments:[],tasks:[],members:[],profiles:{},subscription:null,usage:null,
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

  function appShell() {
    root.innerHTML = `
      <div id="toasts" class="toasts"></div>
      <div class="shell">
        <aside class="sidebar" id="sidebar">
          <div class="brand"><img src="${LOGO}" alt="Demédico"></div>
          <nav class="nav" id="nav">
            ${navButton('dashboard','⌂','Accueil')}
            ${navButton('patients','◉','Patients')}
            ${navButton('agenda','◫','Agenda')}
            ${navButton('tasks','✓','Tâches')}
            ${navButton('stats','▥','Statistiques')}
            ${navButton('settings','⚙','Paramètres')}
            <button data-route="diagnostic"><span class="nav-ico">⌁</span>Diagnostic</button>
          </nav>
          <div class="sidebar-foot"><div class="user-card"><strong>${esc(S.user.email)}</strong><span class="meta">${esc(S.org.name)} · ${esc(roleLabel(S.member.role))}</span><div style="margin-top:8px"><button class="link" id="logoutBtn">Déconnexion</button></div></div></div>
        </aside>
        <div class="content">
          <header class="topbar"><button class="btn sm mobile-menu" id="menuBtn">☰</button><div class="grow"><strong>${esc(S.org.name)}</strong></div><span class="badge brand hide-mobile">Supabase</span><span class="meta hide-mobile">Données de développement uniquement</span></header>
          <main class="page" id="page"></main>
        </div>
      </div>
      <div id="modalRoot"></div>`;
    $('#logoutBtn').onclick = async()=>{await S.sb.auth.signOut(); location.reload();};
    $('#menuBtn').onclick=()=>$('#sidebar').classList.toggle('open');
    $('#nav').onclick=(e)=>{const b=e.target.closest('[data-route]');if(!b)return;go(b.dataset.route);$('#sidebar').classList.remove('open');};
  }
  function navButton(route, ico, label){ return `<button data-route="${route}"><span class="nav-ico">${ico}</span>${label}</button>`; }
  function markNav(){ $$('#nav [data-route]').forEach(b=>b.classList.toggle('active',b.dataset.route===S.route || (S.route==='patient'&&b.dataset.route==='patients'))); }
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
      await Promise.all([loadPatients(),loadAppointments(),loadTasks(),loadMembers(),loadSubscription()]);
      appShell(); render();
    }catch(e){console.error(e);authView(frErr(e));}
  }

  async function loadPatients(){const {data,error}=await timed('Patients',()=>S.sb.from('patients').select('*').eq('organization_id',S.org.id).is('archived_at',null).order('last_name'));if(error)throw error;S.patients=data||[];}
  async function loadAppointments(){const from=new Date();from.setMonth(from.getMonth()-3);const to=new Date();to.setMonth(to.getMonth()+6);const {data,error}=await timed('Agenda',()=>S.sb.from('appointments').select('*').eq('organization_id',S.org.id).gte('starts_at',from.toISOString()).lte('starts_at',to.toISOString()).order('starts_at'));if(error)throw error;S.appointments=data||[];}
  async function loadTasks(){const {data,error}=await timed('Tâches',()=>S.sb.from('tasks').select('*').eq('organization_id',S.org.id).order('created_at',{ascending:false}).limit(200));if(error)throw error;S.tasks=data||[];}
  async function loadMembers(){const {data,error}=await timed('Équipe',()=>S.sb.from('organization_members').select('user_id,role,active').eq('organization_id',S.org.id).order('created_at'));if(error)throw error;S.members=data||[];const ids=S.members.map(m=>m.user_id);if(ids.length){const {data:p}=await S.sb.from('profiles').select('id,display_name').in('id',ids);S.profiles=Object.fromEntries((p||[]).map(x=>[x.id,x]));}}
  async function loadSubscription(){const [{data:s},{data:u}]=await Promise.all([S.sb.from('subscriptions').select('*').eq('organization_id',S.org.id).maybeSingle(),S.sb.from('usage_counters').select('*').eq('organization_id',S.org.id).maybeSingle()]);S.subscription=s||null;S.usage=u||null;}

  function render(){markNav(); const p=$('#page'); if(!p)return; ({dashboard:renderDashboard,patients:renderPatients,patient:renderPatient,agenda:renderAgenda,tasks:renderTasks,stats:renderStats,settings:renderSettings,diagnostic:renderDiagnostic}[S.route]||renderDashboard)();}
  function pageHead(title,sub,actions=''){return `<div class="page-head"><div><h1>${esc(title)}</h1><p class="muted">${esc(sub)}</p></div>${actions?`<div class="actions">${actions}</div>`:''}</div>`;}
  function patientName(id){const p=S.patients.find(x=>x.id===id);return p?`${p.first_name} ${p.last_name}`:'Patient';}
  function patientById(id){return S.patients.find(x=>x.id===id);}

  function renderDashboard(){
    const today=new Date(); const day=today.toISOString().slice(0,10); const todayA=S.appointments.filter(a=>a.starts_at.slice(0,10)===day && a.status!=='CANCELLED'); const open=S.tasks.filter(t=>t.status!=='DONE'); const next=[...S.appointments].filter(a=>new Date(a.starts_at)>=today&&a.status!=='CANCELLED').sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at)).slice(0,5);
    $('#page').innerHTML=pageHead('Bonjour','Voici l’essentiel du cabinet aujourd’hui.',`<button class="btn primary" id="quickPatient">+ Patient</button><button class="btn" id="quickAppt">+ Rendez-vous</button>`)+`
      <div class="grid grid4"><div class="card stat"><div class="label">Patients actifs</div><div class="value">${S.patients.length}</div><span class="badge brand">Cabinet</span></div><div class="card stat"><div class="label">Rendez-vous aujourd’hui</div><div class="value">${todayA.length}</div><span class="badge ok">Agenda</span></div><div class="card stat"><div class="label">Tâches ouvertes</div><div class="value">${open.length}</div><span class="badge ${open.some(t=>t.priority==='HIGH')?'warn':'brand'}">À suivre</span></div><div class="card stat"><div class="label">Offre</div><div class="value" style="font-size:23px">${esc(S.subscription?.plan_id||'FREE')}</div><span class="badge brand">${esc(S.subscription?.status||'FREE')}</span></div></div>
      <div class="grid grid2" style="margin-top:16px"><section class="card"><div class="card-head"><div><h2>Prochains rendez-vous</h2><p class="sub muted">Les 5 prochains créneaux.</p></div><button class="link" data-go="agenda">Voir l’agenda</button></div><div class="list">${next.length?next.map(a=>`<div class="row-item"><div class="avatar">${new Date(a.starts_at).getHours()}h</div><div class="grow"><strong>${esc(patientName(a.patient_id))}</strong><div class="meta">${fmtDateTime(a.starts_at)} · ${esc(a.appointment_type||'Rendez-vous')}</div></div><span class="badge">${esc(a.status)}</span></div>`).join(''):'<div class="empty">Aucun rendez-vous à venir.</div>'}</div></section>
      <section class="card"><div class="card-head"><div><h2>Tâches prioritaires</h2><p class="sub muted">Ce qui mérite ton attention.</p></div><button class="link" data-go="tasks">Toutes les tâches</button></div><div class="list">${open.slice(0,6).map(t=>`<div class="row-item"><div class="grow"><strong>${esc(t.title)}</strong><div class="meta">${t.patient_id?esc(patientName(t.patient_id))+' · ':''}${t.due_at?fmtDateTime(t.due_at):'Sans échéance'}</div></div><span class="badge ${t.priority==='HIGH'?'warn':''}">${esc(t.priority)}</span></div>`).join('')||'<div class="empty">Rien d’urgent.</div>'}</div></section></div>`;
    $$('[data-go]').forEach(b=>b.onclick=()=>go(b.dataset.go)); $('#quickPatient').onclick=()=>openPatientModal(); $('#quickAppt').onclick=()=>openAppointmentModal();
  }

  function renderPatients(){
    $('#page').innerHTML=pageHead('Patients','Recherche, dossier clinique, objectifs, mesures et historique.',`<button class="btn primary" id="addPatient">+ Nouveau patient</button>`)+`<section class="card"><div class="toolbar"><div class="search"><input id="patientSearch" placeholder="Rechercher un nom, téléphone, email…"></div><span class="badge brand">${S.patients.length} patient(s)</span></div><div class="list" id="patientList"></div></section>`;
    const draw=()=>{const q=$('#patientSearch').value.toLowerCase().trim();const list=S.patients.filter(p=>`${p.first_name} ${p.last_name} ${p.phone||''} ${p.email||''}`.toLowerCase().includes(q));$('#patientList').innerHTML=list.map(p=>`<div class="row-item clickable" data-pid="${p.id}"><div class="avatar">${esc(initials(p))}</div><div class="grow"><strong>${esc(p.first_name)} ${esc(p.last_name)}</strong><div class="meta">${esc([p.phone,p.email].filter(Boolean).join(' · ')||'Aucune coordonnée')}</div></div><span class="badge">Ouvrir</span></div>`).join('')||'<div class="empty">Aucun patient trouvé.</div>'; $$('[data-pid]').forEach(x=>x.onclick=()=>go('patient',{patientId:x.dataset.pid,patientTab:'overview'}));};
    draw();$('#patientSearch').oninput=draw;$('#addPatient').onclick=()=>openPatientModal();
  }

  async function renderPatient(){
    const p=patientById(S.patientId); if(!p)return go('patients');
    $('#page').innerHTML=`<div class="page-head"><div class="patient-head"><button class="btn sm" id="backPatients">←</button><div class="avatar">${esc(initials(p))}</div><div><h1>${esc(p.first_name)} ${esc(p.last_name)}</h1><p class="muted">${esc([p.phone,p.email,fmtDate(p.birth_date)].filter(Boolean).join(' · '))}</p></div></div><div class="actions"><button class="btn" id="editPatient">Modifier</button><button class="btn primary" id="patientAppt">+ Rendez-vous</button></div></div>
      <div class="tabs" id="patientTabs">${['overview','clinical','goals','consultations','appointments','messages'].map(t=>`<button data-tab="${t}" class="${S.patientTab===t?'active':''}">${({overview:'Aperçu',clinical:'Dossier',goals:'Objectifs & mesures',consultations:'Séances',appointments:'Rendez-vous',messages:'Messages'})[t]}</button>`).join('')}</div><div id="patientBody"><div class="empty">Chargement…</div></div>`;
    $('#backPatients').onclick=()=>go('patients'); $('#editPatient').onclick=()=>openPatientModal(p); $('#patientAppt').onclick=()=>openAppointmentModal(p.id); $$('#patientTabs button').forEach(b=>b.onclick=()=>{S.patientTab=b.dataset.tab;renderPatient();});
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
      body.innerHTML=`<div class="grid grid2"><section class="card"><h2>Préparer un message</h2><p class="muted small">WhatsApp et SMS s’ouvrent sur l’appareil. L’email Demédico nécessite une Edge Function + Resend/Brevo.</p><form id="messageForm" class="grid" style="margin-top:14px"><div class="field"><label>Canal</label><select name="channel"><option>WHATSAPP</option><option>SMS</option><option>EMAIL</option></select></div><div class="field"><label>Modèle</label><select name="template"><option value="REMINDER">Rappel de rendez-vous</option><option value="CONFIRMATION">Confirmation</option><option value="FOLLOW_UP">Suite à la séance</option><option value="FREE">Message libre</option></select></div><div class="field"><label>Message</label><textarea name="message" placeholder="Aucune donnée médicale sensible dans le message."></textarea></div><button class="btn primary">Préparer</button></form></section><section class="card"><h2>Historique</h2><div class="list" style="margin-top:14px">${b.comms.map(c=>`<div class="row-item"><div class="grow"><strong>${esc(c.channel)} · ${esc(c.template||'Libre')}</strong><div class="meta">${fmtDateTime(c.created_at)} · ${esc(c.status)}</div></div></div>`).join('')||'<div class="empty">Aucun envoi enregistré.</div>'}</div></section></div>`;
      $('#messageForm').onsubmit=(e)=>prepareMessage(e,p);
    }
  }
  function timelineRows(p,b){const rows=[];b.consults.forEach(c=>rows.push({d:c.occurred_at,t:'Séance',s:(c.data||{}).motive||'Note clinique'}));S.appointments.filter(a=>a.patient_id===p.id).forEach(a=>rows.push({d:a.starts_at,t:'Rendez-vous',s:a.status}));b.comms.forEach(c=>rows.push({d:c.created_at,t:`Message ${c.channel}`,s:c.template||''}));return rows.sort((a,b)=>new Date(b.d)-new Date(a.d)).slice(0,20).map(x=>`<div class="timeline-item"><strong>${esc(x.t)}</strong><div class="meta">${fmtDateTime(x.d)} · ${esc(x.s)}</div></div>`);}
  function ta(label,name,value){return `<div class="field"><label>${label}</label><textarea name="${name}">${esc(value||'')}</textarea></div>`;}

  function renderAgenda(){
    const ws=S.weekStart;const days=[0,1,2,3,4,5,6].map(i=>{const d=new Date(ws);d.setDate(d.getDate()+i);return d;});
    $('#page').innerHTML=pageHead('Agenda','Vue semaine, rapide et partagée.',`<button class="btn" id="prevWeek">←</button><button class="btn" id="todayWeek">Aujourd’hui</button><button class="btn" id="nextWeek">→</button><button class="btn primary" id="addAppt">+ Rendez-vous</button>`)+`<section class="card"><div class="week">${days.map(d=>{const key=d.toISOString().slice(0,10);const arr=S.appointments.filter(a=>a.starts_at.slice(0,10)===key).sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at));return `<div class="day-col"><div class="day-title">${d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'})}</div>${arr.map(a=>`<div class="appt"><time>${new Date(a.starts_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}</time><strong>${esc(patientName(a.patient_id))}</strong><div class="meta">${esc(a.appointment_type||'Rendez-vous')}</div><span class="badge">${esc(a.status)}</span></div>`).join('')||'<div class="tiny muted">Libre</div>'}</div>`}).join('')}</div></section>`;
    $('#prevWeek').onclick=()=>{S.weekStart=new Date(S.weekStart);S.weekStart.setDate(S.weekStart.getDate()-7);renderAgenda();};$('#nextWeek').onclick=()=>{S.weekStart=new Date(S.weekStart);S.weekStart.setDate(S.weekStart.getDate()+7);renderAgenda();};$('#todayWeek').onclick=()=>{S.weekStart=startOfWeek();renderAgenda();};$('#addAppt').onclick=()=>openAppointmentModal();
  }

  function renderTasks(){
    $('#page').innerHTML=pageHead('Tâches','Suivi administratif et clinique sans perdre le fil.',`<button class="btn primary" id="addTask">+ Nouvelle tâche</button>`)+`<section class="card"><div class="toolbar"><button class="btn sm" data-filter="OPEN">Ouvertes</button><button class="btn sm" data-filter="ALL">Toutes</button></div><div class="list" id="taskList"></div></section>`;
    let filter='OPEN';const draw=()=>{const rows=S.tasks.filter(t=>filter==='ALL'||t.status!=='DONE');$('#taskList').innerHTML=rows.map(t=>`<div class="row-item"><button class="btn sm" data-done="${t.id}">${t.status==='DONE'?'↺':'✓'}</button><div class="grow"><strong style="${t.status==='DONE'?'text-decoration:line-through;opacity:.6':''}">${esc(t.title)}</strong><div class="meta">${t.patient_id?esc(patientName(t.patient_id))+' · ':''}${t.due_at?fmtDateTime(t.due_at):'Sans échéance'}</div></div><span class="badge ${t.priority==='HIGH'?'warn':''}">${esc(t.priority)}</span></div>`).join('')||'<div class="empty">Aucune tâche.</div>';$$('[data-done]').forEach(b=>b.onclick=async()=>{const t=S.tasks.find(x=>x.id===b.dataset.done);const {error}=await S.sb.from('tasks').update({status:t.status==='DONE'?'OPEN':'DONE',updated_at:nowIso()}).eq('id',t.id);if(error)return fail(error);await loadTasks();draw();});};draw();$$('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;draw();});$('#addTask').onclick=()=>openTaskModal();
  }

  function renderStats(){
    const completed=S.appointments.filter(a=>a.status==='DONE').length;const noShow=S.appointments.filter(a=>a.status==='NO_SHOW').length;const open=S.tasks.filter(t=>t.status!=='DONE').length;const byMonth={};S.appointments.forEach(a=>{const k=a.starts_at.slice(0,7);byMonth[k]=(byMonth[k]||0)+1;});const max=Math.max(1,...Object.values(byMonth));
    $('#page').innerHTML=pageHead('Statistiques','Des indicateurs simples, sans exposer de contenu clinique.')+`<div class="grid grid4"><div class="card stat"><div class="label">Patients</div><div class="value">${S.patients.length}</div></div><div class="card stat"><div class="label">RDV suivis</div><div class="value">${S.appointments.length}</div></div><div class="card stat"><div class="label">RDV terminés</div><div class="value">${completed}</div></div><div class="card stat"><div class="label">Absences</div><div class="value">${noShow}</div></div></div><section class="card" style="margin-top:16px"><div class="card-head"><h2>Activité par mois</h2><span class="badge">${open} tâche(s) ouverte(s)</span></div><div class="grid">${Object.entries(byMonth).sort().slice(-8).map(([m,n])=>`<div><div class="metric-line"><span>${esc(m)}</span><strong>${n} RDV</strong></div><div class="bar"><span style="width:${Math.round(n/max*100)}%"></span></div></div>`).join('')||'<div class="empty">Pas assez de données.</div>'}</div></section>`;
  }

  function renderSettings(){
    const team=S.members.map(m=>`<div class="row-item"><div class="avatar">${esc((S.profiles[m.user_id]?.display_name||'?').slice(0,2).toUpperCase())}</div><div class="grow"><strong>${esc(S.profiles[m.user_id]?.display_name || (m.user_id===S.user.id?'Moi':'Membre'))}</strong><div class="meta">${esc(roleLabel(m.role))} · ${m.active?'Actif':'Inactif'}</div></div></div>`).join('');
    $('#page').innerHTML=pageHead('Paramètres','Cabinet, équipe, abonnement et compte.')+`<div class="grid grid2"><section class="card"><div class="card-head"><h2>Cabinet</h2></div><div class="metric-line"><span>Nom</span><strong>${esc(S.org.name)}</strong></div><div class="metric-line"><span>Modèle métier</span><strong>${esc(S.org.profession_template_key||'—')}</strong></div><div class="metric-line"><span>Fuseau</span><strong>${esc(S.org.timezone||'—')}</strong></div></section><section class="card"><div class="card-head"><h2>Abonnement</h2></div><div class="metric-line"><span>Offre</span><strong>${esc(S.subscription?.plan_id||'FREE')}</strong></div><div class="metric-line"><span>Statut</span><strong>${esc(S.subscription?.status||'FREE')}</strong></div><div class="metric-line"><span>Patients actifs</span><strong>${S.usage?.active_patients ?? S.patients.length}</strong></div><div class="metric-line"><span>RDV ce mois</span><strong>${S.usage?.appointments_current_month ?? '—'}</strong></div><p class="small muted" style="margin-top:12px">Stripe n’est pas encore branché. Aucun faux écran de paiement n’est affiché.</p></section><section class="card"><div class="card-head"><div><h2>Équipe</h2><p class="sub muted">Rôles réellement appliqués par la base.</p></div>${isAdmin()?'<button class="btn sm" id="inviteInfo">Inviter</button>':''}</div><div class="list">${team||'<div class="empty">Aucun membre.</div>'}</div></section><section class="card"><h2>Mon compte</h2><div class="metric-line"><span>Email</span><strong>${esc(S.user.email)}</strong></div><div class="metric-line"><span>Rôle</span><strong>${esc(roleLabel(S.member.role))}</strong></div><div style="margin-top:14px"><button class="btn" id="changePw">Changer le mot de passe</button></div></section></div>`;
    if($('#inviteInfo'))$('#inviteInfo').onclick=()=>toast('L’invitation sécurisée nécessite l’Edge Function serveur prévue au prochain lot.');$('#changePw').onclick=async()=>{const {error}=await S.sb.auth.resetPasswordForEmail(S.user.email,{redirectTo:location.origin+location.pathname});toast(error?frErr(error):'Email de changement de mot de passe envoyé.',error?'error':'');};
  }

  function renderDiagnostic(){const avg=S.perf.length?Math.round(S.perf.reduce((a,b)=>a+b.ms,0)/S.perf.length):0;$('#page').innerHTML=pageHead('Diagnostic','Mesures réelles des appels Supabase dans cette session.')+`<div class="grid grid3"><div class="card stat"><div class="label">Moyenne</div><div class="value">${avg} ms</div></div><div class="card stat"><div class="label">Appels mesurés</div><div class="value">${S.perf.length}</div></div><div class="card stat"><div class="label">Backend</div><div class="value" style="font-size:22px">Supabase</div></div></div><section class="card" style="margin-top:16px"><div class="list">${S.perf.map(x=>`<div class="row-item"><div class="grow"><strong>${esc(x.label)}</strong><div class="meta">${x.at.toLocaleTimeString('fr-FR')}</div></div><span class="badge ${x.ms<250?'ok':x.ms<800?'warn':'danger'}">${x.ms} ms</span></div>`).join('')||'<div class="empty">Aucune mesure.</div>'}</div></section>`;}

  function modal(title,html,onReady){$('#modalRoot').innerHTML=`<div class="modal-backdrop" id="modalBg"><div class="modal"><div class="modal-head"><h2>${esc(title)}</h2><button class="btn sm" id="modalClose">✕</button></div>${html}</div></div>`;$('#modalClose').onclick=closeModal;$('#modalBg').onclick=e=>{if(e.target.id==='modalBg')closeModal();};onReady?.();}
  function closeModal(){const m=$('#modalRoot');if(m)m.innerHTML='';}

  function openPatientModal(p=null){modal(p?'Modifier le patient':'Nouveau patient',`<form id="patientForm" class="form-grid"><div class="field"><label>Prénom</label><input name="first_name" required value="${esc(p?.first_name||'')}"></div><div class="field"><label>Nom</label><input name="last_name" required value="${esc(p?.last_name||'')}"></div><div class="field"><label>Téléphone E.164</label><input name="phone" placeholder="+33612345678" value="${esc(p?.phone||'')}"></div><div class="field"><label>Pays</label><input name="phone_country" maxlength="2" value="${esc(p?.phone_country||'FR')}"></div><div class="field"><label>Email</label><input name="email" type="email" value="${esc(p?.email||'')}"></div><div class="field"><label>Date de naissance</label><input name="birth_date" type="date" value="${esc(p?.birth_date||'')}"></div><div class="field full"><label>Information importante</label><textarea name="important_info">${esc(p?.important_info||'')}</textarea></div><div class="full actions"><button class="btn primary">${p?'Enregistrer':'Créer'}</button></div></form>`,()=>{$('#patientForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const row={organization_id:S.org.id,first_name:fd.get('first_name').trim(),last_name:fd.get('last_name').trim(),phone:fd.get('phone').trim()||null,phone_country:fd.get('phone_country').trim().toUpperCase()||null,email:fd.get('email').trim()||null,birth_date:fd.get('birth_date')||null,important_info:fd.get('important_info').trim()||null,updated_at:nowIso()};const q=p?S.sb.from('patients').update(row).eq('id',p.id):S.sb.from('patients').insert(row);const {error}=await q;if(error)return fail(error);await loadPatients();closeModal();toast(p?'Patient mis à jour.':'Patient créé.');render();};});}

  function openAppointmentModal(patientId=''){modal('Nouveau rendez-vous',`<form id="apptForm" class="form-grid"><div class="field full"><label>Patient</label><select name="patient_id" required><option value="">Choisir…</option>${S.patients.map(p=>`<option value="${p.id}" ${p.id===patientId?'selected':''}>${esc(p.first_name+' '+p.last_name)}</option>`).join('')}</select></div><div class="field"><label>Début</label><input name="starts_at" type="datetime-local" required></div><div class="field"><label>Durée (min)</label><input name="duration" type="number" min="10" step="5" value="30"></div><div class="field"><label>Type</label><input name="appointment_type" value="Consultation"></div><div class="field"><label>Lieu</label><input name="location"></div><div class="full actions"><button class="btn primary">Créer</button></div></form>`,()=>{$('#apptForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const start=new Date(fd.get('starts_at'));const end=new Date(start.getTime()+Number(fd.get('duration'))*60000);const {error}=await S.sb.from('appointments').insert({organization_id:S.org.id,patient_id:fd.get('patient_id'),practitioner_user_id:isClinical()?S.user.id:null,starts_at:start.toISOString(),ends_at:end.toISOString(),status:'BOOKED',appointment_type:fd.get('appointment_type')||null,location:fd.get('location')||null});if(error)return fail(error);await loadAppointments();closeModal();toast('Rendez-vous créé.');render();};});}

  function openTaskModal(){modal('Nouvelle tâche',`<form id="taskForm" class="form-grid"><div class="field full"><label>Titre</label><input name="title" required></div><div class="field"><label>Patient</label><select name="patient_id"><option value="">Aucun</option>${S.patients.map(p=>`<option value="${p.id}">${esc(p.first_name+' '+p.last_name)}</option>`).join('')}</select></div><div class="field"><label>Priorité</label><select name="priority"><option>NORMAL</option><option>HIGH</option><option>LOW</option></select></div><div class="field full"><label>Échéance</label><input name="due_at" type="datetime-local"></div><div class="full"><button class="btn primary">Créer</button></div></form>`,()=>{$('#taskForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('tasks').insert({organization_id:S.org.id,title:fd.get('title').trim(),patient_id:fd.get('patient_id')||null,priority:fd.get('priority'),status:'OPEN',due_at:fd.get('due_at')?new Date(fd.get('due_at')).toISOString():null});if(error)return fail(error);await loadTasks();closeModal();toast('Tâche créée.');renderTasks();};});}

  function openAlertModal(p){modal('Ajouter une alerte',`<form id="alertForm" class="form-grid"><div class="field full"><label>Alerte</label><input name="label" required></div><div class="field full"><label>Niveau</label><select name="severity"><option>INFO</option><option>MEDIUM</option><option>HIGH</option></select></div><div class="full"><button class="btn primary">Ajouter</button></div></form>`,()=>{$('#alertForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('patient_alerts').insert({organization_id:S.org.id,patient_id:p.id,label:fd.get('label').trim(),severity:fd.get('severity'),active:true});if(error)return fail(error);closeModal();toast('Alerte ajoutée.');renderPatient();};});}

  function openGoalModal(p){modal('Nouvel objectif',`<form id="goalForm" class="form-grid"><div class="field full"><label>Titre</label><input name="title" required></div><div class="field"><label>Progression</label><input name="progress" type="number" min="0" max="100" value="0"></div><div class="field"><label>Date cible</label><input name="target_date" type="date"></div><div class="field full"><label>Description</label><textarea name="description"></textarea></div><div class="full"><button class="btn primary">Créer</button></div></form>`,()=>{$('#goalForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('goals').insert({organization_id:S.org.id,patient_id:p.id,title:fd.get('title').trim(),description:fd.get('description')||null,progress:Number(fd.get('progress')||0),status:'ACTIVE',target_date:fd.get('target_date')||null,created_by:S.user.id});if(error)return fail(error);closeModal();toast('Objectif créé.');renderPatient();};});}

  function openMeasureDefinitionModal(defs){modal('Types de mesure',`<div class="list">${defs.map(d=>`<div class="row-item"><div class="grow"><strong>${esc(d.name)}</strong><div class="meta">${esc(d.unit||'Sans unité')} · ${esc(d.direction)}</div></div></div>`).join('')||'<div class="empty">Aucun type.</div>'}</div><div class="divider"></div><form id="defForm" class="form-grid"><div class="field"><label>Nom</label><input name="name" required></div><div class="field"><label>Unité</label><input name="unit"></div><div class="field"><label>Sens</label><select name="direction"><option value="TARGET">Cible</option><option value="UP">Mieux si augmente</option><option value="DOWN">Mieux si diminue</option></select></div><div class="field"><label>Cible</label><input name="target_value" type="number" step="any"></div><div class="full"><button class="btn primary">Créer</button></div></form>`,()=>{$('#defForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('measure_definitions').insert({organization_id:S.org.id,name:fd.get('name').trim(),unit:fd.get('unit')||null,direction:fd.get('direction'),target_value:fd.get('target_value')||null,active:true});if(error)return fail(error);closeModal();toast('Type de mesure créé.');renderPatient();};});}

  function openMeasureModal(p,defs){if(!defs.length){toast('Crée d’abord un type de mesure.','error');return openMeasureDefinitionModal(defs);}modal('Ajouter une mesure',`<form id="measureForm" class="form-grid"><div class="field full"><label>Mesure</label><select name="measure_definition_id">${defs.map(d=>`<option value="${d.id}">${esc(d.name)} ${esc(d.unit||'')}</option>`).join('')}</select></div><div class="field"><label>Valeur</label><input name="value" type="number" step="any" required></div><div class="field"><label>Date</label><input name="measured_at" type="datetime-local"></div><div class="full"><button class="btn primary">Ajouter</button></div></form>`,()=>{$('#measureForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const {error}=await S.sb.from('measure_values').insert({organization_id:S.org.id,patient_id:p.id,measure_definition_id:fd.get('measure_definition_id'),value:Number(fd.get('value')),measured_at:fd.get('measured_at')?new Date(fd.get('measured_at')).toISOString():nowIso(),created_by:S.user.id});if(error)return fail(error);closeModal();toast('Mesure ajoutée.');renderPatient();};});}

  function openConsultationModal(p){modal('Nouvelle séance',`<form id="consultForm" class="form-grid"><div class="field"><label>Date</label><input name="occurred_at" type="datetime-local"></div><div class="field"><label>Douleur /10</label><input name="painScore" type="number" min="0" max="10"></div><div class="field full"><label>Motif</label><input name="motive"></div>${ta('Observations','observations','')}${ta('Traitement','treatment','')}${ta('Recommandations','recommendations','')}${ta('Suivi','followUp','')}<div class="full"><button class="btn primary">Enregistrer</button></div></form>`,()=>{$('#consultForm').onsubmit=async(e)=>{e.preventDefault();const fd=new FormData(e.target);const data={motive:fd.get('motive')||'',painScore:fd.get('painScore')===''?null:Number(fd.get('painScore')),observations:fd.get('observations')||'',treatment:fd.get('treatment')||'',recommendations:fd.get('recommendations')||'',followUp:fd.get('followUp')||''};const {error}=await S.sb.from('consultations').insert({organization_id:S.org.id,patient_id:p.id,practitioner_user_id:S.user.id,status:'FINAL',data,occurred_at:fd.get('occurred_at')?new Date(fd.get('occurred_at')).toISOString():nowIso()});if(error)return fail(error);closeModal();toast('Séance enregistrée.');renderPatient();};});}

  async function prepareMessage(e,p){e.preventDefault();const fd=new FormData(e.target);const channel=fd.get('channel'),message=fd.get('message').trim()||defaultMessage(fd.get('template'),p);if(channel==='EMAIL'){toast('Email serveur non activé : branche Resend/Brevo via Edge Function.','error');return;}if(!p.phone){toast('Ce patient n’a pas de téléphone.','error');return;}const {error}=await S.sb.from('communications').insert({organization_id:S.org.id,patient_id:p.id,channel,template:fd.get('template'),subject:null,status:'PREPARED',author:S.user.id});if(error)return fail(error);const tel=p.phone.replace(/[^+0-9]/g,'');const url=channel==='WHATSAPP'?`https://wa.me/${tel.replace('+','')}?text=${encodeURIComponent(message)}`:`sms:${tel}?body=${encodeURIComponent(message)}`;window.open(url,'_blank','noopener');toast(`${channel} préparé.`);renderPatient();}
  function defaultMessage(template,p){const next=S.appointments.filter(a=>a.patient_id===p.id&&new Date(a.starts_at)>=new Date()&&a.status!=='CANCELLED').sort((a,b)=>new Date(a.starts_at)-new Date(b.starts_at))[0];if(template==='REMINDER'&&next)return `Bonjour ${p.first_name}, rappel de votre rendez-vous le ${fmtDateTime(next.starts_at)}. À bientôt.`;if(template==='CONFIRMATION'&&next)return `Bonjour ${p.first_name}, votre rendez-vous du ${fmtDateTime(next.starts_at)} est bien confirmé.`;if(template==='FOLLOW_UP')return `Bonjour ${p.first_name}, j’espère que vous allez bien. N’hésitez pas à me répondre si besoin.`;return `Bonjour ${p.first_name}, `;}

  boot();
})();
