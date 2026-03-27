import { canAnimate, waapi } from "./motion-utils.js";

function isTransitionLink(anchor) {
  if (!anchor || anchor.target === "_blank") return false;
  const href = anchor.getAttribute("href");
  if (!href) return false;
  if (!href.startsWith("/") && !href.startsWith("./") && !href.startsWith("../")) return false;
  const url = new URL(href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  if (url.pathname === window.location.pathname && url.hash) return false;
  return url.pathname === "/" || url.pathname === "/scheduler";
}

function intro(node) {
  waapi(
    node,
    [
      { opacity: 0, transform: "translate3d(0,16px,0) scale(0.992)", filter: "blur(6px)" },
      { opacity: 1, transform: "translate3d(0,0,0) scale(1)", filter: "blur(0)" },
    ],
    { duration: 540, easing: "cubic-bezier(0.16, 1, 0.3, 1)", fill: "both" }
  );
}

async function outro(node) {
  const animation = waapi(
    node,
    [
      { opacity: 1, transform: "translate3d(0,0,0) scale(1)", filter: "blur(0px)" },
      { opacity: 0, transform: "translate3d(0,12px,0) scale(0.988)", filter: "blur(4px)" },
    ],
    { duration: 340, easing: "cubic-bezier(0.4, 0, 0.2, 1)", fill: "forwards" }
  );
  try {
    if (animation?.finished) await animation.finished;
  } catch {}
}

export function initRouteTransitions() {
  const node = document.querySelector("main") || document.body;
  let busy = false;

  if (canAnimate()) intro(node);

  const onClick = async (event) => {
    const anchor = event.target?.closest?.("a[href]");
    if (!isTransitionLink(anchor)) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!canAnimate() || busy) return;
    event.preventDefault();
    busy = true;
    const url = new URL(anchor.href, window.location.href).toString();

    if (typeof document.startViewTransition === "function") {
      try {
        document.startViewTransition(() => {
          window.location.assign(url);
        });
        return;
      } catch {}
    }

    await outro(node);
    window.location.assign(url);
  };

  document.addEventListener("click", onClick);
  return {
    dispose() {
      document.removeEventListener("click", onClick);
    },
  };
}
