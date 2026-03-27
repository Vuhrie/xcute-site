function revealAll(elements) {
  elements.forEach((element) => {
    element.classList.add("is-visible");
    element.style.removeProperty("--delay");
  });
}

export function initReveal({ reducedMotion = false } = {}) {
  const elements = Array.from(document.querySelectorAll("[data-animate]"));
  if (elements.length === 0) {
    return {
      setReducedMotion() {},
      dispose() {},
    };
  }

  const setDelay = (element) => {
    const raw = element.dataset.delay;
    if (!raw) {
      element.style.removeProperty("--delay");
      return;
    }
    const delay = Number.parseInt(raw, 10);
    if (Number.isNaN(delay)) {
      element.style.removeProperty("--delay");
      return;
    }
    element.style.setProperty("--delay", `${delay}ms`);
  };

  let observer = null;

  const startObserving = () => {
    observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) {
            return;
          }

          const target = entry.target;
          setDelay(target);
          target.classList.add("is-visible");
          observer.unobserve(target);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }
    );

    elements.forEach((element) => observer.observe(element));
  };

  const stopObserving = () => {
    if (!observer) {
      return;
    }
    observer.disconnect();
    observer = null;
  };

  const setReducedMotion = (nextValue) => {
    if (nextValue) {
      stopObserving();
      revealAll(elements);
      return;
    }

    elements.forEach((element) => element.classList.remove("is-visible"));
    startObserving();
  };

  setReducedMotion(reducedMotion);

  return {
    setReducedMotion,
    dispose() {
      stopObserving();
    },
  };
}