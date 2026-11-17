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

  // ---- Expanded set ----
  {
    name: 'Ragi malt (porridge)', cuisine: 'South Indian', meal_types: ['breakfast'],
    active_minutes: 5, total_minutes: 10, servings: 1,
    ingredients_text: '3 tbsp ragi flour\n250 ml milk\n100 ml water\npinch salt',
    steps_text: 'Mix the ragi flour with the water to a smooth paste with no lumps.\nBring the milk and salt to a simmer.\nAdd the ragi paste slowly, stirring constantly.\nCook 4 to 5 minutes until thick. Serve warm.',
  },
  {
    name: 'Poha (flattened rice)', cuisine: 'South Indian', meal_types: ['breakfast'],
    active_minutes: 10, total_minutes: 20, servings: 2,
    ingredients_text: '1 cup poha (flattened rice)\n1 tbsp oil\n1 tsp mustard seeds\n1 piece onion\n1 piece green chilli\n0.5 tsp turmeric\n2 tbsp peanuts\n1 piece lemon\nsalt to taste',
    steps_text: 'Rinse the poha in a strainer and let it soften 5 minutes.\nHeat the oil, add mustard seeds and peanuts and fry until crisp.\nAdd onion and chilli and cook until soft.\nAdd turmeric and the poha, then salt. Toss gently for 3 minutes.\nSqueeze lemon over the top and serve.',
  },
  {
    name: 'Vegetable omelette', cuisine: 'Continental', meal_types: ['breakfast', 'snack'],
    active_minutes: 6, total_minutes: 10, servings: 1,
    ingredients_text: '2 piece egg\n1 piece onion\n1 piece tomato\n1 tsp oil\npinch salt\npinch black pepper',
    steps_text: 'Beat the eggs with salt and pepper.\nFinely chop the onion and tomato.\nHeat the oil in a small pan and cook the vegetables 2 minutes.\nPour in the eggs, cover and cook on low 3 to 4 minutes until set.',
  },
  {
    name: 'Banana oat pancakes (no added sugar)', cuisine: 'Continental', meal_types: ['breakfast', 'snack'],
    active_minutes: 10, total_minutes: 15, servings: 2,
    ingredients_text: '1 piece banana\n0.5 cup oats\n1 piece egg\n60 ml milk\n0.5 tsp cinnamon\n1 tsp oil',
    steps_text: 'Mash the banana well.\nBlend or mix the oats, egg, milk and cinnamon into the banana to make a thick batter.\nHeat the oil in a non-stick pan on low.\nSpoon small pancakes in and cook 2 minutes per side.',
    notes: 'No added sugar. This is not a claim of low calories; use your own judgement or a clinician’s advice.',
  },
  {
    name: 'Garlic bread (air fryer)', cuisine: 'Continental', meal_types: ['snack', 'breakfast'],
    active_minutes: 5, total_minutes: 10, servings: 2,
    ingredients_text: '2 slice bread\n1 tbsp butter\n2 clove garlic\npinch salt',
    steps_text: 'Soften the butter and mix with the crushed garlic and salt.\nSpread on the bread.\nAir-fry at 180 C for 5 minutes until golden.',
    air_fryer: '180 C, 5 min',
  },
  {
    name: 'Chana masala', cuisine: 'South Indian', meal_types: ['lunch', 'dinner'],
    active_minutes: 20, total_minutes: 35, servings: 3,
    ingredients_text: '400 g chickpeas (cooked)\n2 piece onion\n2 piece tomato\n1 tbsp ginger garlic paste\n1 tsp chilli powder\n1 tsp coriander powder\n1 tsp garam masala\n2 tbsp oil\n150 ml water\nsalt to taste',
    steps_text: 'Fry the sliced onion in oil until golden.\nAdd ginger garlic paste and cook 1 minute.\nAdd chopped tomato and cook until soft.\nAdd the spices and a splash of water.\nAdd chickpeas, salt and water. Simmer 15 minutes.\nFinish with garam masala.',
  },
  {
    name: 'Sambar', cuisine: 'South Indian', meal_types: ['lunch', 'dinner'],
    active_minutes: 20, total_minutes: 45, servings: 3,
    ingredients_text: '0.5 cup toor dal\n1 piece tomato\n1 piece onion\n1 tsp sambar powder\n0.5 tsp tamarind paste\n1 tsp mustard seeds\n1 tbsp oil\n2 cup water\nsalt to taste',
    steps_text: 'Cook the dal with the water and turmeric until soft, about 20 minutes. Mash lightly.\nAdd chopped onion, tomato, sambar powder, tamarind and salt. Simmer 10 minutes.\nHeat the oil, add mustard seeds, let them splutter, and pour into the sambar.',
  },
  {
    name: 'Lemon rice', cuisine: 'South Indian', meal_types: ['lunch', 'dinner'],
    active_minutes: 10, total_minutes: 20, servings: 2,
    ingredients_text: '1 cup cooked rice\n1 piece lemon\n1 tsp mustard seeds\n1 tbsp oil\n2 tbsp peanuts\n0.25 tsp turmeric\nsalt to taste',
    steps_text: 'Heat oil, add mustard seeds and peanuts and fry until crisp.\nAdd turmeric and stir.\nAdd the cooked rice and salt and mix gently.\nTurn off the heat and squeeze in the lemon juice.',
  },
  {
    name: 'Vegetable pulao', cuisine: 'South Indian', meal_types: ['lunch', 'dinner'],
    active_minutes: 15, total_minutes: 35, servings: 3,
    ingredients_text: '1 cup rice\n1 piece onion\n100 g mixed vegetables\n1 tsp cumin seeds\n1 tbsp oil\n2 cup water\nsalt to taste',
    steps_text: 'Rinse the rice and soak 15 minutes.\nHeat the oil, add cumin and sliced onion and fry until golden.\nAdd vegetables and fry 3 minutes.\nAdd drained rice, water and salt. Cover and cook on low 15 minutes.',
  },
  {
    name: 'Egg curry', cuisine: 'South Indian', meal_types: ['lunch', 'dinner'],
    active_minutes: 15, total_minutes: 30, servings: 2,
    ingredients_text: '4 piece egg\n2 piece onion\n2 piece tomato\n1 tbsp ginger garlic paste\n1 tsp chilli powder\n1 tsp turmeric\n2 tbsp oil\n150 ml water\nsalt to taste',
    steps_text: 'Boil the eggs for 10 minutes, cool, peel and halve.\nFry sliced onion in oil until golden. Add ginger garlic paste.\nAdd chopped tomato and cook until soft, then add the spices.\nAdd water and salt and simmer 5 minutes. Add the eggs and simmer 5 more minutes.',
  },
  {
    name: 'Chicken pasta with tomato', cuisine: 'Italian', meal_types: ['lunch', 'dinner'],
    active_minutes: 20, total_minutes: 30, servings: 2,
    ingredients_text: '200 g pasta\n250 g chicken\n2 piece tomato\n3 clove garlic\n1 tbsp oil\n1 tsp dried oregano\nsalt and pepper to taste',
    steps_text: 'Boil the pasta in salted water until just tender. Keep a cup of the water.\nCut the chicken into small pieces and cook in oil until no pink remains.\nAdd sliced garlic and the chopped tomato and cook until soft.\nAdd the pasta, a splash of pasta water, oregano, salt and pepper. Toss and serve.',
  },
  {
    name: 'Mutton curry (weekend)', cuisine: 'South Indian', meal_types: ['lunch', 'dinner'],
    active_minutes: 30, total_minutes: 75, servings: 3,
    ingredients_text: '500 g mutton\n2 piece onion\n2 piece tomato\n1 tbsp ginger garlic paste\n1 tsp chilli powder\n1 tsp coriander powder\n2 tbsp oil\n300 ml water\nsalt to taste',
    steps_text: 'Fry sliced onion in oil until golden.\nAdd ginger garlic paste and cook 1 minute.\nAdd tomato and cook until soft, then add the spices.\nAdd the mutton and salt, coat well, then add water.\nPressure-cook or simmer covered until tender, about 60 minutes on low heat.',
    notes: 'Cooking time varies with the cut and the cooker. Check the meat is tender before serving.',
  },
  {
    name: 'Air-fryer yogurt chicken drumsticks', cuisine: 'Air-fryer', meal_types: ['lunch', 'dinner'],
    active_minutes: 15, total_minutes: 40, servings: 2,
    ingredients_text: '500 g chicken drumsticks\n2 tbsp curd\n1 tbsp ginger garlic paste\n1 tsp chilli powder\n1 tsp garam masala\n1 tbsp oil\nsalt to taste',
    steps_text: 'Mix curd, ginger garlic paste, spices, oil and salt. Coat the drumsticks and rest 20 minutes.\nPreheat the air fryer to 200 C.\nAir-fry 20 minutes, turning halfway.\nCheck there is no pink near the bone before serving.',
    air_fryer: '200 C, 20 min, turn halfway',
  },
  {
    name: 'Air-fryer mixed vegetables', cuisine: 'Air-fryer', meal_types: ['dinner', 'lunch', 'snack'],
    active_minutes: 8, total_minutes: 20, servings: 2,
    ingredients_text: '300 g mixed vegetables\n1 tbsp oil\npinch salt\npinch black pepper',
    steps_text: 'Cut the vegetables into even pieces. Toss with oil, salt and pepper.\nAir-fry at 190 C for 12 to 15 minutes, shaking halfway, until tender and lightly browned.',
    air_fryer: '190 C, 12 to 15 min, shake halfway',
  },
  {
    name: 'Egg fried rice', cuisine: 'Indo-Chinese', meal_types: ['lunch', 'dinner'],
    active_minutes: 10, total_minutes: 15, servings: 2,
    ingredients_text: '1 cup cooked rice\n2 piece egg\n1 piece onion\n1 piece carrot\n1 tbsp oil\nsalt and pepper to taste',
    steps_text: 'Beat the eggs and scramble in a hot pan with a little oil. Set aside.\nFry the chopped onion and carrot 3 minutes.\nAdd the cold rice and stir-fry 3 minutes.\nReturn the eggs, add salt and pepper and toss.',
  },
  {
    name: 'Whole wheat chapati', cuisine: 'North Indian', meal_types: ['dinner'],
    active_minutes: 15, total_minutes: 30, servings: 4,
    ingredients_text: '1 cup whole wheat flour (atta)\n0.5 cup water (more if needed)\n1 tsp oil\npinch salt',
    steps_text: 'Mix flour, salt and oil. Add water slowly and knead into a soft dough.\nRest the dough 10 minutes, covered.\nDivide into 8 balls and roll each into a thin round.\nCook on a hot tawa 30 seconds per side, then press on the flame until puffed.',
  },
  {
    name: 'Roasted chana snack', cuisine: 'Indian', meal_types: ['snack'],
    active_minutes: 2, total_minutes: 3, servings: 2,
    ingredients_text: '1 cup roasted chana (chickpeas)\npinch salt\npinch black pepper\n1 piece lemon',
    steps_text: 'Put the chana in a bowl.\nAdd salt, pepper and a squeeze of lemon. Toss and serve.',
  },
  {
    name: 'Curd and banana bowl', cuisine: 'South Indian', meal_types: ['snack', 'breakfast'],
    active_minutes: 3, total_minutes: 3, servings: 1,
    ingredients_text: '1 cup curd\n1 piece banana\n1 tbsp peanuts\npinch cinnamon',
    steps_text: 'Slice the banana into the curd.\nTop with peanuts and a pinch of cinnamon.',
  },
  {
    name: 'Cucumber peanut salad', cuisine: 'South Indian', meal_types: ['snack', 'lunch'],
    active_minutes: 5, total_minutes: 8, servings: 2,
    ingredients_text: '1 piece cucumber\n2 tbsp peanuts (roasted)\n1 piece lemon\npinch salt\npinch black pepper',
    steps_text: 'Dice the cucumber.\nAdd peanuts, salt and pepper.\nSqueeze lemon over and toss.',
  },
  {
    name: 'Boiled eggs with pepper', cuisine: 'Simple', meal_types: ['snack', 'breakfast'],
    active_minutes: 2, total_minutes: 12, servings: 1,
    ingredients_text: '2 piece egg\npinch salt\npinch black pepper',
    steps_text: 'Boil the eggs for 10 minutes. Cool in cold water and peel.\nSprinkle with salt and pepper.',
  },
  {
    name: 'Date and banana bites (no refined sugar)', cuisine: 'Dessert', meal_types: ['snack'],
    active_minutes: 5, total_minutes: 10, servings: 4,
    ingredients_text: '6 piece date (pitted)\n1 piece banana\n3 tbsp oats\n1 tbsp peanut butter',
    steps_text: 'Blend the dates and banana into a paste.\nMix in oats and peanut butter.\nRoll into 8 small balls and chill 20 minutes.',
    notes: 'No refined sugar. Not a claim of being low in calories or medically suitable.',
  },
];

module.exports = { STARTER_RECIPES };
