(() => {
  'use strict';

  const CFG = window.__DEMEDICO_CONFIG__;
  const LOGO = window.__DEMEDICO_LOGO__;
  const ONBOARDING_ASSET = window.__DEMEDICO_ONBOARDING_ASSET__ || 'assets/onboarding.js';
  const root = document.body;

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function loadOnboarding() {
    if (document.querySelector('script[data-demedico-onboarding]')) return;
    const script = document.createElement('script');
    script.dataset.demedicoOnboarding = '1';
    script.src = ONBOARDING_ASSET;
    script.onerror = () => renderError('Impossible de charger Demédico. Recharge la page.');
    document.body.appendChild(script);
  }

  function cleanAuthParams() {
    const url = new URL(location.href);
    url.searchParams.delete('token_hash');
    url.searchParams.delete('type');
    url.searchParams.delete('error');
    url.searchParams.delete('error_code');
    url.searchParams.delete('error_description');
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    hash.delete('invite_token_hash');
    hash.delete('token_hash');
    hash.delete('type');
    hash.delete('error');
    hash.delete('error_code');
    hash.delete('error_description');
    const hashString = hash.toString();
    url.hash = hashString ? `#${hashString}` : '';
    history.replaceState({}, document.title, url.pathname + url.search + url.hash);
  }

  function authInput() {
    const query = new URLSearchParams(location.search);
    const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    const inviteTokenHash = hash.get('invite_token_hash');
    const genericTokenHash = query.get('token_hash') || hash.get('token_hash');
    const type = query.get('type') || hash.get('type') || (inviteTokenHash ? 'invite' : '');
    return {
      tokenHash: inviteTokenHash || genericTokenHash || '',
      type,
      errorCode: query.get('error_code') || hash.get('error_code') || '',
      errorDescription: query.get('error_description') || hash.get('error_description') || ''
    };
  }

  function shell({ eyebrow, title, text, actionLabel = '', actionId = '' }) {
    root.innerHTML = `
      <section class="onboarding">
        <div class="onboarding-card">
          <div class="onboarding-brand">
            <img class="onboarding-logo" src="${LOGO}" alt="Demédico">
            <span class="onboarding-beta">Bêta privée</span>
          </div>
          <div class="onboarding-copy">
            <span class="eyebrow">${esc(eyebrow)}</span>
            <h1>${esc(title)}</h1>
            <p>${esc(text)}</p>
          </div>
          ${actionLabel && actionId ? `<button type="button" class="btn primary onboarding-primary" id="${actionId}">${esc(actionLabel)}</button>` : ''}
          <p class="onboarding-safety">Environnement de test. Utilise uniquement des patients et des informations fictifs.</p>
        </div>
      </section>
      <div id="toasts" class="toasts"></div>`;
  }

  function renderError(message) {
    shell({
      eyebrow: 'Accès Demédico',
      title: 'Lien d’activation non valide',
      text: message,
      actionLabel: 'Revenir à la connexion',
      actionId: 'authBootstrapBack'
    });
    document.getElementById('authBootstrapBack')?.addEventListener('click', () => {
      cleanAuthParams();
      location.reload();
    });
  }

  function renderInviteGate(client, tokenHash) {
    shell({
      eyebrow: 'Invitation Demédico',
      title: 'Votre accès est prêt',
      text: 'Confirmez votre invitation pour sécuriser votre compte puis créer votre cabinet de test.',
      actionLabel: 'Activer mon accès',
      actionId: 'authBootstrapActivate'
    });

    const button = document.getElementById('authBootstrapActivate');
    button?.addEventListener('click', async () => {
      button.disabled = true;
      const initialLabel = button.textContent;
      button.textContent = 'Activation…';
      try {
        const { error } = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'invite' });
        if (error) throw error;
        cleanAuthParams();
        loadOnboarding();
      } catch (error) {
        console.error('[Demédico invite activation]', error);
        renderError('Ce lien a expiré ou a déjà été utilisé. Une nouvelle invitation Demédico doit être envoyée.');
      } finally {
        if (document.body.contains(button)) {
          button.disabled = false;
          button.textContent = initialLabel;
        }
      }
    });
  }

  async function start() {
    const input = authInput();

    if (input.errorCode || /expired|invalid/i.test(input.errorDescription)) {
      cleanAuthParams();
      return renderError('Ce lien a expiré ou a déjà été utilisé. Une nouvelle invitation Demédico doit être envoyée.');
    }

    if (!input.tokenHash || input.type !== 'invite') return loadOnboarding();
    if (!CFG?.url || !CFG?.publishableKey || !window.supabase?.createClient) {
      return renderError('Configuration d’authentification indisponible. Recharge la page.');
    }

    const client = window.supabase.createClient(CFG.url, CFG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });

    renderInviteGate(client, input.tokenHash);
  }

  start();
})();
