window.DEMEDICO_API = "https://script.google.com/macros/s/AKfycbyXqN6bmNEUICZW55XqTiAYgeCYWCQ9I7DMWBvGpfY0-1z92XGU2SvCufuiD63Y3hOYgg/exec";

/* Mobile-only login password reveal.
   Scoped to #lPw so no other form, auth flow or desktop behavior is changed. */
(() => {
  const MOBILE_QUERY = '(max-width: 820px)';
  const STYLE_ID = 'dm-mobile-password-toggle-style';

  function installStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      @media (max-width: 820px) {
        #dmAuth .dm-password-wrap {
          position: relative;
          width: 100%;
        }
        #dmAuth .dm-password-wrap > #lPw {
          padding-right: 58px !important;
        }
        #dmAuth .dm-password-toggle {
          position: absolute;
          top: 50%;
          right: 6px;
          transform: translateY(-50%);
          width: 44px;
          height: 44px;
          min-height: 44px;
          padding: 0;
          border: 0;
          border-radius: 10px;
          background: transparent;
          color: #52676B;
          display: grid;
          place-items: center;
          z-index: 2;
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
        }
        #dmAuth .dm-password-toggle svg {
          width: 22px;
          height: 22px;
          pointer-events: none;
        }
        #dmAuth .dm-password-toggle:focus-visible {
          outline: 2px solid #2C8E87;
          outline-offset: 1px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function eyeIcon(visible) {
    return visible
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 4.2A10.8 10.8 0 0 1 12 4c5.2 0 9 4.3 10 8a11.8 11.8 0 0 1-2.1 3.9"/><path d="M6.2 6.2A12.5 12.5 0 0 0 2 12c1 3.7 4.8 8 10 8 1.7 0 3.2-.5 4.6-1.2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  }

  function enhanceLoginPassword() {
    if (!window.matchMedia || !window.matchMedia(MOBILE_QUERY).matches) return;

    const input = document.getElementById('lPw');
    if (!input || input.dataset.mobileReveal === '1') return;

    const wrap = document.createElement('div');
    wrap.className = 'dm-password-wrap';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'dm-password-toggle';
    button.setAttribute('aria-label', 'Afficher le mot de passe');
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = eyeIcon(false);

    button.addEventListener('click', () => {
      const reveal = input.type === 'password';
      input.type = reveal ? 'text' : 'password';
      button.setAttribute('aria-label', reveal ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      button.setAttribute('aria-pressed', String(reveal));
      button.innerHTML = eyeIcon(reveal);
      try { input.focus({ preventScroll: true }); } catch (_) { input.focus(); }
    });

    wrap.appendChild(button);
    input.dataset.mobileReveal = '1';
  }

  function init() {
    installStyle();
    enhanceLoginPassword();
    new MutationObserver(enhanceLoginPassword).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
