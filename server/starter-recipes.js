'use strict';
// Starter recipes written for the household's stated tastes (mostly South Indian,
// plus pasta, chicken, air-fryer dishes and peanut chutney). No seafood.
// Nutrition is deliberately left blank: add it from a label or trusted source.
// Quantities are per standard serving of the recipe (see `servings`).
const STARTER_RECIPES = [
  {
    name: 'Upma (semolina breakfast)', cuisine: 'South Indian', meal_types: ['breakfast'],
    active_minutes: 10, total_minutes: 20, servings: 2,
    ingredients_text: '1 cup rava (semolina)\n1 tbsp oil\n1 tsp mustard seeds\n1 piece onion\n1 piece green chilli\n2 cup water\nsalt to taste',
    steps_text: 'Dry-roast the rava in a pan until it smells nutty, then set aside.\nHeat the oil, add mustard seeds and let them splutter.\nAdd the chopped onion and chilli and fry until soft.\nAdd the water and salt and bring it to a boil.\nStir in the rava slowly, cover and cook 3 to 4 minutes until fluffy.',
    notes: 'Starter recipe. Review quantities for your household.',
  },
  {
    name: 'French toast', cuisine: 'Continental', meal_types: ['breakfast', 'snack'],
    active_minutes: 8, total_minutes: 12, servings: 2,
    ingredients_text: '4 slice bread\n2 piece egg\n60 ml milk\n1 tsp butter\npinch salt',
    steps_text: 'Whisk the eggs, milk and salt in a shallow bowl.\nDip each bread slice in the mixture for a few seconds per side.\nMelt the butter in a pan over medium heat.\nCook each slice 2 to 3 minutes per side until golden.',
  },
  {
    name: 'Peanut chutney', cuisine: 'South Indian', meal_types: ['breakfast', 'snack'],
    active_minutes: 8, total_minutes: 10, servings: 4,
    ingredients_text: '100 g roasted peanuts\n2 piece green chilli\n1 clove garlic\n1 tsp tamarind paste\nsalt to taste\n100 ml water',
    steps_text: 'Blend the peanuts, chilli, garlic and tamarind with a little water.\nAdd more water a spoon at a time until smooth.\nSeason with salt and blend once more.\nServe with idli, dosa, upma or toast.',
    notes: 'Starter recipe. Keeps covered in the fridge for a few days; check your own storage rules.',
  },
  {
    name: 'Aglio e olio', cuisine: 'Italian', meal_types: ['lunch', 'dinner'],
    active_minutes: 10, total_minutes: 20, servings: 2,
    ingredients_text: '200 g pasta\n6 clove garlic\n3 tbsp olive oil\npinch chilli flakes\nsalt to taste',
    steps_text: 'Boil the pasta in salted water until just tender; keep a cup of the water.\nSlice the garlic thinly.\nGently fry the garlic in the oil until light golden. Do not let it burn.\nAdd the chilli flakes, then the drained pasta and a splash of pasta water. Toss well and serve.',
  },
  {
    name: 'Air-fryer garlic chicken', cuisine: 'Air-fryer', meal_types: ['lunch', 'dinner'],
    active_minutes: 10, total_minutes: 25, servings: 2,
    ingredients_text: '500 g chicken\n1 tbsp garlic paste\n1 tbsp oil\n1 tsp salt\n1 tsp black pepper',
    steps_text: 'Mix the chicken with garlic paste, oil, salt and pepper. Rest 10 minutes.\nPreheat the air fryer to 180 C.\nAir-fry for 18 minutes, turning the pieces halfway.\nCheck the thickest piece is cooked through with no pink inside before serving.',
    air_fryer: '180 C, 18 min, turn halfway (4-litre Faber)',
    storage_notes: 'Refrigerate within 2 hours of cooking; eat within 2 days.',
  },
  {
    name: 'South Indian chicken curry', cuisine: 'South Indian', meal_types: ['lunch', 'dinner'],
    active_minutes: 20, total_minutes: 40, servings: 2,
    ingredients_text: '500 g chicken\n2 piece onion\n2 piece tomato\n1 tbsp ginger garlic paste\n1 tsp red chilli powder\n1 tsp turmeric\n1 tsp coriander powder\n2 tbsp oil\n150 ml water\nsalt to taste',
    steps_text: 'Heat the oil and fry the sliced onion until golden.\nAdd the ginger garlic paste and cook 1 minute.\nAdd the chopped tomato and cook until soft.\nAdd the spice powders and a splash of water to stop sticking.\nAdd the chicken and salt, coat well, then add the water.\nSimmer covered for 20 minutes until the chicken is cooked through.',
  },
  {
    name: 'Curd rice', cuisine: 'South Indian', meal_types: ['lunch', 'dinner'],
    active_minutes: 5, total_minutes: 10, servings: 2,
    ingredients_text: '1 cup cooked rice\n0.5 cup curd\n1 tsp mustard seeds\n1 tbsp oil\nsalt to taste\n50 ml milk',
    steps_text: 'Mash the cooked rice lightly with a fork.\nMix in the curd, salt and milk until creamy.\nHeat the oil, add mustard seeds, let them splutter and pour over the rice.',
  },
  {
    name: 'Toor dal', cuisine: 'South Indian', meal_types: ['lunch', 'dinner'],
    active_minutes: 15, total_minutes: 35, servings: 3,
    ingredients_text: '1 cup toor dal\n1 tsp turmeric\n1 piece tomato\n1 tsp cumin seeds\n2 clove garlic\n1 tbsp oil\n3 cup water\nsalt to taste',
    steps_text: 'Wash the dal and cook with turmeric and water until soft, about 20 minutes.\nMash lightly.\nHeat the oil, add cumin and garlic, and fry until fragrant.\nAdd the chopped tomato and cook until soft.\nStir this tempering into the dal and add salt.',
  },
  {
    name: 'Air-fryer sweet potato fries', cuisine: 'Air-fryer', meal_types: ['snack'],
    active_minutes: 10, total_minutes: 25, servings: 2,
    ingredients_text: '2 piece sweet potato\n1 tbsp oil\npinch salt',
    steps_text: 'Cut the sweet potatoes into thin sticks and pat dry.\nToss with oil and salt.\nAir-fry at 190 C for 15 minutes, shaking halfway, until crisp at the edges.',
    air_fryer: '190 C, 15 min, shake halfway',
  },
];

module.exports = { STARTER_RECIPES };
