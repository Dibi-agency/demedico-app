(() => {
  'use strict';

  const MORE_SELECTOR = '#mobileBottomNav [data-more]';
  const ROUTES = [
    ['stats', 'Statistiques'],
    ['integrations', 'Intégrations'],
    ['subscription', 'Abonnement'],
    ['settings', 'Paramètres'],
    ['diagnostic', 'Diagnostic']
  ];

  let lastActivationAt = 0;

  const trigger = () => document.querySelector(MORE_SELECTOR);
  const root = () => document.getElementById('mobileMoreRoot');

  function iconMarkup(route) {
    return document.querySelector(`#nav [data-route="${route}"] .nav-ico`)?.innerHTML || '';
  }

  function closeMore({ restoreFocus = true } = {}) {
    const host = root();
    if (host) host.innerHTML = '';
    const button = trigger();
    if (button) {
      button.setAttribute('aria-expanded', 'false');
      if (restoreFocus) requestAnimationFrame(() => button.focus());
    }
  }

  function openMore() {
    const host = root();
    const button = trigger();
    if (!host || !button) return;

    if (host.querySelector('.mobile-more-backdrop')) return;

    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-controls', 'mobileMoreRoot');
    button.setAttribute('aria-expanded', 'true');

    const items = ROUTES.map(([route, label]) => `
      <button type="button" data-mobile-plus-route="${route}" class="mobile-more-item">
        <span class="nav-ico">${iconMarkup(route)}</span>
        <span>${label}</span>
        <b aria-hidden="true">›</b>
      </button>`).join('');

    host.innerHTML = `
      <div class="mobile-more-backdrop" id="mobilePlusBackdrop">
        <section class="mobile-more-sheet" role="dialog" aria-modal="true" aria-labelledby="mobilePlusTitle">
          <div class="sheet-handle" aria-hidden="true"></div>
          <div class="mobile-more-head">
            <div>
              <span class="eyebrow">Navigation</span>
              <h2 id="mobilePlusTitle">Plus</h2>
            </div>
            <button type="button" class="icon-btn" id="mobilePlusClose" aria-label="Fermer">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </div>
          <div class="mobile-more-grid">${items}</div>
          <div class="mobile-more-account">
            <div>
              <strong id="mobilePlusEmail"></strong>
              <span id="mobilePlusMeta"></span>
            </div>
            <button type="button" class="link" id="mobilePlusLogout">Se déconnecter</button>
          </div>
        </section>
      </div>`;

    const sourceEmail = document.querySelector('.user-card strong')?.textContent || '';
    const sourceMeta = document.querySelector('.user-card .meta')?.textContent || '';
    const email = document.getElementById('mobilePlusEmail');
    const meta = document.getElementById('mobilePlusMeta');
    if (email) email.textContent = sourceEmail;
    if (meta) meta.textContent = sourceMeta;

    document.getElementById('mobilePlusClose')?.addEventListener('click', () => closeMore());
    document.getElementById('mobilePlusBackdrop')?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closeMore();
    });

    host.querySelectorAll('[data-mobile-plus-route]').forEach((item) => {
      item.addEventListener('click', () => {
        const route = item.getAttribute('data-mobile-plus-route');
        const destination = route ? document.querySelector(`#nav [data-route="${route}"]`) : null;
        closeMore({ restoreFocus: false });
        destination?.click();
      });
    });

    document.getElementById('mobilePlusLogout')?.addEventListener('click', () => {
      document.getElementById('logoutBtn')?.click();
    });

    requestAnimationFrame(() => document.getElementById('mobilePlusClose')?.focus());
  }

  function isMoreEvent(event) {
    const target = event.target;
    return target instanceof Element ? target.closest(MORE_SELECTOR) : null;
  }

  function activate(event) {
    const button = isMoreEvent(event);
    if (!button) return false;

    const now = Date.now();
    if (now - lastActivationAt < 450) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      return true;
    }

    lastActivationAt = now;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    openMore();
    return true;
  }

  document.addEventListener('pointerup', activate, true);
  document.addEventListener('click', activate, true);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && root()?.children.length) {
      event.preventDefault();
      event.stopPropagation();
      closeMore();
    }
  }, true);
})();
