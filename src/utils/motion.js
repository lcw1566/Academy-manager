// Fast easeOutExpo - iOS-like feel
export const fastEase = [0.22, 1, 0.36, 1];

// Bottom sheet slide up/down
export const sheetTransition = {
  type: 'tween',
  duration: 0.28,
  ease: fastEase,
};

// Quick fade (backdrop, overlays)
export const fadeTransition = {
  duration: 0.18,
  ease: 'easeOut',
};

// Inline collapse/expand (opacity + y only, no height)
export const collapseTransition = {
  duration: 0.2,
  ease: fastEase,
};

// Reusable motion props
export const sheetMotion = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit:    { y: '100%' },
  transition: sheetTransition,
};

export const fadeMotion = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit:    { opacity: 0 },
  transition: fadeTransition,
};

export const collapseMotion = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -6 },
  transition: collapseTransition,
};
