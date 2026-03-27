import { initHeroAnimation } from "./modules/hero.js";
import { initMotionPreference } from "./modules/motion-pref.js";
import { initReveal } from "./modules/reveal.js";
import { initVersionBadge } from "./modules/version.js";

const motion = initMotionPreference();
const hero = initHeroAnimation({ reducedMotion: motion.isReducedMotion });
const reveal = initReveal({ reducedMotion: motion.isReducedMotion });
initVersionBadge();

motion.subscribe((isReducedMotion) => {
  hero.setReducedMotion(isReducedMotion);
  reveal.setReducedMotion(isReducedMotion);
});
