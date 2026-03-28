export function animatePanel() {}

export function animateRows() {}

export function animateStateBump(node) {
  if (!node) return;
  node.classList.remove("x-bump");
  void node.offsetWidth;
  node.classList.add("x-bump");
  setTimeout(() => node.classList.remove("x-bump"), 160);
}
