(function () {
  "use strict";

  if (window.SenrenTheme) return;

  const modes = Object.freeze(["nord", "focus", "cyberpunk"]);
  const storageKey = "senren_--theme-mode";
  const legacyStorageKey = "senrenTheme";
  const legacyDarkModeKey = "darkMode";
  const themeClasses = [
    "custom-dark-mode",
    "focus-theme",
    "cyberpunk-theme",
  ];
  const themeScopedVariables = Object.freeze([
    "--bd-text-shadow-color-light",
    "--bd-text-shadow-color",
    "--bd-text-shadow-opacity-light",
    "--bd-text-shadow-opacity",
    "--text-light",
    "--text",
    "--light-highlight",
    "--dark-highlight",
    "--light-devoiced-color",
    "--dark-devoiced-color",
    "--freq-text-light",
    "--freq-text",
    "--tag-bg-light",
    "--tag-bg",
    "--tag-color-light",
    "--tag-color",
    "--tag-color-hover-light",
    "--tag-color-hover",
    "--external-links-bg-light",
    "--external-links-bg",
    "--external-links-bg-hover-light",
    "--external-links-bg-hover",
    "--misc-info-text-light",
    "--misc-info-text",
    "--misc-info-text-hover-light",
    "--misc-info-text-hover",
    "--misc-info-bg-light",
    "--misc-info-bg",
    "--misc-info-bg-hover-light",
    "--misc-info-bg-hover",
    "--svg-color-light",
    "--svg-color",
    "--svg-hover-light",
    "--svg-hover",
    "--buttons-bg-light",
    "--buttons-bg",
    "--buttons-bg-hover-light",
    "--buttons-bg-hover",
    "--background-light",
    "--background",
    "--card-bg-light",
    "--card-bg",
    "--card-shadow-light",
    "--card-shadow",
    "--lightbox-bg-light",
    "--lightbox-bg",
    "--pitch-position-bg-light",
    "--pitch-position-bg",
    "--pitch-red-light",
    "--pitch-red",
    "--pitch-blue-light",
    "--pitch-blue",
    "--pitch-orange-light",
    "--pitch-orange",
    "--pitch-green-light",
    "--pitch-green",
    "--pitch-purple-light",
    "--pitch-purple",
    "--word-bg-light",
    "--word-bg",
    "--picture-bg-light",
    "--picture-bg",
    "--notes-bg-light",
    "--notes-bg",
    "--definition-bg-light",
    "--definition-bg",
    "--frequency-bg-light",
    "--frequency-bg",
  ]);

  function normalize(value) {
    const mode = String(value || "").trim().toLowerCase();
    if (mode === "cyber") return "cyberpunk";
    return modes.includes(mode) ? mode : "";
  }

  function getStored() {
    const stored = normalize(
      localStorage.getItem(storageKey) ||
        localStorage.getItem(legacyStorageKey),
    );
    if (stored) return stored;

    return localStorage.getItem(legacyDarkModeKey) === "enabled"
      ? "focus"
      : "nord";
  }

  function getActive() {
    const root = document.documentElement;
    return (
      normalize(root.dataset.senrenTheme) ||
      normalize(root.style.getPropertyValue("--theme-mode")) ||
      getStored()
    );
  }

  function syncControls(mode) {
    document.querySelectorAll(".toggle-custom-dark-mode").forEach((button) => {
      button.classList.toggle("dark-mode", mode !== "nord");
      button.classList.toggle("cyberpunk-mode", mode === "cyberpunk");
      button.setAttribute(
        "title",
        `Theme: ${mode === "nord" ? "Nord" : mode === "focus" ? "Focus" : "Cyberpunk"}`,
      );
    });

    document.querySelectorAll(".sun-icon").forEach((icon) => {
      icon.style.display = mode === "focus" ? "inline" : "none";
    });
    document.querySelectorAll(".moon-icon").forEach((icon) => {
      icon.style.display = mode === "focus" ? "none" : "inline";
    });

    document
      .querySelectorAll(
        '.senren-segment-group[data-var="--theme-mode"] .senren-segment-btn',
      )
      .forEach((button) => {
        button.classList.toggle(
          "active",
          normalize(button.getAttribute("data-val")) === mode,
        );
      });
  }

  function syncThemeVariables(mode) {
    const root = document.documentElement;

    themeScopedVariables.forEach((variable) => {
      if (mode !== "nord") {
        // Focus and Cyberpunk own complete palettes in style.css. Removing
        // inline settings prevents an older Nord preset from leaking into them.
        root.style.removeProperty(variable);
        return;
      }

      const storedValue = localStorage.getItem("senren_" + variable);
      if (storedValue === null) root.style.removeProperty(variable);
      else root.style.setProperty(variable, storedValue);
    });
  }

  function apply(value, options = {}) {
    const mode = normalize(value) || getStored();
    const root = document.documentElement;
    const persist = options.persist !== false;

    root.classList.remove(...themeClasses);
    if (mode !== "nord") root.classList.add("custom-dark-mode");
    if (mode === "focus") root.classList.add("focus-theme");
    if (mode === "cyberpunk") root.classList.add("cyberpunk-theme");

    root.dataset.senrenTheme = mode;
    root.style.setProperty("--theme-mode", mode);
    syncThemeVariables(mode);

    if (persist) {
      localStorage.setItem(storageKey, mode);
      localStorage.setItem(legacyStorageKey, mode);
      localStorage.setItem(
        legacyDarkModeKey,
        mode === "nord" ? "disabled" : "enabled",
      );
    }

    syncControls(mode);
    return mode;
  }

  function cycle() {
    const currentIndex = modes.indexOf(getActive());
    return apply(modes[(currentIndex + 1) % modes.length]);
  }

  function restoreVariables() {
    const root = document.documentElement;

    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || !key.startsWith("senren_--") || key === storageKey) {
        continue;
      }

      const value = localStorage.getItem(key);
      if (value !== null) root.style.setProperty(key.substring(7), value);
    }
  }

  const api = Object.freeze({
    modes,
    themeScopedVariables,
    normalize,
    getStored,
    getActive,
    apply,
    cycle,
    syncControls,
    isThemeScopedVariable: (variable) =>
      themeScopedVariables.includes(variable),
  });

  window.SenrenTheme = api;
  window.SENREN_THEME_MODES = modes;
  window.senrenApplyThemeMode = apply;

  restoreVariables();
  apply(getStored(), { persist: false });
  window.__senrenSettingsRestored = true;
})();
