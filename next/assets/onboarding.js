(() => {
  'use strict';

  const CFG = window.__DEMEDICO_CONFIG__;
  const LOGO = window.__DEMEDICO_LOGO__;
  const root = document.body;
  const $ = (selector, el = document) => el.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function recoveryRequestedInUrl() {
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(location.search);
    return hash.get('type') === 'recovery' || query.get('type') === 'recovery';
  }

  function loadMainApp() {
    if (document.querySelector('script[data-demedico-main]')) return;
    const script = document.createElement('script');
    script.dataset.demedicoMain = '1';
    script.src = window.__DEMEDICO_APP_ASSET__ || 'assets/app.js';
    script.onerror = () => fatal('Impossible de charger Demédico. Recharge la page.');
    document.body.appendChild(script);
  }

  async function ensureSupabase() {
    if (window.supabase?.createClient) return;
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Bibliothèque Supabase indisponible.'));
      document.head.appendChild(script);
    });
  }

  function toast(message, type = '') {
    let box = $('#toasts');
    if (!box) {
      box = document.createElement('div');
      box.id = 'toasts';
      box.className = 'toasts';
      document.body.appendChild(box);
    }
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.setAttribute('role', type === 'error' ? 'alert' : 'status');
    item.textContent = message;
    box.appendChild(item);
    setTimeout(() => item.remove(), 4200);
  }

  function humanError(error) {
    const message = error?.message || String(error || 'Erreur inconnue');
    if (/INVITE_REQUIRED/.test(message)) return 'Cette adresse doit recevoir une invitation Demédico avant de créer un espace.';
    if (/MEMBERSHIP_EXISTS/.test(message)) return 'Un espace Demédico est déjà associé à ce compte.';
    if (/INVALID_DISPLAY_NAME/.test(message)) return 'Vérifie ton nom et prénom.';
    if (/INVALID_ORGANIZATION_NAME/.test(message)) return 'Le nom du cabinet doit contenir entre 2 et 120 caractères.';
    if (/INVALID_PROFESSION/.test(message)) return 'Profession non reconnue.';
    if (/INVALID_COUNTRY/.test(message)) return 'Pays d’exercice non reconnu.';
    if (/JWT|session|auth/i.test(message)) return 'Ta session a expiré. Ouvre à nouveau ton lien d’invitation.';
    return message;
  }

  function fatal(message) {
    root.innerHTML = `<section class="onboarding"><div class="onboarding-card onboarding-error"><img class="onboarding-logo" src="${LOGO}" alt="Demédico"><span class="eyebrow">Bêta privée</span><h1>Impossible de continuer</h1><p>${esc(message)}</p><button type="button" class="btn primary" id="onboardingReload">Réessayer</button></div></section><div id="toasts" class="toasts"></div>`;
    $('#onboardingReload')?.addEventListener('click', () => location.reload());
  }

  function progress(step) {
    return `<div class="onboarding-progress" aria-label="Étape ${step} sur 2"><div class="onboarding-progress-line"><span style="width:${step === 1 ? '50' : '100'}%"></span></div><div class="onboarding-progress-meta"><strong>Étape ${step} sur 2</strong><span>${step === 1 ? 'Compte' : 'Cabinet'}</span></div></div>`;
  }

  function shell(content, step) {
    root.innerHTML = `<section class="onboarding"><div class="onboarding-card"><div class="onboarding-brand"><img class="onboarding-logo" src="${LOGO}" alt="Demédico"><span class="onboarding-beta">Bêta privée</span></div>${progress(step)}${content}<p class="onboarding-safety">Environnement de test. Utilise uniquement des patients et des informations fictifs.</p><button type="button" class="onboarding-signout" id="onboardingSignOut">Se déconnecter</button></div></section><div id="toasts" class="toasts"></div>`;
  }

  function renderPasswordStep(client, session, state) {
    shell(`<div class="onboarding-copy"><span class="eyebrow">Sécurité du compte</span><h1>Sécurisez votre accès</h1><p>Choisissez le mot de passe que vous utiliserez pour vous connecter à Demédico.</p></div><div class="onboarding-email">${esc(session.user.email || '')}</div><form id="onboardingPasswordForm" class="onboarding-form" novalidate><div class="field"><label for="onboardingPassword">Nouveau mot de passe</label><input id="onboardingPassword" type="password" autocomplete="new-password" minlength="12" required aria-describedby="onboardingPasswordRule"></div><div class="field"><label for="onboardingPasswordConfirm">Confirmer le mot de passe</label><input id="onboardingPasswordConfirm" type="password" autocomplete="new-password" minlength="12" required></div><p id="onboardingPasswordRule" class="onboarding-hint">12 caractères minimum.</p><button class="btn primary onboarding-primary" type="submit">Continuer</button></form>`, 1);

    $('#onboardingPasswordForm').onsubmit = async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.target);
      const password = $('#onboardingPassword').value;
      const confirmation = $('#onboardingPasswordConfirm').value;
      if (password.length < 12) return toast('Le mot de passe doit contenir au moins 12 caractères.', 'error');
      if (password !== confirmation) return toast('Les deux mots de passe ne correspondent pas.', 'error');
      button.disabled = true;
      try {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        state.passwordSet = true;
        renderCabinetStep(client, session, state);
      } catch (error) {
        toast(humanError(error), 'error');
      } finally {
        if (document.body.contains(button)) button.disabled = false;
      }
    };

    bindSignOut(client);
    setTimeout(() => $('#onboardingPassword')?.focus(), 0);
  }

  function renderCabinetStep(client, session, state) {
    const guessedName = String(session.user.user_metadata?.full_name || session.user.user_metadata?.name || '').trim();
    shell(`<div class="onboarding-copy"><span class="eyebrow">Votre espace de test</span><h1>Créons votre cabinet</h1><p>Quelques informations suffisent. Votre espace sera isolé des autres cabinets et configuré pour la bêta.</p></div><form id="onboardingCabinetForm" class="onboarding-form" novalidate><div class="field"><label for="onboardingDisplayName">Nom et prénom</label><input id="onboardingDisplayName" type="text" autocomplete="name" maxlength="100" value="${esc(guessedName)}" placeholder="Ex. Camille Martin" required></div><div class="field"><label for="onboardingOrgName">Nom du cabinet</label><input id="onboardingOrgName" type="text" autocomplete="organization" maxlength="120" placeholder="Ex. Cabinet Martin" required></div><div class="onboarding-grid2"><div class="field"><label for="onboardingProfession">Profession</label><select id="onboardingProfession" required><option value="">Choisir…</option><option value="PHYSIO">Kinésithérapie</option><option value="OSTEO">Ostéopathie</option><option value="NUTRITION">Diététique / nutrition</option><option value="APA">Activité physique adaptée</option><option value="COACH">Coaching sportif</option><option value="OTHER">Autre profession</option></select></div><div class="field"><label for="onboardingCountry">Pays d’exercice</label><select id="onboardingCountry" required><option value="FR">France</option><option value="IL">Israël</option><option value="OTHER">Autre pays</option></select></div></div><label class="onboarding-consent"><input id="onboardingConsent" type="checkbox" required><span>Je confirme utiliser uniquement des données fictives pendant cette phase de test.</span></label><button class="btn primary onboarding-primary" type="submit">Créer mon espace de test</button><button class="onboarding-back" type="button" id="onboardingBack">Retour</button></form>`, 2);

    $('#onboardingBack').onclick = () => renderPasswordStep(client, session, state);
    $('#onboardingCabinetForm').onsubmit = async (event) => {
      event.preventDefault();
      const button = $('button[type="submit"]', event.target);
      const displayName = $('#onboardingDisplayName').value.trim();
      const organizationName = $('#onboardingOrgName').value.trim();
      const profession = $('#onboardingProfession').value;
      const country = $('#onboardingCountry').value;
      if (displayName.length < 2) return toast('Indique ton nom et prénom.', 'error');
      if (organizationName.length < 2) return toast('Indique le nom de ton cabinet.', 'error');
      if (!profession) return toast('Choisis ta profession.', 'error');
      if (!$('#onboardingConsent').checked) return toast('Confirme l’utilisation exclusive de données fictives.', 'error');

      button.disabled = true;
      try {
        const { data, error } = await client.rpc('bootstrap_beta_cabinet', {
          p_display_name: displayName,
          p_organization_name: organizationName,
          p_profession_template_key: profession,
          p_country_of_practice: country
        });
        if (error) throw error;
        if (!data?.organization_id) throw new Error('La création du cabinet n’a pas été confirmée.');
        renderSuccess(organizationName);
        setTimeout(() => location.reload(), 900);
      } catch (error) {
        if (/MEMBERSHIP_EXISTS/.test(error?.message || '')) return location.reload();
        toast(humanError(error), 'error');
        button.disabled = false;
      }
    };

    bindSignOut(client);
    setTimeout(() => $('#onboardingDisplayName')?.focus(), 0);
  }

  function renderSuccess(organizationName) {
    root.innerHTML = `<section class="onboarding"><div class="onboarding-card onboarding-success"><div class="onboarding-success-mark" aria-hidden="true">✓</div><span class="eyebrow">Espace créé</span><h1>Bienvenue sur Demédico</h1><p><strong>${esc(organizationName)}</strong> est prêt. Ouverture de votre espace de test…</p></div></section><div id="toasts" class="toasts"></div>`;
  }

  function renderNotEligible(client) {
    root.innerHTML = `<section class="onboarding"><div class="onboarding-card onboarding-error"><img class="onboarding-logo" src="${LOGO}" alt="Demédico"><span class="eyebrow">Accès Demédico</span><h1>Invitation requise</h1><p>Ce compte n’est associé à aucun cabinet et n’a pas d’invitation bêta valide.</p><button type="button" class="btn primary" id="onboardingSignOut">Revenir à la connexion</button></div></section><div id="toasts" class="toasts"></div>`;
    bindSignOut(client);
  }

  function bindSignOut(client) {
    $('#onboardingSignOut')?.addEventListener('click', async () => {
      try { await client.auth.signOut({ scope: 'local' }); } catch (_) {}
      location.reload();
    });
  }

  async function start() {
    if (recoveryRequestedInUrl()) return loadMainApp();
    if (!CFG?.url || !CFG?.publishableKey) return fatal('Configuration Demédico indisponible.');

    try {
      await ensureSupabase();
      const client = window.supabase.createClient(CFG.url, CFG.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data: { session }, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session) return loadMainApp();

      const { data: memberships, error: membershipError } = await client
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', session.user.id)
        .eq('active', true)
        .limit(1);
      if (membershipError) throw membershipError;
      if (memberships?.length) return loadMainApp();

      const { data: status, error: statusError } = await client.rpc('beta_onboarding_status');
      if (statusError) throw statusError;
      if (!status?.eligible) return renderNotEligible(client);

      renderPasswordStep(client, session, { passwordSet: false });
    } catch (error) {
      console.error('[Demédico onboarding]', error);
      fatal(humanError(error));
    }
  }

  start();
})();
