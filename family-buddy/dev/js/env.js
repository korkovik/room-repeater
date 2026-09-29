// @ts-check
/**
 * Environment detection and env chrome (spec R3, R17, Data "Storage").
 * The same file is loaded by index.html (via app.js) and by the static privacy pages,
 * where it applies the banner and the robots meta on its own. Nothing here is static
 * HTML, because promote.sh copies dev/ byte-for-byte and PROD serves the same files.
 */

/** @typedef {'dev' | 'uat' | 'prod'} Env */
/** @typedef {'cs' | 'en'} Lang */

/**
 * Same rule as Room Repeater: a /dev/ or /uat/ path segment selects the environment.
 * @param {string} pathname
 * @returns {Env}
 */
export function detectEnv(pathname) {
  const match = /\/(dev|uat)(\/|$)/i.exec(pathname);
  if (!match) return 'prod';
  return match[1]?.toLowerCase() === 'uat' ? 'uat' : 'dev';
}

/** @type {Readonly<Record<Env, string>>} */
const STORAGE_KEYS = { dev: 'fb-v1-dev', uat: 'fb-v1-uat', prod: 'fb-v1' };

/** @type {Readonly<Record<Env, string>>} */
const RR_URLS = {
  dev: 'https://korkovik.github.io/room-repeater/dev/',
  uat: 'https://korkovik.github.io/room-repeater/uat/',
  prod: 'https://korkovik.github.io/room-repeater/',
};

/**
 * @param {Env} env
 * @returns {string}
 */
export function storageKey(env) {
  return STORAGE_KEYS[env];
}

/**
 * Room Repeater URL of the same environment; never carries a query string or fragment.
 * @param {Env} env
 * @returns {string}
 */
export function rrUrl(env) {
  return RR_URLS[env];
}

/** @type {Readonly<Record<Lang, string>>} */
const BANNER_SUFFIX = {
  cs: 'testovací verze, texty ještě neprošly kontrolou',
  en: 'test version, texts not yet reviewed',
};

/**
 * @param {Env} env
 * @param {Lang} lang
 * @returns {string | null}
 */
export function bannerText(env, lang) {
  if (env === 'prod') return null;
  return `${env.toUpperCase()} · ${BANNER_SUFFIX[lang]}`;
}

/**
 * @param {string} value
 * @returns {Lang}
 */
function asLang(value) {
  return value.toLowerCase().startsWith('cs') ? 'cs' : 'en';
}

/**
 * Adds (or updates) the DEV/UAT banner and the robots noindex meta. Idempotent, so the app
 * can call it again after a language change. PROD gets neither.
 * @param {Document} doc
 * @param {Env} env
 * @param {Lang} lang
 * @returns {void}
 */
export function applyEnvChrome(doc, env, lang) {
  const text = bannerText(env, lang);
  if (text === null) return;
  if (!doc.head.querySelector('meta[name="robots"]')) {
    const meta = doc.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    doc.head.appendChild(meta);
  }
  let banner = doc.getElementById('env-banner');
  if (!banner) {
    banner = doc.createElement('div');
    banner.id = 'env-banner';
    banner.className = `env-banner env-banner--${env}`;
    banner.setAttribute('role', 'note');
    banner.dataset.testid = 'env-banner';
    doc.body.prepend(banner);
  }
  banner.lang = lang;
  banner.textContent = text;
}

if (typeof document !== 'undefined' && typeof location !== 'undefined') {
  applyEnvChrome(document, detectEnv(location.pathname), asLang(document.documentElement.lang || 'en'));
}
