// @ts-check

/**
 * Meridian V2 motion constitution — enforced at author time.
 * Source: design/07-EXPERIENCE-BIBLE.md §VI (Motion Constitution), §XVI
 * (anti-patterns).
 *
 * Shared by `base.js` (api, packages/*) and apps/web's Next flat config, so
 * there is one definition rather than two that drift. Meridian V2 has three
 * motion tiers and no fourth; everything below is a way of inventing one.
 *
 * If a rule here fails, the fix is almost never a different animation:
 *   · A surface that needs a loading indicator is a performance bug
 *     (design/07 §XI), not a design problem to be decorated.
 *   · A state that needs announcing should be announced in text
 *     (design/07 §V.4), because colour and motion alone are not accessible.
 *
 * design/07 §XVI predicted exactly how this erodes — "the silences will be
 * fixed", "the overlap will creep back" — by contributors who reasonably
 * assume a frozen frame is a bug. Author-time enforcement is cheaper than
 * catching it in review forever.
 */
export const motionRules = {
  'no-restricted-syntax': [
    'error',
    {
      selector:
        "Literal[value=/\\banimate-(spin|pulse|ping|bounce)\\b/], TemplateElement[value.raw=/\\banimate-(spin|pulse|ping|bounce)\\b/]",
      message:
        'Banned motion (design/07 §VI.3): no spinners, pulse or bounce — nothing may read as loading. Use the static Skeleton for layout stability, or carry the state in text.',
    },
    {
      /*
       * Overshoot is any cubic-bezier control point outside [0,1]: negative,
       * or greater than 1. The lookbehinds stop legitimate fractions from
       * matching — the `2` in `.24` is preceded by `.`, so it is not a
       * standalone coefficient. Verified in both directions against the real
       * V2 easings (.2,0,0,1 and .32,0,.24,1), which must pass.
       */
      selector:
        "Literal[value=/cubic-bezier\\([^)]*(?:-[0-9.]+|(?<![.0-9])[1-9][0-9]*\\.[0-9]+|(?<![.0-9])[2-9])/], Literal[value=/\\b(elastic|overshoot|springOut|backOut|bounceOut)\\b/]",
      message:
        'Banned easing (design/07 §VI.1): no spring, bounce or overshoot. Motion is constant-velocity or eases in — materials in an instrument do not bounce.',
    },
  ],
};

/** Flat-config block, for spreading into a config array. */
export const motionConfig = {
  name: 'meridian/motion-constitution',
  rules: motionRules,
};
