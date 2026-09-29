// @ts-check
/**
 * Family Buddy app shell: screens, routing and wiring (spec R1–R31).
 * All text is inserted with textContent / Text nodes; there is no innerHTML anywhere (R30).
 * "Today" is read from the device clock on every render and on visibilitychange (R13).
 */
import { ageLabel, ageMonths, guideStartDate, todayLocal } from './age.js';
import { applyEnvChrome, detectEnv, rrUrl, storageKey } from './env.js';
import { detectLang, formatLongDate, t, toDict } from './i18n.js';
import { isLinkOnly, rrItem, rrVisible, selectActivities, selectStage, toActivitiesFile, toStagePlan, toStagesFile, uniqueSources, usesLicence } from './select.js';
import { activeChild, createProfile, forgetActiveChild, isLang, loadProfile, newChildId, removeProfile, saveProfile, updateActiveChild } from './storage.js';
import { dobBounds, validateChildInput } from './validate.js';

/** @typedef {import('./i18n.js').Dict} Dict */
/** @typedef {import('./i18n.js').Lang} Lang */
/** @typedef {import('./select.js').Setting} Setting */
/** @typedef {import('./select.js').Source} Source */
/** @typedef {import('./select.js').Stage} Stage */
/** @typedef {import('./select.js').Activity} Activity */
/** @typedef {import('./select.js').StagePlan} StagePlan */
/** @typedef {import('./storage.js').Profile} Profile */
/** @typedef {import('./validate.js').ChildInputResult} ChildInputResult */
/** @typedef {{ plan: StagePlan, stages: readonly Stage[], activities: readonly Activity[] }} Content */
/** @typedef {'home' | 'settings' | 'about'} View */
/** @typedef {{ name: string, dob: string, lang: Lang | null }} Draft */

/** Used only when the i18n file itself can't be loaded. */
const FALLBACK = {
  cs: { load: 'Průvodce se nepodařilo načíst. Zkontroluj připojení a načti stránku znovu.', reload: 'Načíst znovu' },
  en: { load: "Couldn't load the guide. Check your connection and reload.", reload: 'Reload' },
};

const env = detectEnv(location.pathname);
const key = storageKey(env);
const draftKey = `fb-draft-${env}`;

const state = {
  /** @type {Profile | null} */
  profile: null,
  /** R29: stored data comes from a newer app version; never write. */
  readOnly: false,
  /** Legal F5: "Forget" could not remove the stored key. */
  forgetFailed: false,
  /** R27: the last save failed; the profile lives in memory for this session. */
  storageFailed: false,
  /** @type {Setting} */
  setting: 'indoor',
  /** @type {Draft} */
  draft: { name: '', dob: '', lang: null },
  /** @type {View | null} */
  renderedView: null,
  renderToken: 0,
};

/** @type {Map<Lang, Promise<Dict>>} */
const dictCache = new Map();
/** @type {Map<Lang, Promise<Content>>} */
const contentCache = new Map();

// ---------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Readonly<Record<string, string>>} [attrs]
 * @param {...(Node | string | null | undefined | false)} children
 * @returns {HTMLElementTagNameMap[K]}
 */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child);
  }
  return el;
}

/**
 * @param {string} url
 * @returns {Promise<unknown>}
 */
async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  /** @type {unknown} */
  const json = await response.json();
  return json;
}

/**
 * Caches a promise and forgets it on failure, so "Reload" retries.
 * @template T
 * @param {Map<Lang, Promise<T>>} cache
 * @param {Lang} lang
 * @param {() => Promise<T>} load
 * @returns {Promise<T>}
 */
function cached(cache, lang, load) {
  const existing = cache.get(lang);
  if (existing) return existing;
  const promise = load();
  cache.set(lang, promise);
  promise.catch(() => cache.delete(lang));
  return promise;
}

/**
 * @param {Lang} lang
 * @returns {Promise<Dict>}
 */
function loadDict(lang) {
  return cached(dictCache, lang, async () => toDict(await fetchJson(`i18n/${lang}.json`)));
}

/** @type {Promise<StagePlan> | null} */
let planPromise = null;

/** @returns {Promise<StagePlan>} */
function loadPlan() {
  if (!planPromise) {
    const promise = fetchJson('content/stage-plan.json').then(toStagePlan);
    planPromise = promise;
    promise.catch(() => {
      planPromise = null;
    });
  }
  return planPromise;
}

/**
 * @param {Lang} lang
 * @returns {Promise<Content>}
 */
function loadContent(lang) {
  return cached(contentCache, lang, async () => {
    const [plan, stages, activities] = await Promise.all([
      loadPlan(),
      fetchJson(`content/${lang}/stages.json`).then(toStagesFile),
      fetchJson(`content/${lang}/activities.json`).then(toActivitiesFile),
    ]);
    return { plan, stages: stages.stages, activities: activities.activities };
  });
}

/** @returns {Draft} */
function readDraft() {
  try {
    const raw = sessionStorage.getItem(draftKey);
    if (raw === null) return { name: '', dob: '', lang: null };
    /** @type {unknown} */
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { name: '', dob: '', lang: null };
    const name = 'name' in parsed && typeof parsed.name === 'string' ? parsed.name : '';
    const dob = 'dob' in parsed && typeof parsed.dob === 'string' ? parsed.dob : '';
    const lang = 'lang' in parsed && isLang(parsed.lang) ? parsed.lang : null;
    return { name, dob, lang };
  } catch {
    return { name: '', dob: '', lang: null };
  }
}

/**
 * BA11 / legal F2: the typed draft is kept in memory and written to sessionStorage (never
 * localStorage) only when the parent opens the privacy page; it is removed again once restored.
 */
function writeDraft() {
  try {
    sessionStorage.setItem(draftKey, JSON.stringify(state.draft));
  } catch {
    // sessionStorage blocked: the draft simply isn't kept across the privacy page.
  }
}

function clearDraft() {
  state.draft = { name: '', dob: '', lang: null };
  removeStoredDraft();
}

function removeStoredDraft() {
  try {
    sessionStorage.removeItem(draftKey);
  } catch {
    // Nothing to clear when sessionStorage is blocked.
  }
}

/** @returns {Lang} */
function currentLang() {
  return state.profile?.lang ?? state.draft.lang ?? detectLang(navigator.language);
}

/** @returns {View} */
function currentView() {
  const hash = location.hash.replace(/^#/, '');
  return hash === 'settings' || hash === 'about' ? hash : 'home';
}

/**
 * @param {View} view
 */
function navigate(view) {
  const target = view === 'home' ? '' : view;
  if (location.hash.replace(/^#/, '') === target) {
    void render();
    return;
  }
  location.hash = target;
}

/**
 * Persists the profile unless the data is read-only; remembers whether the browser refused.
 * @param {Profile} profile
 */
function persist(profile) {
  state.profile = profile;
  if (state.readOnly) return;
  state.storageFailed = !saveProfile(key, profile);
}

function reloadFromStorage() {
  const result = loadProfile(key);
  state.readOnly = result.kind === 'newer';
  if (result.kind === 'ok') state.profile = result.profile;
  else if (result.kind !== 'unavailable') state.profile = null;
}

// ---------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------

/**
 * @param {Dict} dict
 * @param {Lang} lang
 * @returns {HTMLElement}
 */
function footer(dict, lang) {
  const about = h('a', { href: '#about' }, t(dict, 'footer.aboutLink'));
  const privacy = h('a', { href: `privacy.${lang}.html` }, t(dict, 'footer.privacyLink'));
  return h('footer', { class: 'footer', 'data-testid': 'footer' },
    h('p', {}, t(dict, 'footer.disclaimer')),
    h('nav', {}, about, privacy),
  );
}

/**
 * @param {Dict} dict
 * @param {Lang} lang
 * @param {readonly Source[]} sources
 * @returns {HTMLElement}
 */
function sourcesControl(dict, lang, sources) {
  /** @param {readonly Source[]} items */
  const list = (items) => h('ul', {}, ...items.map((source) => h('li', {},
    h('span', { class: 'publisher' }, source.publisher), ': ',
    h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.title), ' · ',
    h('span', { class: 'accessed' }, t(dict, 'sources.accessed', { date: formatLongDate(source.accessed, lang) })),
  )));
  // Link-only sites (NHS, UNICEF, …) are never presented as the source of our text (legal F1).
  const cited = sources.filter((s) => !isLinkOnly(s));
  const further = sources.filter(isLinkOnly);
  return h('details', { class: 'sources' },
    h('summary', {}, t(dict, 'sources.toggle')),
    cited.length > 0 && h('div', { 'data-testid': 'cited-sources' }, list(cited)),
    further.length > 0 && h('div', { class: 'further-reading', 'data-testid': 'further-reading' },
      h('p', { class: 'further-title' }, t(dict, 'sources.furtherReading')), list(further)),
  );
}

/**
 * @param {Source} source
 * @returns {HTMLLIElement}
 */
function sourceItem(source) {
  return h('li', {}, `${source.publisher}: `, h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, source.title));
}

/**
 * @param {string} title
 * @returns {HTMLHeadingElement}
 */
function pageHeading(title) {
  return h('h1', { tabindex: '-1' }, title);
}

// ---------------------------------------------------------------------------------------------
// Screens
// ---------------------------------------------------------------------------------------------

/**
 * CS/EN switch. On onboarding it re-renders in place; in settings it returns to the dashboard,
 * so the stage and activities show in the new language straight away (AC-18).
 * @param {Dict} dict
 * @param {Lang} lang
 * @param {View} after
 * @returns {HTMLElement}
 */
function languageSwitch(dict, lang, after) {
  const group = h('div', { class: 'segmented', role: 'group', 'aria-label': t(dict, 'lang.groupLabel') });
  for (const option of /** @type {const} */ (['cs', 'en'])) {
    const button = h('button', { type: 'button', lang: option, 'aria-pressed': String(option === lang), title: t(dict, `lang.${option}Name`) }, t(dict, `lang.${option}`));
    button.addEventListener('click', () => {
      if (option === currentLang()) return;
      if (state.profile) {
        persist({ ...state.profile, lang: option });
      } else {
        state.draft = { ...state.draft, lang: option };
      }
      navigate(after);
    });
    group.append(button);
  }
  return group;
}

/**
 * Name + DOB fields shared by onboarding and settings (R5, R6, R24).
 * @param {Dict} dict
 * @param {{ idPrefix: string, name: string, dob: string, today: string, submitLabel: string, beforeSubmit?: readonly HTMLElement[], onInput?: (name: string, dob: string) => void, onValid: (name: string, dob: string) => void }} options
 * @returns {HTMLFormElement}
 */
function childForm(dict, { idPrefix, name, dob, today, submitLabel, beforeSubmit = [], onInput, onValid }) {
  const bounds = dobBounds(today);
  const nameInput = h('input', {
    id: `${idPrefix}-name`, name: 'name', type: 'text', maxlength: '40', autocomplete: 'off',
    autocapitalize: 'words', spellcheck: 'false', 'aria-describedby': `${idPrefix}-name-error`,
  });
  nameInput.value = name;
  const dobInput = h('input', {
    id: `${idPrefix}-dob`, name: 'dob', type: 'date', min: bounds.min, max: bounds.max,
    'aria-describedby': `${idPrefix}-dob-error`,
  });
  dobInput.value = dob;
  const nameError = h('p', { id: `${idPrefix}-name-error`, class: 'error' });
  const dobError = h('p', { id: `${idPrefix}-dob-error`, class: 'error' });
  // method="post" + CSP form-action 'none': a native submit can never put name/DOB into a URL.
  const form = h('form', { novalidate: '', method: 'post' },
    h('div', { class: 'field' }, h('label', { for: nameInput.id }, t(dict, 'onboarding.nameLabel')), nameInput, nameError),
    h('div', { class: 'field' }, h('label', { for: dobInput.id }, t(dict, 'onboarding.dobLabel')), dobInput, dobError),
    ...beforeSubmit,
    h('button', { type: 'submit' }, submitLabel),
  );
  const changed = () => onInput?.(nameInput.value, dobInput.value);
  nameInput.addEventListener('input', changed);
  dobInput.addEventListener('input', changed);
  dobInput.addEventListener('change', changed);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const result = validateChildInput({ name: nameInput.value, dob: dobInput.value }, todayLocal());
    const errors = result.ok ? {} : result.errors;
    nameError.textContent = errors.name ? t(dict, `error.${errors.name}`) : '';
    dobError.textContent = errors.dob ? t(dict, `error.${errors.dob}`) : '';
    nameInput.setAttribute('aria-invalid', String(Boolean(errors.name)));
    dobInput.setAttribute('aria-invalid', String(Boolean(errors.dob)));
    if (result.ok) onValid(result.name, result.dob);
    else (errors.name ? nameInput : dobInput).focus();
  });
  return form;
}

/**
 * @param {Dict} dict
 * @param {Lang} lang
 * @returns {HTMLElement[]}
 */
function onboardingScreen(dict, lang) {
  const today = todayLocal();
  const privacyLink = h('a', { class: 'block-link', href: `privacy.${lang}.html` }, t(dict, 'onboarding.privacyLink'));
  privacyLink.addEventListener('click', () => writeDraft());
  const form = childForm(dict, {
    idPrefix: 'onb',
    name: state.draft.name,
    dob: state.draft.dob,
    today,
    submitLabel: t(dict, 'onboarding.submit'),
    beforeSubmit: [h('p', { class: 'privacy-line' }, t(dict, 'onboarding.privacyLine')), h('p', {}, privacyLink)],
    onInput: (name, dob) => {
      state.draft = { ...state.draft, name, dob };
    },
    onValid: (name, dob) => {
      const profile = createProfile({ name, dob, lang, today: todayLocal(), id: newChildId() });
      clearDraft();
      state.forgetFailed = false;
      persist(profile);
      state.setting = 'indoor';
      navigate('home');
    },
  });
  return [
    h('div', { class: 'topbar' }, h('span', { class: 'muted' }, t(dict, 'app.name')), languageSwitch(dict, lang, 'home')),
    h('main', {},
      h('div', { class: 'brand' }, pageHeading(t(dict, 'onboarding.title')), h('p', {}, t(dict, 'app.tagline'))),
      state.forgetFailed && h('p', { class: 'notice', role: 'status', 'data-testid': 'forget-notice' }, t(dict, 'notice.forgetFailed')),
      h('div', { class: 'card' }, form),
    ),
  ];
}

/**
 * @param {Dict} dict
 * @param {Lang} lang
 * @param {readonly Activity[]} activities
 * @param {number} months
 * @returns {HTMLElement}
 */
function activitiesSection(dict, lang, activities, months) {
  const section = h('section', { class: 'card', 'aria-labelledby': 'activities-heading', 'data-testid': 'activities' });
  const toggle = h('div', { class: 'segmented', role: 'group', 'aria-label': t(dict, 'activities.settingLabel') });
  for (const option of /** @type {const} */ (['indoor', 'outdoor'])) {
    const button = h('button', { type: 'button', 'aria-pressed': String(option === state.setting), 'data-setting': option }, t(dict, `activities.${option}`));
    button.addEventListener('click', () => {
      state.setting = option;
      const replacement = activitiesSection(dict, lang, activities, months);
      section.replaceWith(replacement);
      const pressed = replacement.querySelector(`button[data-setting="${option}"]`);
      if (pressed instanceof HTMLButtonElement) pressed.focus();
    });
    toggle.append(button);
  }
  section.append(h('h2', { id: 'activities-heading' }, t(dict, 'activities.heading')), toggle, h('p', { class: 'safety', 'data-testid': 'safety' }, t(dict, 'activities.safety')));
  const chosen = selectActivities(months, state.setting, activities);
  if (chosen.length === 0) section.append(h('p', {}, t(dict, 'activities.none')));
  for (const activity of chosen) {
    section.append(h('article', { class: 'card activity', 'data-testid': 'activity-card', 'data-id': activity.id },
      h('h3', {}, activity.title),
      h('p', { class: 'minutes' }, t(dict, 'activities.minutes', { n: activity.minutes })),
      h('ol', {}, ...activity.steps.map((step) => h('li', {}, step))),
      h('h4', { class: 'why-title' }, t(dict, 'activities.why')),
      h('p', { class: 'why' }, activity.why),
      sourcesControl(dict, lang, activity.sources),
    ));
  }
  return section;
}

/**
 * @param {Dict} dict
 * @param {readonly Activity[]} activities
 * @returns {HTMLElement | null}
 */
function rrCard(dict, activities) {
  const item = rrItem(activities);
  if (!item) return null;
  return h('section', { class: 'card rr-card', 'data-testid': 'rr-card', 'aria-labelledby': 'rr-heading' },
    h('h2', { id: 'rr-heading' }, item.title),
    h('p', {}, item.steps[0] ?? item.why),
    h('a', { class: 'button', href: rrUrl(env), target: '_blank', rel: 'noopener noreferrer' }, t(dict, 'rr.open')),
  );
}

/**
 * @param {Dict} dict
 * @param {Lang} lang
 * @param {Profile} profile
 * @param {Content} content
 * @returns {HTMLElement[]}
 */
function dashboardScreen(dict, lang, profile, content) {
  const today = todayLocal();
  const child = activeChild(profile);
  const months = ageMonths(child.dob, today);
  const settingsButton = h('button', { type: 'button', class: 'secondary' }, t(dict, 'dashboard.settings'));
  settingsButton.addEventListener('click', () => navigate('settings'));
  const header = h('header', { class: 'header' },
    h('h1', { tabindex: '-1', 'data-testid': 'child-header' },
      h('span', { class: 'child-name', 'data-testid': 'child-name', title: child.name }, child.name),
      h('span', { class: 'sep', 'aria-hidden': 'true' }, '·'),
      h('span', { class: 'age-label', 'data-testid': 'age-label' }, ageLabel(child.dob, today, lang)),
    ),
    settingsButton,
  );
  const main = h('main', {});
  if (state.storageFailed) {
    main.append(h('p', { class: 'notice', role: 'status', 'data-testid': 'storage-notice' }, t(dict, 'notice.storage', { name: child.name })));
  }
  const selection = selectStage(months, content.plan, content.stages);
  switch (selection.state) {
    case 'pre':
      main.append(h('p', { class: 'card state-message', 'data-testid': 'state-message' }, t(dict, 'state.pre', { date: formatLongDate(guideStartDate(child.dob), lang) })));
      break;
    case 'post':
      main.append(h('p', { class: 'card state-message', 'data-testid': 'state-message' }, t(dict, 'state.post')));
      break;
    case 'unwritten':
      main.append(h('p', { class: 'card state-message', 'data-testid': 'state-message' }, selection.planStage
        ? t(dict, 'state.unwritten', { from: selection.planStage.ageFromMonths, to: selection.planStage.ageToMonths })
        : t(dict, 'activities.none')));
      break;
    case 'written': {
      const { stage } = selection;
      main.append(h('section', { class: 'card', 'data-testid': 'stage-card', 'data-id': stage.id, 'aria-labelledby': 'stage-title' },
        h('h2', { id: 'stage-title' }, stage.title),
        h('p', { class: 'insight' }, stage.insight),
        h('h3', {}, t(dict, 'stage.takeawaysHeading')),
        h('ul', { class: 'takeaways' }, ...stage.takeaways.map((text) => h('li', {}, text))),
        sourcesControl(dict, lang, stage.sources),
      ));
      main.append(activitiesSection(dict, lang, content.activities, months));
      break;
    }
    default: {
      /** @type {never} */
      const unreachable = selection;
      throw new Error(`Unknown stage state ${String(unreachable)}`);
    }
  }
  if (rrVisible(months, content.activities)) {
    const card = rrCard(dict, content.activities);
    if (card) main.append(card);
  }
  return [header, main, footer(dict, lang)];
}

/**
 * @param {Dict} dict
 * @param {Lang} lang
 * @param {Profile} profile
 * @returns {HTMLElement[]}
 */
function settingsScreen(dict, lang, profile) {
  const child = activeChild(profile);
  const back = h('button', { type: 'button', class: 'secondary' }, t(dict, 'settings.back'));
  back.addEventListener('click', () => navigate('home'));
  const form = childForm(dict, {
    idPrefix: 'set',
    name: child.name,
    dob: child.dob,
    today: todayLocal(),
    submitLabel: t(dict, 'settings.save'),
    onValid: (name, dob) => {
      persist(updateActiveChild(profile, { name, dob }));
      navigate('home');
    },
  });

  const dialogText = h('p', { id: 'forget-text' }, t(dict, 'settings.forgetConfirm', { name: child.name }));
  const cancel = h('button', { type: 'button', class: 'secondary', value: 'cancel' }, t(dict, 'settings.cancel'));
  const confirm = h('button', { type: 'button', class: 'danger', value: 'confirm' }, t(dict, 'settings.delete'));
  const dialog = h('dialog', { 'aria-labelledby': 'forget-text', 'data-testid': 'forget-dialog' }, dialogText, h('div', { class: 'actions' }, cancel, confirm));
  cancel.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => {
    dialog.close();
    const next = forgetActiveChild(profile);
    if (next) {
      persist(next);
    } else {
      // Legal F5: tell the parent when the browser refused to delete the stored details.
      state.forgetFailed = !removeProfile(key);
      state.profile = null;
      state.storageFailed = false;
    }
    clearDraft();
    state.setting = 'indoor';
    navigate('home');
  });
  const forget = h('button', { type: 'button', class: 'danger' }, t(dict, 'settings.forget'));
  forget.addEventListener('click', () => dialog.showModal());

  return [
    h('div', { class: 'topbar' }, back),
    h('main', { class: 'stack' },
      pageHeading(t(dict, 'settings.title')),
      h('section', { class: 'card', 'aria-labelledby': 'settings-child' }, h('h2', { id: 'settings-child' }, t(dict, 'settings.childHeading')), form),
      h('section', { class: 'card', 'aria-labelledby': 'settings-lang' }, h('h2', { id: 'settings-lang' }, t(dict, 'settings.languageHeading')), languageSwitch(dict, lang, 'home')),
      h('section', { class: 'card' }, forget),
      dialog,
    ),
    footer(dict, lang),
  ];
}

/**
 * @param {Dict} dict
 * @param {Lang} lang
 * @param {Content} content
 * @returns {HTMLElement[]}
 */
function aboutScreen(dict, lang, content) {
  const back = h('button', { type: 'button', class: 'secondary' }, t(dict, 'about.back'));
  back.addEventListener('click', () => navigate('home'));
  const { stages, activities } = content;
  const all = uniqueSources(stages, activities);
  const sources = all.filter((s) => !isLinkOnly(s));
  const further = all.filter(isLinkOnly);
  const main = h('main', { class: 'text-page', 'data-testid': 'about' },
    pageHeading(t(dict, 'about.title')),
    h('p', { 'data-key': 'about.what' }, t(dict, 'about.what')),
    h('h2', {}, t(dict, 'about.notMedicalTitle')),
    h('p', { 'data-key': 'about.notMedical' }, t(dict, 'about.notMedical')),
    h('h2', {}, t(dict, 'about.howTitle')),
    h('p', { 'data-key': 'about.how' }, t(dict, 'about.how')),
    h('h2', {}, t(dict, 'about.safetyTitle')),
    h('p', { 'data-key': 'about.safety' }, t(dict, 'about.safety')),
    h('h2', {}, t(dict, 'about.sourcesTitle')),
    h('p', { 'data-key': 'about.cdc' }, t(dict, 'about.cdc')),
    usesLicence(stages, activities, 'CC-BY-4.0') && h('p', { 'data-key': 'about.ccby' }, t(dict, 'about.ccby')),
    usesLicence(stages, activities, 'CC-BY-NC-SA-3.0-IGO') && h('p', { 'data-key': 'about.who' }, t(dict, 'about.who')),
    h('p', { 'data-key': 'about.links' }, t(dict, 'about.links')),
    h('p', { 'data-key': 'about.rr' }, t(dict, 'about.rr')),
    h('h2', {}, t(dict, 'about.sourceListTitle')),
    h('ul', { class: 'source-list', 'data-testid': 'source-list' }, ...sources.map(sourceItem)),
    further.length > 0 && h('h2', {}, t(dict, 'about.furtherReadingTitle')),
    further.length > 0 && h('ul', { class: 'source-list', 'data-testid': 'further-reading-list' }, ...further.map(sourceItem)),
  );
  return [h('div', { class: 'topbar' }, back), main, footer(dict, lang)];
}

/**
 * @param {string} message
 * @param {string} buttonLabel
 * @param {() => void} onClick
 * @returns {HTMLElement[]}
 */
function messageScreen(message, buttonLabel, onClick) {
  const button = h('button', { type: 'button' }, buttonLabel);
  button.addEventListener('click', onClick);
  return [h('main', {}, h('div', { class: 'card', role: 'alert' }, h('p', { 'data-testid': 'app-message' }, message), button))];
}

// ---------------------------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------------------------

/**
 * @param {View} view
 * @param {HTMLElement[]} nodes
 */
function commit(view, nodes) {
  const root = document.getElementById('app');
  if (!root) return;
  const viewChanged = state.renderedView !== view;
  root.replaceChildren(...nodes);
  state.renderedView = view;
  if (viewChanged && view !== 'home') root.querySelector('h1')?.focus();
}

/**
 * Renders the current view. Concurrent calls are safe: only the latest one commits.
 * @returns {Promise<void>}
 */
async function render() {
  state.renderToken += 1;
  const token = state.renderToken;
  const lang = currentLang();
  document.documentElement.lang = lang;
  applyEnvChrome(document, env, lang);

  /** @type {Dict} */
  let dict;
  try {
    dict = await loadDict(lang);
  } catch {
    if (token === state.renderToken) commit('home', messageScreen(FALLBACK[lang].load, FALLBACK[lang].reload, () => void render()));
    return;
  }
  if (token !== state.renderToken) return;
  document.title = t(dict, 'app.name');

  if (state.readOnly) {
    commit('home', messageScreen(t(dict, 'error.newerData'), t(dict, 'error.reload'), () => location.reload()));
    return;
  }

  const view = currentView();
  const profile = state.profile;
  const loadError = () => messageScreen(t(dict, 'error.load'), t(dict, 'error.reload'), () => void render());

  if (view === 'about') {
    try {
      const content = await loadContent(lang);
      if (token === state.renderToken) commit('about', aboutScreen(dict, lang, content));
    } catch {
      if (token === state.renderToken) commit('about', loadError());
    }
    return;
  }
  if (!profile) {
    commit('home', onboardingScreen(dict, lang));
    return;
  }
  if (view === 'settings') {
    commit('settings', settingsScreen(dict, lang, profile));
    return;
  }
  try {
    const content = await loadContent(lang);
    if (token === state.renderToken) commit('home', dashboardScreen(dict, lang, profile, content));
  } catch {
    if (token === state.renderToken) commit('home', loadError());
  }
}

function start() {
  state.draft = readDraft();
  removeStoredDraft();
  reloadFromStorage();
  window.addEventListener('hashchange', () => void render());
  // R13: an app left open overnight shows the new age when it becomes visible again.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && (state.renderedView === 'home' || state.renderedView === 'about') && state.profile) void render();
  });
  // Another tab changed or removed the profile (edge case "two tabs open").
  window.addEventListener('storage', (event) => {
    if (event.key !== null && event.key !== key) return;
    if (state.storageFailed) return;
    reloadFromStorage();
    void render();
  });
  void render();
}

start();
