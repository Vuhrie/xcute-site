const FALLBACK_VERSION = "v0.5.0";
const VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;

async function loadVersionFromFile() {
  try {
    const response = await fetch("./VERSION", { cache: "no-store" });
    if (!response.ok) {
      return null;
    }

    const rawValue = (await response.text()).trim();
    if (!VERSION_PATTERN.test(rawValue)) {
      return null;
    }

    return rawValue;
  } catch {
    return null;
  }
}

function applyVersion(badge, version) {
  badge.textContent = `Version ${version}`;
  badge.dataset.version = version;
  badge.classList.add("is-live");
}

export function initVersionBadge() {
  const badge = document.querySelector(".js-version-badge");
  if (!badge) {
    return;
  }

  applyVersion(badge, FALLBACK_VERSION);

  loadVersionFromFile().then((versionFromFile) => {
    if (!versionFromFile) {
      return;
    }
    applyVersion(badge, versionFromFile);
  });
}


