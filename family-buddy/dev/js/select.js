// @ts-check
/**
 * Content types, runtime shape checks for the fetched JSON, and the selection rules
 * (spec R12, R16, R17, R20). Selection functions take the content as arguments.
 */

/** @typedef {'indoor' | 'outdoor'} Setting */
/**
 * @typedef {{ readonly title: string, readonly publisher: string, readonly url: string,
 *   readonly accessed: string, readonly licence: string }} Source
 */
/** @typedef {{ readonly by: string | null, readonly date: string | null }} Review */
/** @typedef {{ readonly id: string, readonly ageFromMonths: number, readonly ageToMonths: number }} Ranged */
/**
 * @typedef {Ranged & { readonly title: string, readonly insight: string,
 *   readonly takeaways: readonly string[], readonly sources: readonly Source[],
 *   readonly reviewed: Review }} Stage
 */
/**
 * @typedef {Ranged & { readonly setting: Setting, readonly minutes: number, readonly title: string,
 *   readonly steps: readonly string[], readonly why: string, readonly sources: readonly Source[],
 *   readonly reviewed: Review, readonly module?: string }} Activity
 */
/** @typedef {{ readonly coverage: { readonly fromMonths: number, readonly toMonths: number }, readonly stages: readonly Ranged[] }} StagePlan */
/** @typedef {{ readonly lang: string, readonly contentVersion: string, readonly complete: boolean, readonly stages: readonly Stage[] }} StagesFile */
/** @typedef {{ readonly lang: string, readonly contentVersion: string, readonly activities: readonly Activity[] }} ActivitiesFile */
/**
 * @typedef {{ state: 'pre' }
 *   | { state: 'post' }
 *   | { state: 'written', stage: Stage, planStage: Ranged }
 *   | { state: 'unwritten', planStage: Ranged | null }} StageSelection
 */

export const RR_MODULE_ID = 'a-room-repeater';
export const ACTIVITY_LIMIT = 3;

export class ContentShapeError extends Error {}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {string}
 */
function str(value, what) {
  if (typeof value !== 'string') throw new ContentShapeError(`${what}: expected a string`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {number}
 */
function int(value, what) {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ContentShapeError(`${what}: expected an integer`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {unknown[]}
 */
function arr(value, what) {
  if (!Array.isArray(value)) throw new ContentShapeError(`${what}: expected an array`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {Record<string, unknown>}
 */
function rec(value, what) {
  if (!isRecord(value)) throw new ContentShapeError(`${what}: expected an object`);
  return value;
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {Ranged}
 */
function toRanged(value, what) {
  const r = rec(value, what);
  return { id: str(r.id, `${what}.id`), ageFromMonths: int(r.ageFromMonths, `${what}.ageFromMonths`), ageToMonths: int(r.ageToMonths, `${what}.ageToMonths`) };
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {Source[]}
 */
function toSources(value, what) {
  return arr(value, what).map((s, i) => {
    const r = rec(s, `${what}[${i}]`);
    return {
      title: str(r.title, `${what}[${i}].title`),
      publisher: str(r.publisher, `${what}[${i}].publisher`),
      url: str(r.url, `${what}[${i}].url`),
      accessed: str(r.accessed, `${what}[${i}].accessed`),
      licence: str(r.licence, `${what}[${i}].licence`),
    };
  });
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {Review}
 */
function toReview(value, what) {
  const r = rec(value, what);
  const by = r.by === null ? null : str(r.by, `${what}.by`);
  const date = r.date === null ? null : str(r.date, `${what}.date`);
  return { by, date };
}

/**
 * @param {unknown} value
 * @param {string} what
 * @returns {string[]}
 */
function strings(value, what) {
  return arr(value, what).map((s, i) => str(s, `${what}[${i}]`));
}

/**
 * @param {unknown} json
 * @returns {StagePlan}
 */
export function toStagePlan(json) {
  const r = rec(json, 'stage-plan');
  const coverage = rec(r.coverage, 'coverage');
  return {
    coverage: { fromMonths: int(coverage.fromMonths, 'coverage.fromMonths'), toMonths: int(coverage.toMonths, 'coverage.toMonths') },
    stages: arr(r.stages, 'stages').map((s, i) => toRanged(s, `stages[${i}]`)),
  };
}

/**
 * @param {unknown} json
 * @returns {StagesFile}
 */
export function toStagesFile(json) {
  const r = rec(json, 'stages');
  const coverage = rec(r.coverage, 'coverage');
  if (typeof coverage.complete !== 'boolean') throw new ContentShapeError('coverage.complete: expected a boolean');
  return {
    lang: str(r.lang, 'lang'),
    contentVersion: str(r.contentVersion, 'contentVersion'),
    complete: coverage.complete,
    stages: arr(r.stages, 'stages').map((s, i) => {
      const what = `stages[${i}]`;
      const item = rec(s, what);
      return {
        ...toRanged(item, what),
        title: str(item.title, `${what}.title`),
        insight: str(item.insight, `${what}.insight`),
        takeaways: strings(item.takeaways, `${what}.takeaways`),
        sources: toSources(item.sources, `${what}.sources`),
        reviewed: toReview(item.reviewed, `${what}.reviewed`),
      };
    }),
  };
}

/**
 * @param {unknown} json
 * @returns {ActivitiesFile}
 */
export function toActivitiesFile(json) {
  const r = rec(json, 'activities');
  return {
    lang: str(r.lang, 'lang'),
    contentVersion: str(r.contentVersion, 'contentVersion'),
    activities: arr(r.activities, 'activities').map((a, i) => {
      const what = `activities[${i}]`;
      const item = rec(a, what);
      const setting = item.setting;
      if (setting !== 'indoor' && setting !== 'outdoor') throw new ContentShapeError(`${what}.setting: expected indoor|outdoor`);
      /** @type {Activity} */
      const activity = {
        ...toRanged(item, what),
        setting,
        minutes: int(item.minutes, `${what}.minutes`),
        title: str(item.title, `${what}.title`),
        steps: strings(item.steps, `${what}.steps`),
        why: str(item.why, `${what}.why`),
        sources: toSources(item.sources, `${what}.sources`),
        reviewed: toReview(item.reviewed, `${what}.reviewed`),
      };
      return item.module === undefined ? activity : { ...activity, module: str(item.module, `${what}.module`) };
    }),
  };
}

/**
 * Half-open range test (R12): from ≤ months < to.
 * @param {number} months
 * @param {Ranged} item
 * @returns {boolean}
 */
export function inRange(months, item) {
  return item.ageFromMonths <= months && months < item.ageToMonths;
}

/**
 * @param {number} months
 * @param {StagePlan} plan
 * @param {readonly Stage[]} stages
 * @returns {StageSelection}
 */
export function selectStage(months, plan, stages) {
  if (months < plan.coverage.fromMonths) return { state: 'pre' };
  if (months >= plan.coverage.toMonths) return { state: 'post' };
  const planStage = plan.stages.find((s) => inRange(months, s)) ?? null;
  const stage = planStage ? stages.find((s) => s.id === planStage.id) : undefined;
  if (planStage && stage) return { state: 'written', stage, planStage };
  return { state: 'unwritten', planStage };
}

/**
 * Up to `limit` non-module activities for the age and setting, in file order (R16).
 * @param {number} months
 * @param {Setting} setting
 * @param {readonly Activity[]} activities
 * @param {number} [limit]
 * @returns {Activity[]}
 */
export function selectActivities(months, setting, activities, limit = ACTIVITY_LIMIT) {
  return activities.filter((a) => a.module === undefined && a.setting === setting && inRange(months, a)).slice(0, limit);
}

/**
 * @param {readonly Activity[]} activities
 * @returns {Activity | undefined}
 */
export function rrItem(activities) {
  return activities.find((a) => a.id === RR_MODULE_ID);
}

/**
 * RR card visibility comes from the content item's range, not from constants (R17).
 * @param {number} months
 * @param {readonly Activity[]} activities
 * @returns {boolean}
 */
export function rrVisible(months, activities) {
  const item = rrItem(activities);
  return item !== undefined && inRange(months, item);
}

/**
 * Link-only sources (NHS, UNICEF, …) are further reading, never the source of our text.
 * @param {Source} source
 * @returns {boolean}
 */
export function isLinkOnly(source) {
  return source.licence === 'link-only';
}

/**
 * Every source used by the content, first occurrence wins, deduplicated by URL (R20).
 * @param {readonly Stage[]} stages
 * @param {readonly Activity[]} activities
 * @returns {Source[]}
 */
export function uniqueSources(stages, activities) {
  /** @type {Map<string, Source>} */
  const byUrl = new Map();
  for (const item of [...stages, ...activities]) {
    for (const source of item.sources) {
      if (!byUrl.has(source.url)) byUrl.set(source.url, source);
    }
  }
  return [...byUrl.values()];
}

/**
 * @param {readonly Stage[]} stages
 * @param {readonly Activity[]} activities
 * @param {string} licence
 * @returns {boolean}
 */
export function usesLicence(stages, activities, licence) {
  return [...stages, ...activities].some((item) => item.sources.some((s) => s.licence === licence));
}
