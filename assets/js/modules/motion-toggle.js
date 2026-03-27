export function initMotionToggle({ motion }) {
  if (!motion) return { dispose() {} };
  const button = document.createElement("button");
  button.type = "button";
  button.className = "c-motion-toggle";
  button.setAttribute("data-motion-role", "chip");
  button.setAttribute("aria-label", "Toggle motion mode");

  const paint = () => {
    const on = motion.getMode() === "on";
    button.setAttribute("aria-pressed", on ? "true" : "false");
    button.textContent = on ? "Motion On" : "Motion Off";
  };

  button.addEventListener("click", () => {
    motion.toggleMode();
    paint();
  });

  const anchor = document.body;
  anchor.append(button);
  const unsubscribe = motion.subscribe(() => paint());
  paint();

  return {
    dispose() {
      unsubscribe?.();
      button.remove();
    },
  };
}
