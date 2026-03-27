function buildAnimatedText(element, text) {
  const fragment = document.createDocumentFragment();
  let visibleIndex = 0;

  for (const char of text) {
    if (char === " ") {
      const spacer = document.createElement("span");
      spacer.className = "c-hero__space";
      spacer.textContent = " ";
      fragment.append(spacer);
      continue;
    }

    const node = document.createElement("span");
    node.className = "c-hero__char";
    node.style.setProperty("--char-index", visibleIndex.toString());
    node.textContent = char;
    fragment.append(node);
    visibleIndex += 1;
  }

  element.textContent = "";
  element.append(fragment);
  element.setAttribute("aria-label", text);
}

export function initHeroAnimation({ reducedMotion = false } = {}) {
  const title = document.querySelector(".js-hero-title");
  if (!title) {
    return {
      setReducedMotion() {},
    };
  }

  const originalText = title.dataset.text || title.textContent.trim();

  const animate = (isReduced) => {
    title.classList.remove("is-animated");
    title.textContent = originalText;
    title.removeAttribute("aria-label");

    if (isReduced) {
      return;
    }

    buildAnimatedText(title, originalText);
    requestAnimationFrame(() => {
      title.classList.add("is-animated");
    });
  };

  animate(reducedMotion);

  return {
    setReducedMotion(nextValue) {
      animate(nextValue);
    },
  };
}