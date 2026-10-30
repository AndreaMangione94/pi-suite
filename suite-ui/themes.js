'use strict';

/** @enum {string} Enum dei temi; nessuna dipendenza o compilazione richiesta. */
const ThemeType = Object.freeze({ LIGHT: 'light', DARK: 'dark' });

const SuiteTheme = (() => {
  const common = {
    'font-body': "'Segoe UI', Arial, sans-serif",
    'font-mono': 'Consolas, monospace',
    'font-brand': 'Georgia, serif',
  };
  // Ogni tema dichiara lo stesso contratto di token. Layout e componenti
  // consumano soltanto variabili CSS, senza condizioni sul tema attivo.
  const themes = Object.freeze({
    [ThemeType.LIGHT]: Object.freeze({
      label: 'Chiaro · Salvia',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="none" stroke="black" stroke-width="2" stroke-linecap="round"><circle cx="16" cy="16" r="6"/><path d="M16 2v4m0 20v4M2 16h4m20 0h4M6 6l3 3m14 14 3 3M6 26l3-3M23 9l3-3"/></svg>',
      css: Object.freeze({
        ...common, 'color-scheme': 'light',
        ink: '#20312d', muted: '#69756e', bg: '#f5f6f1',
        surface: '#ffffff', 'surface-muted': '#edf1e7', sidebar: '#eef1e7',
        line: '#dfe4d9', 'input-line': '#d4dbd1',
        accent: '#234e3c', 'on-accent': '#ffffff', 'accent-soft': '#d9ef9b',
        focus: '#7a9a4a', 'caption-ink': '#73806a', 'subtle-ink': '#64735b',
        'secondary-line': '#d7dfcc', 'link-ink': '#52713d',
        'success-ink': '#315330', 'success-bg': '#eaf1dc', 'success-line': '#b4c59e',
        'status-dot': '#609549', 'pill-ink': '#45623a', 'pill-bg': '#e9efdf',
        'info-bg': '#edf2e5', 'info-line': '#a3bd72',
        'warning-bg': '#f8f1e5', 'warning-line': '#e6d4b7', 'warning-ink': '#77552c',
        'error-bg': '#fff0e8', 'error-line': '#dfae92', 'error-ink': '#8f3e20',
        'graph-bg': '#f7f9f2', 'graph-line': '#bac8aa', 'graph-label': '#36503b',
        'graph-node': '#355d45', 'graph-node-line': '#d8e8bf',
        'code-bg': '#182b23', 'code-ink': '#e3edda',
        'file-icon-bg': '#e8efda',
        shadow: '0 6px 24px #20312d05', 'logo-shadow': '0 12px 20px #234e3c22',
        'dialog-shadow': '0 25px 100px #182b2340', 'tooltip-shadow': '0 8px 24px #183e2420',
        backdrop: '#182b2370', 'hover-filter': 'brightness(.97)',
        'radius-control': '8px', 'radius-card': '12px', 'radius-dialog': '16px',
        'radius-brand': '12px',
      }),
    }),
    [ThemeType.DARK]: Object.freeze({
      label: 'Dark · Grafite',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M19 3A13 13 0 1 0 29 22 12 12 0 0 1 19 3Z"/><path d="m26 2 1.2 3.8L31 7l-3.8 1.2L26 12l-1.2-3.8L21 7l3.8-1.2ZM24 15l.8 2.2L27 18l-2.2.8L24 21l-.8-2.2L21 18l2.2-.8Z"/></svg>',
      css: Object.freeze({
        ...common, 'color-scheme': 'dark',
        ink: '#e8e9f1', muted: '#a0a5b8', bg: '#13151d',
        surface: '#1c1f2b', 'surface-muted': '#252938', sidebar: '#181b25',
        line: '#323749', 'input-line': '#41485f',
        accent: '#bcb0ff', 'on-accent': '#211b39', 'accent-soft': '#393151',
        focus: '#c9bfff', 'caption-ink': '#9ca2bb', 'subtle-ink': '#a8aec6',
        'secondary-line': '#42485f', 'link-ink': '#c9bfff',
        'success-ink': '#afe4c4', 'success-bg': '#20382e', 'success-line': '#426c56',
        'status-dot': '#8dd5aa', 'pill-ink': '#c9c0f8', 'pill-bg': '#302b43',
        'info-bg': '#28263c', 'info-line': '#9281d9',
        'warning-bg': '#393023', 'warning-line': '#79613b', 'warning-ink': '#edcc92',
        'error-bg': '#3c252d', 'error-line': '#86505b', 'error-ink': '#ffb7bd',
        'graph-bg': '#181b26', 'graph-line': '#54516f', 'graph-label': '#d5cfff',
        'graph-node': '#a99ae9', 'graph-node-line': '#39324e',
        'code-bg': '#10121a', 'code-ink': '#d6dbef',
        'file-icon-bg': '#302b43',
        shadow: '0 6px 24px #00000020', 'logo-shadow': '0 12px 20px #00000030',
        'dialog-shadow': '0 25px 100px #00000080', 'tooltip-shadow': '0 8px 24px #00000050',
        backdrop: '#080a12b3', 'hover-filter': 'brightness(1.08)',
        'radius-control': '6px', 'radius-card': '10px', 'radius-dialog': '14px',
        'radius-brand': '16px',
      }),
    }),
  });
  const isTheme = value => Object.hasOwn(themes, value);
  let activeTheme = ThemeType.LIGHT;

  function apply(value) {
    if (!isTheme(value)) throw new RangeError('Tema non disponibile: ' + value);
    activeTheme = value;
    const theme = themes[activeTheme], root = document.documentElement;
    for (const [name, parameter] of Object.entries(theme.css)) root.style.setProperty('--' + name, parameter);
    root.style.setProperty('--brand-icon', 'url("data:image/svg+xml,' + encodeURIComponent(theme.icon) + '")');
    root.dataset.theme = activeTheme;
    const select = document.getElementById('theme-select');
    if (select) select.value = activeTheme;
  }

  // Script sincrono nell'head: ogni apertura riparte dal tema predefinito.
  apply(activeTheme);

  document.addEventListener('DOMContentLoaded', () => {
    const select = document.getElementById('theme-select');
    for (const [value, theme] of Object.entries(themes)) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = theme.label;
      select.append(option);
    }
    select.value = activeTheme;
    select.addEventListener('change', () => { SuiteTheme.current = select.value; });
  });

  return Object.freeze({
    types: ThemeType,
    themes,
    get current() { return activeTheme; },
    // Unica variabile pubblica: aggiorna CSS, icona e selettore solo in memoria.
    set current(value) {
      apply(value);
    },
  });
})();
