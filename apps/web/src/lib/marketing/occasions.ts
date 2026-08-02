/**
 * The three occasion pages (T-21) — "same skeleton, swapped copy + template
 * deep-link — the SEO engine" (`02 §5.1`). Copy obeys `07 §VIII`: states, does
 * not sell; no exclamation marks; the wait is named plainly.
 *
 * `sample` is the page's one paper artifact (`07 §X.4` applies here too —
 * show the record, not the app). `stampDays` is the elapsed duration its
 * Duration Stamp franks.
 */
export interface Occasion {
  slug: string;
  title: string;
  metaTitle: string;
  metaDescription: string;
  heading: string;
  lede: string;
  points: string[];
  sample: string[];
  stampDays: number;
}

export const OCCASIONS: Occasion[] = [
  {
    slug: 'letters-to-my-future-self',
    title: 'To your future self',
    metaTitle: 'Letters to your future self — TimelyCapsule',
    metaDescription:
      'Write a letter to yourself, sealed until a date you choose. Encrypted on your device, kept for years, delivered on the day.',
    heading: 'A letter to someone you have not met yet.',
    lede: 'You in five years is a stranger with your name. Write to them while you still know what this year felt like.',
    points: [
      'Seal it for one year or twenty — the date is yours.',
      'Once sealed, it cannot be re-read or edited. You will forget what it says. That is the point.',
      'It arrives as a letter, with the time it travelled franked on it.',
    ],
    sample: [
      'You are twenty-six today, and you think the decision you made on Thursday was a mistake.',
      'I am writing this so you can check. Was it?',
    ],
    stampDays: 1826,
  },
  {
    slug: 'new-parents',
    title: 'For a child, from now',
    metaTitle: 'Capsules for new parents — TimelyCapsule',
    metaDescription:
      'Write to your child while they are small — sealed, encrypted, and delivered when they are old enough to read it.',
    heading: 'They will not remember any of this. You will forget most of it.',
    lede: 'The first year disappears into itself. A capsule keeps one evening of it, exactly as it was, until they can read.',
    points: [
      'Letters, photographs, a recording of the house at bedtime.',
      'Sealed until a birthday you choose — their tenth, their eighteenth.',
      'They open it in a browser, with no account and no app.',
    ],
    sample: [
      'I am writing this on the night before you turn one, while the house is finally quiet.',
      'Whatever is happening on the day you read this — you were wanted, completely, from the very start.',
    ],
    stampDays: 6210,
  },
  {
    slug: 'couples',
    title: 'Between two people',
    metaTitle: 'Capsules for couples — TimelyCapsule',
    metaDescription:
      'Write to each other across years — anniversary capsules, sealed now, opened together on the date you choose.',
    heading: 'Write it now. Read it married ten years.',
    lede: 'An anniversary card says what today feels like. A capsule lets today say it to a decade from now.',
    points: [
      'Seal one each on the wedding day; open them together on the tenth anniversary.',
      'Neither of you can peek. Neither can we.',
      'The time travelled is franked on the letter when it opens.',
    ],
    sample: [
      'We argued about the seating plan this morning and you laughed mid-sentence and lost.',
      'I am telling you this because in ten years you will claim the day was seamless. It was better than seamless.',
    ],
    stampDays: 3652,
  },
];

export function getOccasion(slug: string): Occasion | undefined {
  return OCCASIONS.find((o) => o.slug === slug);
}
