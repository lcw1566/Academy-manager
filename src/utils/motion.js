// Toss-style motion system
//
// Rules:
// - Spring physics only. No duration / ease based transitions.
// - Animate transform and opacity. Avoid layout-moving CSS properties.
// - Keep stable transition names for legacy imports while replacing internals
//   with spring presets.

export const tossSpring = {
  // Fast, elastic tactile response for taps, chips, icon buttons.
  tap: {
    type: 'spring',
    mass: 0.45,
    stiffness: 760,
    damping: 32,
    restDelta: 0.001,
    restSpeed: 0.001,
  },

  // Natural content/card/page movement.
  soft: {
    type: 'spring',
    mass: 0.8,
    stiffness: 360,
    damping: 34,
    restDelta: 0.001,
    restSpeed: 0.001,
  },

  // Slightly firmer list/layout reconciliation for async data changes.
  layout: {
    type: 'spring',
    mass: 0.75,
    stiffness: 420,
    damping: 38,
    restDelta: 0.001,
    restSpeed: 0.001,
  },

  // Heavy sheet/modal surface. Fast enough to feel native, damped enough to
  // avoid wobble when dismissed by drag velocity.
  sheet: {
    type: 'spring',
    mass: 0.95,
    stiffness: 520,
    damping: 44,
    restDelta: 0.001,
    restSpeed: 0.001,
  },

  // Opacity-only transitions still use spring to keep one motion language.
  fade: {
    type: 'spring',
    mass: 0.4,
    stiffness: 520,
    damping: 40,
    restDelta: 0.001,
    restSpeed: 0.001,
  },
};

export const tapMotion = {
  whileTap: { scale: 0.965, y: 1 },
  transition: tossSpring.tap,
};

export const sheetTransition = tossSpring.sheet;
export const fadeTransition = tossSpring.fade;
export const collapseTransition = tossSpring.soft;

export const layoutTransition = tossSpring.layout;

export const sheetMotion = {
  initial: { y: '100%', opacity: 1 },
  animate: { y: 0, opacity: 1 },
  exit: { y: '100%', opacity: 1 },
  transition: sheetTransition,
};

export const fadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: fadeTransition,
};

export const collapseMotion = {
  initial: { opacity: 0, y: -8, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.985 },
  transition: collapseTransition,
};

export const listItemMotion = {
  layout: 'position',
  initial: { opacity: 0, y: 10, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -8, scale: 0.985 },
  transition: layoutTransition,
};
