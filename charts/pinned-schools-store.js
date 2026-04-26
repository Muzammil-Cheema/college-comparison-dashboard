const MAX_PINNED_SCHOOLS = 12;
const PIN_LIMIT_MESSAGE = "Too many schools selected. Try removing some to add others.";
const PINNED_COLOR_PALETTE = [
  "#d73027", // red
  "#4575b4", // blue
  "#ffd92f", // yellow
  "#1a9850", // green
  "#984ea3", // purple
  "#ff7f00", // orange
  "#a65628", // brown
  "#f781bf", // pink
  "#999999", // gray
  "#17becf", // cyan
  "#66a61e", // lime
  "#e7298a" // magenta
];

const pinnedSchoolIds = new Set();
const subscribers = new Set();

let pinLimitTooltip;
let pinLimitHideTimeout;
let pointerFollowActive = false;
let latestPointerPosition = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

function getSnapshot() {
  return new Set(pinnedSchoolIds);
}

function notifySubscribers() {
  const snapshot = getSnapshot();
  subscribers.forEach((listener) => listener(snapshot));
}

function updateTooltipPosition(x, y) {
  if (!pinLimitTooltip) {
    return;
  }

  pinLimitTooltip.style.left = `${x}px`;
  pinLimitTooltip.style.top = `${y}px`;
}

function handlePointerMove(event) {
  latestPointerPosition = { x: event.clientX, y: event.clientY };
  updateTooltipPosition(latestPointerPosition.x, latestPointerPosition.y);
}

function showPinLimitTooltip(event) {
  if (!pinLimitTooltip) {
    pinLimitTooltip = document.createElement("div");
    pinLimitTooltip.className = "pin-limit-tooltip";
    document.body.appendChild(pinLimitTooltip);
  }

  pinLimitTooltip.textContent = PIN_LIMIT_MESSAGE;
  pinLimitTooltip.classList.add("is-visible");

  if (event && Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
    latestPointerPosition = { x: event.clientX, y: event.clientY };
  }

  updateTooltipPosition(latestPointerPosition.x, latestPointerPosition.y);

  if (!pointerFollowActive) {
    pointerFollowActive = true;
    window.addEventListener("pointermove", handlePointerMove);
  }

  window.clearTimeout(pinLimitHideTimeout);
  pinLimitHideTimeout = window.setTimeout(() => {
    if (pinLimitTooltip) {
      pinLimitTooltip.classList.remove("is-visible");
    }

    if (pointerFollowActive) {
      pointerFollowActive = false;
      window.removeEventListener("pointermove", handlePointerMove);
    }
  }, 4000);
}

export function isSchoolPinned(schoolId) {
  return pinnedSchoolIds.has(schoolId);
}

export function getPinnedSchoolIds() {
  return getSnapshot();
}

export function getPinnedColorMap(pinnedSchoolIds) {
  const idsInAssignmentOrder = [...pinnedSchoolIds];
  return new Map(
    idsInAssignmentOrder.map((schoolId, index) => [
      schoolId,
      PINNED_COLOR_PALETTE[index % PINNED_COLOR_PALETTE.length]
    ])
  );
}

export function subscribePinnedSchools(listener) {
  subscribers.add(listener);
  listener(getSnapshot());

  return () => {
    subscribers.delete(listener);
  };
}

export function togglePinnedSchool(schoolId, event) {
  if (!schoolId) {
    return { changed: false, reason: "invalid" };
  }

  if (pinnedSchoolIds.has(schoolId)) {
    pinnedSchoolIds.delete(schoolId);
    notifySubscribers();
    return { changed: true, reason: "removed" };
  }

  if (pinnedSchoolIds.size >= MAX_PINNED_SCHOOLS) {
    showPinLimitTooltip(event);
    return { changed: false, reason: "max-size-reached" };
  }

  pinnedSchoolIds.add(schoolId);
  notifySubscribers();
  return { changed: true, reason: "added" };
}

export function pinSchool(schoolId, event) {
  if (!schoolId) {
    return { changed: false, reason: "invalid" };
  }

  if (pinnedSchoolIds.has(schoolId)) {
    return { changed: false, reason: "already-pinned" };
  }

  if (pinnedSchoolIds.size >= MAX_PINNED_SCHOOLS) {
    showPinLimitTooltip(event);
    return { changed: false, reason: "max-size-reached" };
  }

  pinnedSchoolIds.add(schoolId);
  notifySubscribers();
  return { changed: true, reason: "added" };
}

export function pinSchools(schoolIds, event) {
  const uniqueSchoolIds = [...new Set((schoolIds || []).filter(Boolean))];
  if (!uniqueSchoolIds.length) {
    return { changed: false, addedCount: 0, blockedCount: 0 };
  }

  let addedCount = 0;
  let blockedCount = 0;

  uniqueSchoolIds.forEach((schoolId) => {
    if (pinnedSchoolIds.has(schoolId)) {
      return;
    }

    if (pinnedSchoolIds.size >= MAX_PINNED_SCHOOLS) {
      blockedCount += 1;
      return;
    }

    pinnedSchoolIds.add(schoolId);
    addedCount += 1;
  });

  if (addedCount > 0) {
    notifySubscribers();
  }

  if (blockedCount > 0) {
    showPinLimitTooltip(event);
  }

  return {
    changed: addedCount > 0,
    addedCount,
    blockedCount
  };
}

export function replacePinnedSchools(schoolIds, event) {
  const uniqueSchoolIds = [...new Set((schoolIds || []).filter(Boolean))];
  const hadExistingPins = pinnedSchoolIds.size > 0;
  pinnedSchoolIds.clear();

  let addedCount = 0;
  let blockedCount = 0;

  uniqueSchoolIds.forEach((schoolId) => {
    if (pinnedSchoolIds.size >= MAX_PINNED_SCHOOLS) {
      blockedCount += 1;
      return;
    }

    pinnedSchoolIds.add(schoolId);
    addedCount += 1;
  });

  if (hadExistingPins || addedCount > 0) {
    notifySubscribers();
  }

  if (blockedCount > 0) {
    showPinLimitTooltip(event);
  }

  return {
    changed: hadExistingPins || addedCount > 0,
    addedCount,
    blockedCount
  };
}

export function clearPinnedSchools() {
  if (pinnedSchoolIds.size === 0) {
    return { changed: false };
  }

  pinnedSchoolIds.clear();
  notifySubscribers();
  return { changed: true };
}

export { MAX_PINNED_SCHOOLS, PIN_LIMIT_MESSAGE, PINNED_COLOR_PALETTE };
