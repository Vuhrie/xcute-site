import { initHeroAnimation } from "./modules/hero.js";
import { initAmbientSpace } from "./modules/ambient.js";
import { initMotionPreference } from "./modules/motion-pref.js";
import { initReveal } from "./modules/reveal.js";
import { initRouteTransitions } from "./modules/route-transition.js";
import { initTiltMotion } from "./modules/tilt.js";
import { initVersionBadge } from "./modules/version.js";

const motion = initMotionPreference();
const hero = initHeroAnimation({ reducedMotion: motion.isReducedMotion });
const reveal = initReveal({ reducedMotion: motion.isReducedMotion });
const ambient = initAmbientSpace();
initRouteTransitions();
const tilt = initTiltMotion();
initVersionBadge();
ambient.setReducedMotion(motion.isReducedMotion);
tilt.setReducedMotion(motion.isReducedMotion);

motion.subscribe((isReducedMotion) => {
  hero.setReducedMotion(isReducedMotion);
  reveal.setReducedMotion(isReducedMotion);
  ambient.setReducedMotion(isReducedMotion);
  tilt.setReducedMotion(isReducedMotion);
});
