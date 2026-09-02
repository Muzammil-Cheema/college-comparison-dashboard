let tooltipElement;
let showTimeoutId;
let hideTimeoutId;
let activeTarget = null;

const SHOW_DELAY_MS = 70;
const HIDE_DELAY_MS = 35;
const OFFSET_X = 14;
const OFFSET_Y = 16;
const ATTRIBUTE_SEPARATOR = ":";

function ensureTooltipElement() {
  if (tooltipElement) {
    return tooltipElement;
  }

  tooltipElement = document.createElement("div");
  tooltipElement.className = "chart-hover-tooltip";
  document.body.appendChild(tooltipElement);
  return tooltipElement;
}

function updateTooltipPosition(event) {
  if (!tooltipElement || !event) {
    return;
  }

  tooltipElement.style.left = `${event.clientX}px`;
  tooltipElement.style.top = `${event.clientY}px`;
  tooltipElement.style.transform = `translate(${OFFSET_X}px, ${OFFSET_Y}px)`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTooltipText(text) {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return "";
  }

  const [title, ...details] = lines;
  const titleHtml = `<div class="chart-hover-tooltip__title">${escapeHtml(title)}</div>`;
  const detailHtml = details
    .map((line) => {
      const separatorIndex = line.indexOf(ATTRIBUTE_SEPARATOR);
      if (separatorIndex <= 0) {
        return `<div class="chart-hover-tooltip__line">${escapeHtml(line)}</div>`;
      }

      const label = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      return `<div class="chart-hover-tooltip__line"><span class="chart-hover-tooltip__label">${escapeHtml(label)}:</span> ${escapeHtml(value)}</div>`;
    })
    .join("");

  return `${titleHtml}${detailHtml}`;
}

function resolveTooltipMarkup(content) {
  if (content && typeof content === "object") {
    if (typeof content.html === "string") {
      return content.html;
    }
    if (typeof content.text === "string") {
      return formatTooltipText(content.text);
    }
  }

  return formatTooltipText(content);
}

function showTooltip(event, content) {
  const el = ensureTooltipElement();
  const markup = resolveTooltipMarkup(content);
  if (!markup) {
    return;
  }
  el.innerHTML = markup;
  updateTooltipPosition(event);
  el.classList.add("is-visible");
}

function hideTooltip() {
  if (!tooltipElement) {
    return;
  }
  tooltipElement.classList.remove("is-visible");
  activeTarget = null;
}

function getTooltipContent(contentOrFactory, event, datum) {
  if (typeof contentOrFactory === "function") {
    return contentOrFactory(event, datum);
  }
  return contentOrFactory;
}

export function bindHoverTooltip(selection, contentOrFactory) {
  selection
    .on("pointerenter.hoverTooltip", function handlePointerEnter(event, datum) {
      const content = getTooltipContent(contentOrFactory, event, datum);
      if (!content) {
        return;
      }

      const target = this;
      activeTarget = target;
      window.clearTimeout(hideTimeoutId);
      window.clearTimeout(showTimeoutId);
      showTimeoutId = window.setTimeout(() => {
        if (activeTarget !== target) {
          return;
        }
        showTooltip(event, content);
      }, SHOW_DELAY_MS);
    })
    .on("pointermove.hoverTooltip", function handlePointerMove(event, datum) {
      const target = this;
      if (activeTarget !== target) {
        return;
      }

      const content = getTooltipContent(contentOrFactory, event, datum);
      if (!content) {
        return;
      }

      if (tooltipElement?.classList.contains("is-visible")) {
        const markup = resolveTooltipMarkup(content);
        if (markup) {
          tooltipElement.innerHTML = markup;
        }
      }
      updateTooltipPosition(event);
    })
    .on("pointerleave.hoverTooltip pointercancel.hoverTooltip", function handlePointerLeave() {
      const target = this;
      if (activeTarget !== target) {
        return;
      }
      window.clearTimeout(showTimeoutId);
      window.clearTimeout(hideTimeoutId);
      hideTimeoutId = window.setTimeout(hideTooltip, HIDE_DELAY_MS);
    });
}
