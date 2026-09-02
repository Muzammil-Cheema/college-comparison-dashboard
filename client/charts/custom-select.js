function createOptionButton(option, select) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "chart-custom-select__option";
  button.dataset.value = option.value;
  button.textContent = option.textContent || option.label || option.value;
  button.disabled = option.disabled;
  button.setAttribute("role", "option");
  button.setAttribute("aria-selected", option.selected ? "true" : "false");

  if (option.disabled) {
    button.classList.add("is-disabled");
  }
  if (option.selected) {
    button.classList.add("is-selected");
  }

  button.addEventListener("click", () => {
    if (option.disabled) {
      return;
    }

    select.value = option.value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });

  return button;
}

function getSelectedOption(select) {
  const selectedOption = select.options[select.selectedIndex];
  if (selectedOption) {
    return selectedOption;
  }

  return [...select.options].find((option) => !option.disabled) || null;
}

export function enhanceSingleSelect(select) {
  if (!select || select.dataset.customSelectEnhanced === "true") {
    return null;
  }

  select.dataset.customSelectEnhanced = "true";
  select.classList.add("chart-custom-select__native");

  const root = document.createElement("div");
  root.className = "chart-custom-select";

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "chart-custom-select__trigger";
  trigger.setAttribute("aria-haspopup", "listbox");
  trigger.setAttribute("aria-expanded", "false");

  const triggerText = document.createElement("span");
  triggerText.className = "chart-custom-select__trigger-text";
  trigger.append(triggerText);

  const menu = document.createElement("div");
  menu.className = "chart-custom-select__menu";
  menu.setAttribute("role", "listbox");

  const computedStyle = window.getComputedStyle(select);
  if (computedStyle.minWidth && computedStyle.minWidth !== "0px") {
    root.style.minWidth = computedStyle.minWidth;
  }
  if (computedStyle.maxWidth && computedStyle.maxWidth !== "none") {
    root.style.maxWidth = computedStyle.maxWidth;
  }

  select.insertAdjacentElement("afterend", root);
  root.append(select, trigger, menu);

  function closeMenu() {
    root.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    if (trigger.disabled) {
      return;
    }
    root.classList.add("is-open");
    trigger.setAttribute("aria-expanded", "true");
  }

  function render() {
    const options = [...select.options];
    menu.replaceChildren(...options.map((option) => createOptionButton(option, select)));

    const selectedOption = getSelectedOption(select);
    triggerText.textContent = selectedOption ? selectedOption.textContent || selectedOption.label : "Select";
    trigger.disabled = !selectedOption;
    trigger.classList.toggle("is-disabled", !selectedOption);
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (root.classList.contains("is-open")) {
      closeMenu();
      return;
    }
    openMenu();
  });

  trigger.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      trigger.focus();
    }
  });

  menu.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      trigger.focus();
    }
  });

  document.addEventListener("pointerdown", (event) => {
    if (!root.contains(event.target)) {
      closeMenu();
    }
  });

  select.addEventListener("change", () => {
    render();
    closeMenu();
  });

  const observer = new MutationObserver(() => {
    render();
  });
  observer.observe(select, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["disabled", "label", "value", "selected", "style"]
  });

  render();

  return {
    destroy() {
      observer.disconnect();
      closeMenu();
      root.insertAdjacentElement("beforebegin", select);
      root.remove();
      select.classList.remove("chart-custom-select__native");
      delete select.dataset.customSelectEnhanced;
    }
  };
}
