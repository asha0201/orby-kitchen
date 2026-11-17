'use strict';
// Onboarding definitions and completeness rules. Pure functions, no DB access.
// An item counts as answered only when it has a non-empty value. Users answer
// "none" or "not sure" explicitly; empty fields are never filled in silently.

const HOUSEHOLD_ITEMS = [
  { key: 'routine', label: 'Household daily routine (work hours, meal times)', type: 'text' },
  { key: 'weekday_cook_minutes', label: 'Weekday cooking time limit, in minutes', type: 'number' },
  { key: 'appliances', label: 'Cooking appliances you have, besides the 4-litre Faber air fryer (say "none" if none)', type: 'list' },
  { key: 'batch_prep', label: 'Batch prep preference (yes / no / not sure)', type: 'text' },
  { key: 'meal_frequency', label: 'Preferred meal frequency and snacks', type: 'text' },
  { key: 'food_budget', label: 'Typical weekly food budget (or "skip")', type: 'text' },
];

const PERSON_ITEMS = [
  { key: 'allergies', label: 'Allergies (say "none" or "not sure" if unknown)', type: 'list' },
  { key: 'additional_dislikes', label: 'Additional dislikes beyond those already noted', type: 'list' },
  { key: 'portion_factor', label: 'Portion size vs. a standard serving (1 = standard, 1.5 = larger)', type: 'number' },
];

const PERSON_EXTRA_ITEMS = {
  asha: [
    { key: 'postpartum_stage', label: 'Postpartum stage (for context only)', type: 'text' },
    { key: 'breastfeeding_pattern', label: 'Breastfeeding pattern (for context only)', type: 'text' },
    { key: 'height_cm', label: 'Height in cm', type: 'number' },
    { key: 'clinician_guidance', label: 'Has a clinician reviewed hair fall and nutrition? (yes / no / planned)', type: 'text' },
  ],
  prabha: [
    { key: 'fitness_goal', label: 'Exact fitness goal', type: 'text' },
    { key: 'protein_target_g', label: 'Daily protein target in grams (or "not sure")', type: 'text' },
  ],
};

function isAnswered(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some((v) => String(v).trim() !== '');
  return String(value).trim() !== '';
}

function requiredForPerson(personId) {
  return [...PERSON_ITEMS, ...(PERSON_EXTRA_ITEMS[personId] || [])];
}

// household: object of household answers. profiles: { [personId]: answers }.
function onboardingStatus(household, profiles, people) {
  const missing = [];
  for (const item of HOUSEHOLD_ITEMS) {
    if (!isAnswered(household[item.key])) missing.push({ scope: 'household', key: item.key, label: item.label });
  }
  for (const person of people) {
    const answers = profiles[person.id] || {};
    for (const item of requiredForPerson(person.id)) {
      if (!isAnswered(answers[item.key])) {
        missing.push({ scope: person.id, key: item.key, label: `${person.name}: ${item.label}` });
      }
    }
  }
  return { complete: missing.length === 0, missing };
}

// Known facts from the initial brief. Stored as editable answers, marked as seeded.
// Items the brief did not answer are deliberately left out.
function seedAnswers() {
  return {
    asha: {
      likes: ['garlic-heavy dishes', 'garlic naan', 'pasta', 'aglio e olio', 'French toast', 'milk', 'chicken', 'mutton'],
      dislikes: ['seafood'],
      weight_kg: 69,
      pre_pregnancy_weight_kg: 60,
      hair_fall: 'reported heavy hair fall; clinician review advised',
      supplements_during_breastfeeding: 'no iron or calcium supplements taken (as reported)',
      activity_goal: 'sedentary work routine; wants to begin physical activity',
    },
    prabha: {
      likes: ['seafood', 'chicken', 'Hyderabadi chicken', 'pasta', 'sweets', 'cakes', 'chocolates'],
      restrictions: ['avoids refined sugar'],
      weight_kg: 78,
      previous_weight_kg: 102,
      activity: 'gym and sports about 2 to 2.5 hours',
    },
  };
}

const SEED_MEMORIES = [
  { scope: 'household', person_id: null, text: 'Mostly South Indian meals, plus easy pasta (including aglio e olio), chicken, air-fryer dishes and easy peanut chutney.' },
  { scope: 'person', person_id: 'asha', text: 'Hyderabadi chicken attempt turned out poorly (past experience, not a permanent dislike). Offer beginner-friendly guidance when selected.' },
  { scope: 'person', person_id: 'prabha', text: 'Disliked the Hyderabadi chicken result (past experience, not a permanent dislike). Offer beginner-friendly guidance when selected.' },
  { scope: 'household', person_id: null, text: 'Asha does not like seafood. Shared meals show a warning rather than being excluded, because Prabha likes seafood.' },
];

module.exports = {
  HOUSEHOLD_ITEMS,
  PERSON_ITEMS,
  PERSON_EXTRA_ITEMS,
  isAnswered,
  onboardingStatus,
  seedAnswers,
  SEED_MEMORIES,
};
