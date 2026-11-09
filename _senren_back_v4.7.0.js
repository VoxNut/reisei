var senrenConfig = {};

  // Helper functions for shortcuts
  window.parseKeyConfig = function (configStr) {
    if (!configStr) return null;
    const parts = configStr
      .toLowerCase()
      .split(/[\s+]+/)
      .filter((p) => p);
    if (parts.length === 0) return null;

    const key = parts.pop();
    return {
      key: key,
      ctrl: parts.includes("ctrl") || parts.includes("control"),
      alt: parts.includes("alt"),
      shift: parts.includes("shift"),
      meta: parts.includes("meta") || parts.includes("cmd"),
    };
  };

  window.isKeyMatch = function (event, config) {
    if (!config) return false;
    return (
      event.key.toLowerCase() === config.key &&
      event.ctrlKey === config.ctrl &&
      event.altKey === config.alt &&
      event.shiftKey === config.shift &&
      event.metaKey === config.meta
    );
  };

  // Theme toggle
  function darkMode() {
    if (!window.SenrenTheme) return;
    const button = document.querySelector(".toggle-custom-dark-mode");
    window.SenrenTheme.apply();

    if (button && !button.dataset.hasClickListener) {
      button.addEventListener("click", () => {
        window.SenrenTheme.cycle();
      });
      button.dataset.hasClickListener = "true";
    }
  }

  // Collect images from the glossary and add them to the picture container
  function collectGlossaryImages(deferred = false) {
    if (senrenConfig.collectGlossaryImages !== "true") return;

    const pictureContainer = ELS.pictureContainer;
    if (
      !pictureContainer ||
      pictureContainer.dataset.senrenGlossaryCollectionDone === "true"
    ) {
      return;
    }

    const glossaryItems = document.querySelectorAll(
      "#glossary img, #definition img",
    );
    let maxImages = parseInt(senrenConfig.collectGlossaryImagesMax, 10);
    if (Number.isNaN(maxImages) || maxImages < 0) maxImages = 0;
    let minDim = parseInt(senrenConfig.collectGlossaryImagesMinDim, 10);
    if (Number.isNaN(minDim) || minDim < 0) minDim = 0;
    let minArea = parseInt(senrenConfig.collectGlossaryImagesMinArea, 10);
    if (Number.isNaN(minArea) || minArea < 0) minArea = 0;

    if (!glossaryItems.length) return;

    const processedSrcs =
      pictureContainer._senrenGlossaryProcessedSrcs ||
      (pictureContainer._senrenGlossaryProcessedSrcs = new Set());

    if (
      !deferred &&
      pictureContainer.querySelector("img:not(.senren-filtered-image)")
    ) {
      return;
    }

    const existingSrcs = new Set(
      Array.from(pictureContainer.querySelectorAll("img")).map(
        (img) => img.src,
      ),
    );
    let scheduledCount = existingSrcs.size;
    if (maxImages > 0 && scheduledCount >= maxImages) {
      pictureContainer.dataset.senrenGlossaryCollectionDone = "true";
      return;
    }

    glossaryItems.forEach((img) => {
      if (maxImages > 0 && scheduledCount >= maxImages) return;
      const src = img.currentSrc || img.src;
      if (!src || existingSrcs.has(src) || processedSrcs.has(src)) return;

      if (
        src === window.location.href ||
        src.toLowerCase().endsWith(".svg") ||
        img.closest('span[data-sc-pixiv="read-more-link"] a') ||
        img.closest(
          '[data-dictionary*="漢字でGo!"], [data-dictionary*="現代国語例解辞典"]',
        )
      ) {
        processedSrcs.add(src);
        return;
      }

      existingSrcs.add(src);
      processedSrcs.add(src);
      scheduledCount += 1;

      const newImg = new Image();
      newImg.decoding = "async";
      newImg.fetchPriority = "low";
      newImg.loading = "lazy";
      newImg.src = src;

      newImg.onload = () => {
        if (!pictureContainer.isConnected) return;
        const w = newImg.naturalWidth;
        const h = newImg.naturalHeight;
        const aspectRatio = w / h;

        // Skip small icons and badge-shaped images (e.g. 派生語 tags)
        if (w < 80 || h < 80 || aspectRatio > 2.2 || aspectRatio < 0.4) return;
        if (minDim > 0 && (w < minDim || h < minDim)) return;
        if (minArea > 0 && w * h < minArea) return;

        const finalAspectRatio = aspectRatio;

        if (
          w >= 120 &&
          h >= 180 &&
          finalAspectRatio >= 0.7 &&
          finalAspectRatio <= 1.6
        ) {
          newImg.classList.add("tappable");
        }

        pictureContainer.appendChild(newImg);
        window.senrenRefreshPictures?.();
      };
    });

    pictureContainer.dataset.senrenGlossaryCollectionDone = "true";
  }

  // Quick filter to hide tiny dash/icon images before they flash on screen
  function prefilterTinyImages() {
    const back = ELS.back;
    const pictureContainer = ELS.pictureContainer;
    if (!pictureContainer) {
      if (back) back.classList.add("images-ready");
      return;
    }

    const images = Array.from(pictureContainer.querySelectorAll("img"));
    if (!images.length) {
      if (back) back.classList.add("images-ready");
      return;
    }

    const isTinyByDimensions = (w, h) => {
      if (!w || !h) return false;
      return h <= 24 || w <= 24 || (w <= 32 && h <= 32);
    };

    const refreshScenes = () => {
      if (typeof window.senrenRefreshScenes === "function") {
        window.senrenRefreshScenes();
      }
    };

    images.forEach((img) => {
      const applyFilter = () => {
        if (img.classList.contains("senren-filtered-image")) {
          img.style.setProperty("display", "none", "important");
          img.style.visibility = "";
          return;
        }

        if (isTinyByDimensions(img.naturalWidth, img.naturalHeight)) {
          img.classList.add("senren-filtered-image");
          img.style.setProperty("display", "none", "important");
          refreshScenes();
        }

        img.style.visibility = "";
      };

      if (img.complete) {
        applyFilter();
      } else {
        img.style.visibility = "hidden";

        const onDone = () => {
          applyFilter();
          img.removeEventListener("load", onDone);
          img.removeEventListener("error", onDone);
        };

        img.addEventListener("load", onDone);
        img.addEventListener("error", onDone);
      }
    });

    if (back) back.classList.add("images-ready");
  }

  // Manages cycling between Selection Text, Definition, and Glossary
  function prepareDictionarySources() {
    document.querySelectorAll("template.senren-dictionary-source").forEach((source) => {
      const host = source.parentElement;
      const content = source.content.ownerDocument.createElement("div");
      content.append(source.content);
      content.querySelectorAll("script").forEach((node) => node.remove());
      consolidateYomitanGlossaryEntries(content);
      const entries = Array.from(content.querySelectorAll("li[data-dictionary]"))
        .filter((entry) => !entry.parentElement.closest("li[data-dictionary]"));
      if (entries.length) {
        const styles = Array.from(content.querySelectorAll('style, link[rel="stylesheet"]'))
          .filter((style) => !style.closest("li[data-dictionary]"));
        styles.forEach((style) => style.remove());
        const loadStyles = () => {
          host.prepend(...styles);
          styles.length = 0;
        };
        entries.forEach((entry) => {
          const copy = entry.cloneNode(true);
          copy.querySelectorAll("style, script, .dictionary-title").forEach((node) => node.remove());
          entry._senrenHasContent = Boolean(copy.textContent.replace(/[\s\u200b\ufeff]/g, "") ||
            copy.querySelector("img[src], svg, audio[src], video[src]"));
          const payload = content.ownerDocument.createElement("template");
          payload.content.append(...entry.childNodes);
          entry.appendChild(payload);
          entry._senrenMount = () => {
            loadStyles();
            payload.replaceWith(payload.content);
            entry._senrenMount = null;
          };
        });
      } else {
        const probe = content.cloneNode(true);
        probe.querySelectorAll('style, link, script').forEach((node) => node.remove());
        if (!probe.textContent.trim() && !probe.querySelector("img, svg, audio, video")) {
          source.remove();
          return;
        }
      }
      source.replaceWith(...content.childNodes);
    });
  }

  function activateDictionary(item) {
    const mounting = Boolean(item.element._senrenMount);
    item.element._senrenMount?.();
    window.senrenInitDictionaryHover?.(item.element);
    if (mounting && ELS.pictureContainer) {
      delete ELS.pictureContainer.dataset.senrenGlossaryCollectionDone;
      collectGlossaryImages(true);
    }
  }

  function toggleDefinition() {
    const toggleAreas = document.querySelectorAll(
      ".toggle-area:not(#notes .toggle-area)",
    );
    const selectionText = ELS.selectionText;
    const definition = ELS.definition;
    const glossary = ELS.glossary;
    const allGlossaryListItems = [
      ...document.querySelectorAll(
        "#glossary .glossary-box li[data-dictionary], #glossary > div > span > div > i",
      ),
      ...document.querySelectorAll(
        '#glossary div[style*="margin-bottom: 12px"][style*="display: flex"]',
      ),
    ];
    const dictionaryPreference =
      document.getElementById("dictionaryPreference")?.textContent.trim() || "";

    function updateBackgroundColor(element) {
      const backDiv = document.querySelector(".back");
      if (!backDiv || !element) return;

      const computed = getComputedStyle(element);
      const color = computed.getPropertyValue("--dict-color").trim();
      const rgb = computed.getPropertyValue("--dict-color-rgb").trim();

      if (color) backDiv.style.setProperty("--dict-color", color);
      if (rgb) backDiv.style.setProperty("--dict-color-rgb", rgb);
    }

    function getDictionaryName(element) {
      if (element.tagName === "LI" && element.hasAttribute("data-dictionary")) {
        return element.getAttribute("data-dictionary");
      }
      return null;
    }

    function hasDictionaryContent(element) {
      if (!element) return false;
      if (element._senrenHasContent !== undefined) return element._senrenHasContent;
      const entries = Array.from(element.querySelectorAll("li[data-dictionary]"));
      if (entries.length && entries.every((entry) => entry._senrenHasContent !== undefined)) {
        return entries.some((entry) => entry._senrenHasContent);
      }
      const content = element.cloneNode(true);
      // Imported styles and navigation UI are not dictionary entries.
      content.querySelectorAll("style, script, link, .dictionary-counter, .dictionary-title, .toggle-area")
        .forEach((node) => node.remove());
      return content.textContent.replace(/[\s\u200b\ufeff]/g, "") !== "" ||
        Boolean(content.querySelector("img[src], svg, audio[src], video[src]"));
    }

    const hasSelectionText = hasDictionaryContent(selectionText);
    const hasDefinition = hasDictionaryContent(definition);
    let definitionDictName = null;

    if (hasDefinition) {
      const definitionLi = definition.querySelector(
        ".definition-box li[data-dictionary]",
      );
      if (definitionLi) {
        definitionDictName = definitionLi.getAttribute("data-dictionary");
      }
    }

    const availableGlossaryItems = allGlossaryListItems.filter((li) => {
      if (!hasDictionaryContent(li)) return false;
      const parentDiv = li.closest("div");
      if (parentDiv && parentDiv.classList.contains("ignore")) {
        return false;
      }

      return true;
    });
    const dictionaryFamily = (name) => name.replace(/\s*\[\d{4}-\d{2}-\d{2}\]\s*$/, "");
    const matchingDefinition = definitionDictName ? availableGlossaryItems.find((li) =>
      getDictionaryName(li) === definitionDictName) || availableGlossaryItems.find((li) => {
        const name = getDictionaryName(li);
        return name && dictionaryFamily(name) === dictionaryFamily(definitionDictName);
      }) : null;
    // Use the glossary's dated entry instead of adding a second Definition version.
    const useDefinition = hasDefinition && (!matchingDefinition ||
      getDictionaryName(matchingDefinition) === definitionDictName);
    const visibleGlossaryItems = availableGlossaryItems.filter((li) =>
      !useDefinition || !definitionDictName || getDictionaryName(li) !== definitionDictName);

    const currentVisibleItems = [];
    if (hasSelectionText)
      currentVisibleItems.push({
        type: "selectionText",
        element: selectionText,
        container: selectionText,
      });
    let definitionItem = null;
    if (useDefinition) {
      const defLi = definition.querySelector(
        ".definition-box li[data-dictionary]",
      );
      definitionItem = {
        type: "definition",
        element: defLi || definition,
        container: definition,
      };
      if (!matchingDefinition) currentVisibleItems.push(definitionItem);
    }

    if (availableGlossaryItems.length > 0) {
      availableGlossaryItems.forEach((li) => {
        // A Definition duplicate occupies its dictionary's original glossary slot.
        if (!visibleGlossaryItems.includes(li)) {
          if (!currentVisibleItems.includes(definitionItem)) currentVisibleItems.push(definitionItem);
          return;
        }
        currentVisibleItems.push({
          type: "glossary",
          element: li,
          container: glossary,
        });
      });
    }

    const totalVisibleItemsCount = currentVisibleItems.length;

    toggleAreas.forEach((area) => {
      if (totalVisibleItemsCount <= 1) {
        area.style.display = "none";
      } else {
        area.style.display = "";
      }
    });

    function updateCounters(activeIndex) {
      const counterText =
        totalVisibleItemsCount > 0
          ? `${activeIndex + 1} / ${totalVisibleItemsCount}`
          : "";

      [selectionText, definition, glossary].forEach((container) => {
        if (container) {
          const counterDiv = container.querySelector(".dictionary-counter");
          if (counterDiv) {
            counterDiv.textContent = "";
          }
        }
      });

      if (activeIndex !== -1 && totalVisibleItemsCount > 0) {
        const activeItem = currentVisibleItems[activeIndex];
        if (activeItem && activeItem.container) {
          const activeCounterDiv = activeItem.container.querySelector(
            ".dictionary-counter",
          );
          if (activeCounterDiv) {
            activeCounterDiv.textContent = counterText;
          }
        }
      }
    }

    function getCurrentIndex() {
      let activeIndex = -1;
      if (selectionText && selectionText.classList.contains("show")) {
        activeIndex = currentVisibleItems.findIndex(
          (item) => item.type === "selectionText",
        );
      } else if (definition && definition.classList.contains("show")) {
        activeIndex = currentVisibleItems.findIndex(
          (item) => item.type === "definition",
        );
      } else if (glossary && glossary.classList.contains("show")) {
        const currentGlossaryLi = visibleGlossaryItems.find(
          (li) => li.style.display === "block",
        );
        if (currentGlossaryLi) {
          activeIndex = currentVisibleItems.findIndex(
            (item) =>
              item.type === "glossary" && item.element === currentGlossaryLi,
          );
        } else if (
          currentVisibleItems.some((item) => item.type === "glossary")
        ) {
          activeIndex = currentVisibleItems.findIndex(
            (item) => item.type === "glossary",
          );
        }
      }
      return activeIndex;
    }

    function getDictionaryMap() {
      const map = new Map();
      allGlossaryListItems.forEach((li) => {
        const dictionaryName = getDictionaryName(li);
        if (dictionaryName) {
          map.set(dictionaryName, li);
        }
      });
      return map;
    }

    let initialIndex = -1;

    allGlossaryListItems.forEach((li) => (li.style.display = "none"));
    if (selectionText) selectionText.classList.remove("show");
    if (definition) definition.classList.remove("show");
    if (glossary) glossary.classList.remove("show");

    if (totalVisibleItemsCount > 0) {
      const permanentLastSelected = localStorage.getItem(
        "lastSelectedDictionary",
      );
      const permanentDictionaryName =
        localStorage.getItem("lastDictionaryName");
      const dictionaryMap = getDictionaryMap();
      let initialStateSet = false;

      if (!initialStateSet) {
        // Priority 1: Selection Text
        if (hasSelectionText) {
          initialIndex = currentVisibleItems.findIndex(
            (item) => item.type === "selectionText",
          );
          if (initialIndex !== -1) {
            initialStateSet = true;
          }
        }

        // Priority 2: This card's preference overrides the previous card's choice.
        if (!initialStateSet && dictionaryPreference) {
          const preference = dictionaryPreference.toLowerCase();
          const matches = (item) => (getDictionaryName(item.element) || "").toLowerCase();
          initialIndex = preference === "glossary"
            ? currentVisibleItems.findIndex((item) => item.type === "glossary")
            : currentVisibleItems.findIndex((item) => matches(item) === preference);
          if (initialIndex === -1 && preference !== "glossary") {
            initialIndex = currentVisibleItems.findIndex((item) => matches(item).includes(preference));
          }
          if (initialIndex !== -1) {
            const preferredItem = currentVisibleItems[initialIndex];
            if (preferredItem.type === "glossary") preferredItem.element.style.display = "block";
            initialStateSet = true;
          }
        }

        // Priority 3: Local Storage
        if (
          !initialStateSet &&
          permanentLastSelected === "glossary" &&
          visibleGlossaryItems.length > 0
        ) {
          let foundDictionaryFromStorage = false;
          if (
            permanentDictionaryName &&
            dictionaryMap.has(permanentDictionaryName)
          ) {
            const specificLiElement = dictionaryMap.get(
              permanentDictionaryName,
            );
            if (visibleGlossaryItems.includes(specificLiElement)) {
              initialIndex = currentVisibleItems.findIndex(
                (item) =>
                  item.type === "glossary" &&
                  item.element === specificLiElement,
              );
              if (initialIndex !== -1) {
                specificLiElement.style.display = "block";
                foundDictionaryFromStorage = true;
                initialStateSet = true;
              }
            }
          }

          // fallback
          if (!foundDictionaryFromStorage) {
            initialIndex = currentVisibleItems.findIndex(
              (item) => item.type === "glossary",
            );
            if (initialIndex !== -1) {
              currentVisibleItems[initialIndex].element.style.display = "block";
              initialStateSet = true;
            }
          }
        }

        // Priority 4: Definition
        if (!initialStateSet && useDefinition) {
          initialIndex = currentVisibleItems.findIndex(
            (item) => item.type === "definition",
          );
          if (initialIndex !== -1) {
            initialStateSet = true;
          }
        }

        // Priority 5: Glossary
        if (!initialStateSet && visibleGlossaryItems.length > 0) {
          initialIndex = currentVisibleItems.findIndex(
            (item) => item.type === "glossary",
          );
          if (initialIndex !== -1) {
            currentVisibleItems[initialIndex].element.style.display = "block";
            initialStateSet = true;
          }
        }

        if (!initialStateSet) {
          if (currentVisibleItems.length > 0) initialIndex = 0;
        }
      }

      if (initialIndex !== -1) {
        const initialItem = currentVisibleItems[initialIndex];
        if (initialItem.container) {
          activateDictionary(initialItem);
          initialItem.container.classList.add("show");
          // For collapsed dictionary entries 1
          collapseDictionary(
            initialItem.container.querySelector(
              ".definition-box, .glossary-box",
            ),
          );
          // For dictionary colorizer 1
          updateBackgroundColor(initialItem.element);
        }
      }
    }

    updateCounters(initialIndex);

    const handleToggle = (direction) => {
      const currentIndex = getCurrentIndex();
      if (currentIndex === -1 || totalVisibleItemsCount <= 1) return;

      const currentItem = currentVisibleItems[currentIndex];
      if (
        currentItem.type === "selectionText" ||
        currentItem.type === "definition"
      ) {
        if (currentItem.container)
          currentItem.container.classList.remove("show");
      } else if (currentItem.type === "glossary") {
        currentItem.element.style.display = "none";
      }

      let nextIndex;
      if (direction === "right") {
        nextIndex = (currentIndex + 1) % totalVisibleItemsCount;
      } else {
        nextIndex =
          (currentIndex - 1 + totalVisibleItemsCount) % totalVisibleItemsCount;
      }

      const nextItem = currentVisibleItems[nextIndex];
      activateDictionary(nextItem);

      if (currentItem.type === "glossary" && nextItem.type !== "glossary") {
        if (currentItem.container)
          currentItem.container.classList.remove("show");
      }

      if (nextItem.type === "selectionText" || nextItem.type === "definition") {
        if (nextItem.container) nextItem.container.classList.add("show");
      } else if (nextItem.type === "glossary") {
        if (nextItem.container) nextItem.container.classList.add("show");
        nextItem.element.style.display = "block";
      }

      // For collapsed dictionary entries 2
      collapseDictionary(
        nextItem.container.querySelector(".definition-box, .glossary-box"),
      );
      // For collapsed dictionary colorizer 2
      updateBackgroundColor(nextItem.element);

      if (nextItem.type === "selectionText") {
        localStorage.setItem("lastSelectedDictionary", "selectionText");
        localStorage.removeItem("lastDictionaryName");
      } else if (nextItem.type === "definition") {
        localStorage.setItem("lastSelectedDictionary", "definition");
        localStorage.removeItem("lastDictionaryName");
      } else if (nextItem.type === "glossary") {
        localStorage.setItem("lastSelectedDictionary", "glossary");
        const dictionaryName = getDictionaryName(nextItem.element);
        if (dictionaryName) {
          localStorage.setItem("lastDictionaryName", dictionaryName);
        } else {
          localStorage.removeItem("lastDictionaryName");
        }
      }

      updateCounters(nextIndex);

      const backElement = document.querySelector(".back");
      if (backElement && !backElement.classList.contains("dict-toggled-once")) {
        backElement.classList.add("dict-toggled-once");
      }
    };

    toggleAreas.forEach((area) => {
      area.onclick = (e) => {
        if (totalVisibleItemsCount <= 1) return;
        if (
          area.classList.contains("right") ||
          area.classList.contains("right-larger")
        ) {
          handleToggle("right");
        } else if (
          area.classList.contains("left") ||
          area.classList.contains("left-larger")
        ) {
          handleToggle("left");
        }
      };
    });

    if (window.senrenDefinitionKeyHandler) {
      document.removeEventListener(
        "keydown",
        window.senrenDefinitionKeyHandler,
      );
    }

    window.senrenDefinitionKeyHandler = (e) => {
      if (totalVisibleItemsCount <= 1) return;
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      if (
        typeof lightbox !== "undefined" &&
        lightbox.classList.contains("active")
      )
        return;
      if (document.querySelector(".notes-legend-overlay.active")) return;
      if (
        document.activeElement &&
        (document.activeElement.tagName === "INPUT" ||
          document.activeElement.tagName === "TEXTAREA")
      ) {
        return;
      }
      if (e.key === "j") {
        e.preventDefault();
        handleToggle("left");
      }
      if (e.key === "k") {
        e.preventDefault();
        handleToggle("right");
      }
    };

    document.addEventListener("keydown", window.senrenDefinitionKeyHandler, {signal:window.senrenCardController?.signal});
  }

  // Enables interaction effects
  function enableInteractions() {
    function applyClickToggleEffect(
      triggerSelector,
      targetSelector,
      extraPadding = 0,
    ) {
      const trigger = document.querySelector(triggerSelector);
      const target = document.querySelector(targetSelector);

      if (trigger && target) {
        const clickable = "is-clickable";

        if (target.innerHTML.trim() !== "") {
          trigger.classList.add(clickable);
        } else {
          trigger.classList.remove(clickable);
        }
        if (trigger.dataset.hasToggleListener) return;
        trigger.dataset.hasToggleListener = "true";

        trigger.addEventListener("click", () => {
          if (!trigger.classList.contains(clickable)) {
            return;
          }

          requestAnimationFrame(() => {
            const isCollapsed = target.classList.contains("is-collapsed");

            if (isCollapsed) {
              target.classList.remove("is-collapsed");
              target.style.maxHeight =
                target.scrollHeight + extraPadding + "px";
              if (extraPadding) {
                target.style.opacity = "1";
                target.style.paddingTop = extraPadding + "px";
              }
            } else {
              target.classList.add("is-collapsed");
              target.style.maxHeight = "0";
              if (extraPadding) {
                target.style.opacity = "0";
                target.style.paddingTop = "0px";
              }
            }
          });
        });
      }
    }

    function applyHoverEffect(
      containerSelector,
      targetSelector,
      extraPadding = 0,
    ) {
      const containers = document.querySelectorAll(containerSelector);
      const target = document.querySelector(targetSelector);
      const marginTopValue = "5px";
      const isTouch = window.matchMedia("(pointer: coarse)").matches;

      if (containers.length > 0 && target) {
        containers.forEach((container) => {
          if (container.dataset.hasHoverListener) return;
          container.dataset.hasHoverListener = "true";

          if (isTouch) {
            container.classList.add("tappable");
          }

          const expand = () => {
            requestAnimationFrame(() => {
              if (target.textContent.trim() !== "") {
                target.style.maxHeight =
                  target.scrollHeight + extraPadding * 2 + "px";
                if (extraPadding) {
                  target.style.opacity = "1";
                  target.style.paddingTop = extraPadding + "px";
                  target.style.paddingBottom = extraPadding + "px";
                  target.style.marginTop = marginTopValue;
                }
              }
            });
          };

          const collapse = () => {
            requestAnimationFrame(() => {
              target.style.maxHeight = "0";
              if (extraPadding) {
                target.style.opacity = "0";
                target.style.paddingTop = "0px";
                target.style.paddingBottom = "0px";
                target.style.marginTop = "0px";
              }
            });
          };

          // Mouse Hover
          container.addEventListener("pointerenter", (e) => {
            if (e.pointerType === "mouse") expand();
          });

          container.addEventListener("pointerleave", (e) => {
            if (e.pointerType === "mouse") collapse();
          });

          // Touch Interaction
          container.addEventListener("click", (e) => {
            if (e.pointerType === "touch" || isTouch) {
              if (
                e.target.closest("a, button, .tappable") &&
                e.target.closest("a, button, .tappable") !== container
              ) {
                return;
              }

              const isCollapsed =
                !target.style.maxHeight || target.style.maxHeight === "0px";
              if (isCollapsed) {
                expand();
              } else {
                collapse();
              }
            }
          });
        });
      }
    }

    const sentenceEng = document.querySelector("#sentenceEng");

    // ============================================
    // GRAMMAR HOVER (for Related/Synonym/Antonym)
    // ============================================
    function initGrammarHover(notesBox) {
      var grammarTooltip = document.getElementById("grammar-tooltip");
      if (!grammarTooltip) return;

      var ankiConnectUrl = "http://localhost:8765";
      var grammarCache = {};
      var hideGrammarTimeout = null;

      async function ankiRequest(action, params) {
        try {
          var response = await fetch(ankiConnectUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: action,
              version: 6,
              params: params || {},
            }),
          });
          if (!response.ok) return null;
          var data = await response.json();
          if (data.error) return null;
          return data.result;
        } catch (e) {
          return null;
        }
      }

      // Ensure senrenAnkiRequest is available for click-to-browse
      if (!window.senrenAnkiRequest) {
        window.senrenAnkiRequest = ankiRequest;
      }

      function positionGrammarTooltip(tooltip, targetEl) {
        var back = document.querySelector(".back");
        if (!back) return;
        var targetRect = targetEl.getBoundingClientRect();
        var backRect = back.getBoundingClientRect();
        var arrowSize = 7;

        var relTop = targetRect.bottom - backRect.top;
        var relLeft = targetRect.left - backRect.left;

        tooltip.style.left = relLeft + "px";
        tooltip.style.top = relTop + "px";
        tooltip.classList.remove("tooltip-above");
        tooltip.style.setProperty(
          "--tooltip-arrow-left",
          targetRect.width / 2 + "px",
        );

        // Adjust if overflows right
        var tRect = tooltip.getBoundingClientRect();
        if (tRect.right > window.innerWidth) {
          tooltip.style.left =
            relLeft + (window.innerWidth - tRect.right - 10) + "px";
        }
        // Adjust if overflows left
        var finalLeft = parseFloat(tooltip.style.left || "0");
        if (finalLeft + backRect.left < 0) {
          tooltip.style.left = -backRect.left + 10 + "px";
        }
        // Flip above if overflows bottom
        if (tRect.bottom > window.innerHeight - 10) {
          var aboveTop =
            targetRect.top - backRect.top - tRect.height - arrowSize;
          if (aboveTop + backRect.top > 0) {
            tooltip.style.top = aboveTop + "px";
            tooltip.classList.add("tooltip-above");
          }
        }
        // Recalculate arrow position
        var fLeft = parseFloat(tooltip.style.left || "0");
        var arrowLeft =
          targetRect.left - backRect.left + targetRect.width / 2 - fLeft;
        var tWidth = tooltip.offsetWidth;
        arrowLeft = Math.max(
          arrowSize,
          Math.min(arrowLeft, tWidth - arrowSize),
        );
        tooltip.style.setProperty("--tooltip-arrow-left", arrowLeft + "px");
      }

      function hideGrammarInfo(force) {
        clearTimeout(hideGrammarTimeout);
        hideGrammarTimeout = setTimeout(
          function () {
            var overTerm = document.querySelector(".grammar-term:hover");
            var overTooltip = grammarTooltip.matches(":hover");
            if (!overTerm && !overTooltip) {
              grammarTooltip.classList.remove("active");
              grammarTooltip.style.display = "none";
            }
          },
          force ? 0 : 150,
        );
      }

      async function showGrammarInfo(termEl) {
        clearTimeout(hideGrammarTimeout);
        var term = termEl.dataset.term;
        if (!term) return;

        grammarTooltip.innerHTML =
          '<div class="grammar-tooltip-loading">Searching\u2026</div>';
        grammarTooltip.classList.add("active");
        grammarTooltip.style.display = "block";
        positionGrammarTooltip(grammarTooltip, termEl);

        if (grammarCache[term]) {
          renderGrammarResults(term, termEl);
          return;
        }

        // Search for cards with this grammar in the word field
        var query = 'note:Senren+ "word:' + term + '"';
        var noteIds = await ankiRequest("findNotes", { query: query });

        if (!noteIds || noteIds.length === 0) {
          grammarCache[term] = [];
          renderGrammarResults(term, termEl);
          return;
        }

        var notesInfo = await ankiRequest("notesInfo", { notes: noteIds });
        if (!notesInfo) {
          grammarCache[term] = [];
          renderGrammarResults(term, termEl);
          return;
        }

        // Get card types for new/review status
        var allCardIds = [];
        notesInfo.forEach(function (n) {
          if (n.cards && n.cards.length)
            allCardIds.push.apply(allCardIds, n.cards);
        });
        var cardTypeMap = {};
        if (allCardIds.length > 0) {
          var cardsInfo = await ankiRequest("cardsInfo", { cards: allCardIds });
          if (cardsInfo) {
            cardsInfo.forEach(function (c) {
              cardTypeMap[c.cardId] = c.type;
            });
          }
        }

        var results = [];
        var uniqueWords = new Set();

        notesInfo.forEach(function (note) {
          var fields = note.fields;
          if (!fields || !fields.word || !fields.word.value) return;

          var tempDiv = document.createElement("div");
          tempDiv.innerHTML = fields.word.value;
          var wordValue = (
            tempDiv.textContent ||
            tempDiv.innerText ||
            ""
          ).trim();

          if (uniqueWords.has(wordValue)) return;
          uniqueWords.add(wordValue);

          var readingVal = fields.reading ? fields.reading.value : "";
          var readingHtml = getFirstReadingHtml(readingVal);

          var sentenceVal = fields.sentence ? fields.sentence.value : "";
          var pitchVal = fields.pitch ? fields.pitch.value : "";
          var pitchPosVal = fields.pitchPosition
            ? fields.pitchPosition.value
            : "";
          var tagsVal = fields.Tags ? fields.Tags.value : "";
          var isNew = !note.cards.some(function (cid) {
            return cardTypeMap[cid] > 0;
          });

          results.push({
            word: wordValue,
            reading: readingHtml,
            sentence: sentenceVal,
            pitch: pitchVal,
            pitchPosition: pitchPosVal,
            tags: tagsVal,
            isNew: isNew,
            noteId: note.noteId,
          });
        });

        grammarCache[term] = results;
        renderGrammarResults(term, termEl);
      }

      function renderGrammarResults(term, termEl) {
        var results = grammarCache[term] || [];

        if (results.length === 0) {
          grammarTooltip.innerHTML =
            '<div class="grammar-tooltip-empty">No cards found for \u300C' +
            term +
            "\u300D</div>";
          positionGrammarTooltip(grammarTooltip, termEl);
          return;
        }

        var html = '<ul class="grammar-tooltip-list">';
        var maxItems = 5;

        results.forEach(function (item, idx) {
          var newClass = item.isNew ? "is-new-card" : "";
          var displayStyle = idx >= maxItems ? ' style="display: none;"' : "";

          // Pitch info
          var firstPitchCategory = "";
          var formattedPosition = "";
          if (item.pitchPosition) {
            var numbers = [];
            var numMatch;
            var numRegex = /\d+/g;
            while ((numMatch = numRegex.exec(item.pitchPosition)) !== null) {
              var n = parseInt(numMatch[0], 10);
              if (numbers.indexOf(n) === -1) numbers.push(n);
            }
            if (numbers.length > 0 && window.senrenGetPitchType) {
              var tempRt = null;
              if (item.reading) {
                tempRt = document.createElement("rt");
                tempRt.innerHTML = item.reading;
              }
              formattedPosition = numbers
                .map(function (num) {
                  var pt = window.senrenGetPitchType(num, tempRt);
                  pt = pt.split(",")[0].trim();
                  return (
                    '<span class="pitch-number ' + pt + '">' + num + "</span>"
                  );
                })
                .join("\u30FB");
              var types = numbers.map(function (num) {
                return window
                  .senrenGetPitchType(num, tempRt)
                  .split(",")[0]
                  .trim();
              });
              firstPitchCategory = types[0] || "";
            }
          }
          if (!firstPitchCategory) {
            firstPitchCategory = item.pitch
              ? item.pitch.split(",")[0].trim()
              : "";
          }

          var sentenceHtml = "";
          if (item.sentence) {
            var s = item.sentence.trim();
            sentenceHtml = '<div class="related-sentence">' + s + "</div>";
          }

          var clickAction =
            "onclick=\"window.senrenAnkiRequest('guiBrowse', { query: 'nid:" +
            item.noteId +
            "' })\"";

          html +=
            '<li class="' +
            newClass +
            " " +
            (firstPitchCategory || "") +
            '"' +
            displayStyle +
            ">" +
            '<div class="related-word-container pitch card-a">' +
            '<span class="pitch-info ' +
            (firstPitchCategory || "") +
            " " +
            (item.tags || "") +
            '">' +
            "<ruby>" +
            '<span class="related-word clickable-word" ' +
            clickAction +
            ">" +
            item.word +
            "</span>" +
            (item.reading ? "<rt>" + item.reading + "</rt>" : "") +
            "</ruby>" +
            (formattedPosition
              ? '<div class="position">' + formattedPosition + "</div>"
              : "") +
            "</span>" +
            "</div>" +
            sentenceHtml +
            "</li>";
        });

        html += "</ul>";

        if (results.length > maxItems) {
          html +=
            '<button class="show-more-btn">Show More (' +
            (results.length - maxItems) +
            ")</button>";
        }

        grammarTooltip.innerHTML = html;

        // Draw pitch lines if available
        if (typeof drawTooltipPitchLines === "function") {
          drawTooltipPitchLines(grammarTooltip);
        } else if (window.senrenDrawPitchLines) {
          window.senrenDrawPitchLines(grammarTooltip);
        }

        grammarTooltip.classList.add("active");
        grammarTooltip.style.display = "block";
        positionGrammarTooltip(grammarTooltip, termEl);

        var showMoreBtn = grammarTooltip.querySelector(".show-more-btn");
        if (showMoreBtn) {
          showMoreBtn.addEventListener("click", function () {
            var hidden = grammarTooltip.querySelectorAll(
              'li[style="display: none;"]',
            );
            hidden.forEach(function (el) {
              el.style.display = "";
            });
            showMoreBtn.remove();
            positionGrammarTooltip(grammarTooltip, termEl);
          });
        }

        grammarTooltip.onmouseover = function () {
          clearTimeout(hideGrammarTimeout);
        };
        grammarTooltip.onmouseout = function () {
          hideGrammarInfo();
        };
      }

      // Find Related/Synonym/Antonym section bodies and wrap terms
      var hoverableSections = notesBox.querySelectorAll(
        '.notes-section[data-section="related"] .notes-section-body, ' +
          '.notes-section[data-section="synonym"] .notes-section-body, ' +
          '.notes-section[data-section="antonym"] .notes-section-body',
      );

      hoverableSections.forEach(function (body) {
        var rawContent = body.innerHTML;
        // Split by common delimiters: full-width space, comma, ・, 、, <br>
        // but preserve the delimiters
        var parts = rawContent.split(
          /(\u3000|[,\uFF0C]\s*|\u30FB|\u3001|<br\s*\/?>)/gi,
        );
        var newHtml = "";

        parts.forEach(function (part) {
          var trimmed = part.trim();
          // Check if it's a delimiter or whitespace
          if (
            !trimmed ||
            /^(\u3000|[,\uFF0C]\s*|\u30FB|\u3001|<br\s*\/?>)$/i.test(
              part.trim(),
            )
          ) {
            newHtml += part;
          } else {
            // Strip any existing HTML tags from the term for the data attribute
            var tempDiv = document.createElement("div");
            tempDiv.innerHTML = trimmed;
            var cleanTerm = (
              tempDiv.textContent ||
              tempDiv.innerText ||
              ""
            ).trim();
            if (cleanTerm) {
              newHtml +=
                '<span class="grammar-term" data-term="' +
                cleanTerm.replace(/"/g, "&quot;") +
                '">' +
                trimmed +
                "</span>";
            } else {
              newHtml += part;
            }
          }
        });

        body.innerHTML = newHtml;

        // Attach hover events
        var terms = body.querySelectorAll(".grammar-term");
        terms.forEach(function (termEl) {
          termEl.addEventListener("mouseover", function () {
            showGrammarInfo(termEl);
          });
          termEl.addEventListener("mouseout", function () {
            hideGrammarInfo();
          });
        });
      });
    }

    // ============================================
    // NOTES SECTIONS (navigable like glossary)
    // ============================================
    (function initNotesSections() {
      try {
        const notesPanel = document.getElementById("notes");
        if (!notesPanel) return;

        const notesBox = notesPanel.querySelector(".notes-box");
        const rawSpan = notesPanel.querySelector(".notes-raw");
        if (!rawSpan) return;

        const raw = rawSpan.innerHTML;

        // Normalize block-level HTML (div, p) to <br> for consistent parsing
        var normalized = raw
          .replace(/<\/?(div|p|section|article)(?:\s[^>]*)?>\s*/gi, "<br>")
          .replace(/(<br\s*\/?>\s*){2,}/gi, "<br><br>")
          .replace(/^\s*(?:<br\s*\/?>\s*)*/i, "")
          .replace(/(?:\s*<br\s*\/?>)*\s*$/i, "");

        const sectionKeywords = [
          "About",
          "Caution",
          "Fun Fact",
          "Synonym",
          "Antonym",
          "Related",
          "Misc",
          "Structure",
          "Details",
        ];
        const testPattern = new RegExp(
          "(?:^|<br\\s*/?>|\\n)\\s*(" + sectionKeywords.join("|") + ")\\b\\.?",
          "i",
        );
        const iconMap = {
          about: "fa-circle-info",
          caution: "fa-triangle-exclamation",
          "fun fact": "fa-lightbulb",
          synonym: "fa-equals",
          antonym: "fa-right-left",
          related: "fa-link",
          misc: "fa-puzzle-piece",
          structure: "fa-cubes",
          details: "fa-tags",
        };
        const colorMap = {
          about: "var(--notes-section-about)",
          caution: "var(--notes-section-caution)",
          "fun fact": "var(--notes-section-fun-fact)",
          synonym: "var(--notes-section-synonym)",
          antonym: "var(--notes-section-antonym)",
          related: "var(--notes-section-related)",
          misc: "var(--notes-section-misc)",
          structure: "var(--notes-section-structure)",
          details: "var(--notes-section-details)",
        };

        // Sections that use card grid layout (pipe-delimited)
        const cardGridSections = ["synonym", "antonym", "related", "misc"];

        // Parse sections
        var parsedSections = [];

        if (testPattern.test(normalized)) {
          var sectionPattern = new RegExp(
            "(?:^|<br\\s*/?>|\\n)\\s*(" +
              sectionKeywords.join("|") +
              ")\\b\\.?([^]*?)(?=(?:<br\\s*/?>|\\n)\\s*(?:" +
              sectionKeywords.join("|") +
              ")\\b\\.?|$)",
            "gi",
          );
          var firstMatch = normalized.search(testPattern);
          var preamble =
            firstMatch > 0 ? normalized.substring(0, firstMatch).trim() : "";
          sectionPattern.lastIndex = 0;
          var m;
          while ((m = sectionPattern.exec(normalized)) !== null) {
            var content = (m[2] || "")
              .replace(/^[\s]*(<br\s*\/?>[\s]*)*/gi, "")
              .trim();
            content = content.replace(/(<br\s*\/?>[\s]*)*$/gi, "").trim();
            parsedSections.push({
              keyword: m[1],
              content: content,
              preamble: "",
            });
          }
          if (preamble && parsedSections.length > 0) {
            parsedSections[0].preamble = preamble;
          }
        }

        // No sections found => show normalized as single item
        if (parsedSections.length === 0) {
          parsedSections.push({
            keyword: "",
            content: normalized,
            preamble: "",
          });
        }

        // Build section elements
        var sectionEls = [];
        notesBox.innerHTML = "";

        parsedSections.forEach(function (sec, i) {
          var div = document.createElement("div");
          div.className = "notes-section-item";
          div.style.display = i === 0 ? "block" : "none";

          var html = "";
          if (sec.preamble) {
            html += '<div class="notes-preamble">' + sec.preamble + "</div>";
          }
          if (sec.keyword) {
            var key = sec.keyword.toLowerCase();
            var icon = iconMap[key] || "fa-circle-info";
            var color = colorMap[key] || colorMap.about;

            // Card grid layout for Synonym/Antonym/Related/Misc sections (pipe-delimited entries)
            if (
              cardGridSections.indexOf(key) !== -1 &&
              sec.content.indexOf("|") !== -1
            ) {
              var lines = sec.content
                .split(/<br\s*\/?>/gi)
                .filter(function (l) {
                  return l.trim();
                });

              html +=
                '<div class="notes-section notes-card-section" data-section="' +
                key +
                '" style="--section-color: ' +
                color +
                '">';
              html += '<div class="notes-card-toolbar">';
              html += '<div class="notes-section-header">';
              html += '<i class="fas ' + icon + ' notes-section-icon"></i>';
              html +=
                '<span class="notes-section-title">' + sec.keyword + "</span>";
              html += "</div>";
              html +=
                '<button class="notes-card-toggle-all tappable" data-state="expanded">Collapse All</button>';
              html += "</div>";

              html += '<div class="notes-card-grid">';
              lines.forEach(function (line) {
                var parts = line.split("|").map(function (p) {
                  return p.trim();
                });
                var rawWord = parts[0] || "";
                var meaning = parts[1] || "";
                var level = parts[2] || "";
                var desc = parts[3] || "";

                // Strip disambiguation parentheses for display: のに (Despite) → のに
                // Keep full value for Anki browse search
                var displayWord = rawWord.replace(/\s*\(.*?\)\s*$/, "").trim();

                html += '<div class="notes-card tappable">';
                html += '<div class="notes-card-top">';
                html += '<div class="notes-card-info">';
                html +=
                  '<div class="notes-card-word">' + displayWord + "</div>";
                if (meaning)
                  html +=
                    '<div class="notes-card-meaning">' + meaning + "</div>";
                if (level) {
                  html +=
                    '<div class="notes-card-badge"><i class="fas fa-times badge-icon"></i> ' +
                    level +
                    "</div>";
                }
                html += "</div>";
                html +=
                  '<span class="notes-card-link tappable" data-word="' +
                  rawWord.replace(/"/g, "&quot;") +
                  '" title="Browse in Anki"><i class="fas fa-external-link-alt"></i></span>';
                html += "</div>";
                if (desc) {
                  html += '<div class="notes-card-desc">' + desc + "</div>";
                }
                html += "</div>";
              });
              html += "</div>";
              html += "</div>";
            } else if (key === "structure") {
              // Structure section: Standard/Polite toggle
              // Convert HTML-escaped <br> to actual line breaks
              var structureContent = sec.content
                .replace(/&lt;br\s*\/?&gt;/gi, "<br>")
                .replace(/&lt;BR\s*\/?&gt;/gi, "<br>");
              var structureParts = structureContent
                .split("||")
                .map(function (p) {
                  return p.trim();
                });
              var standardContent = structureParts[0] || "";
              var politeContent =
                structureParts.length > 1 ? structureParts[1] : "";
              var hasPolite = politeContent.length > 0;

              html +=
                '<div class="notes-section notes-structure-section" data-section="structure" style="--section-color: ' +
                color +
                '">';
              html += '<div class="notes-structure-header">';
              html += '<div class="notes-section-header">';
              html += '<i class="fas ' + icon + ' notes-section-icon"></i>';
              html +=
                '<span class="notes-section-title">' + sec.keyword + "</span>";
              html += "</div>";
              if (hasPolite) {
                html += '<div class="notes-structure-toggle">';
                html +=
                  '<button class="notes-structure-btn tappable active" data-mode="standard">Standard</button>';
                html +=
                  '<button class="notes-structure-btn tappable" data-mode="polite">Polite</button>';
                html += "</div>";
              }
              html += "</div>";
              html += '<div class="notes-structure-content">';
              html +=
                '<div class="notes-structure-panel active" data-panel="standard">' +
                standardContent +
                "</div>";
              if (hasPolite) {
                html +=
                  '<div class="notes-structure-panel" data-panel="polite">' +
                  politeContent +
                  "</div>";
              }
              html += "</div>";
              html += "</div>";
            } else if (key === "details") {
              // Details section: Part of Speech / Word Type / Register / Rare Kanji
              var detailParts = sec.content.split("|").map(function (p) {
                return p.trim();
              });
              var partOfSpeech = detailParts[0] || "";
              var wordType = detailParts[1] || "";
              var register = detailParts[2] || "";
              var rareKanji = detailParts[3] || "";

              html +=
                '<div class="notes-section notes-details-section" data-section="details" style="--section-color: ' +
                color +
                '">';
              html += '<div class="notes-section-header">';
              html += '<i class="fas ' + icon + ' notes-section-icon"></i>';
              html +=
                '<span class="notes-section-title">' + sec.keyword + "</span>";
              html += "</div>";
              html += '<div class="notes-details-grid">';
              if (partOfSpeech) {
                html += '<div class="notes-details-item">';
                html +=
                  '<div class="notes-details-label">Part of Speech <button class="notes-details-info tappable" data-legend="pos" title="View legend"><i class="fas fa-info-circle"></i></button></div>';
                html +=
                  '<div class="notes-details-value">' + partOfSpeech + "</div>";
                html += "</div>";
              }
              if (wordType) {
                html += '<div class="notes-details-item">';
                html +=
                  '<div class="notes-details-label">Word Type <button class="notes-details-info tappable" data-legend="wordtype" title="View legend"><i class="fas fa-info-circle"></i></button></div>';
                html +=
                  '<div class="notes-details-value">' + wordType + "</div>";
                html += "</div>";
              }
              if (register) {
                html += '<div class="notes-details-item">';
                html +=
                  '<div class="notes-details-label">Register <button class="notes-details-info tappable" data-legend="register" title="View legend"><i class="fas fa-info-circle"></i></button></div>';
                html +=
                  '<div class="notes-details-value">' + register + "</div>";
                html += "</div>";
              }
              if (rareKanji) {
                html += '<div class="notes-details-item">';
                html +=
                  '<div class="notes-details-label">Rare Kanji <button class="notes-details-info tappable" data-legend="rarekanji" title="View legend"><i class="fas fa-info-circle"></i></button></div>';
                html +=
                  '<div class="notes-details-value notes-details-rare-kanji">';
                var kanjiParts = rareKanji
                  .split("\u30FB")
                  .map(function (k) {
                    return k.trim();
                  })
                  .filter(Boolean);
                kanjiParts.forEach(function (k) {
                  html += '<span class="rare-kanji-chip">' + k + "</span>";
                });
                html += "</div>";
                html += "</div>";
              }
              html += "</div>";
              html += "</div>";
            } else {
              // Default section rendering
              html +=
                '<div class="notes-section" data-section="' +
                key +
                '" style="--section-color: ' +
                color +
                '">';
              html += '<div class="notes-section-header">';
              html += '<i class="fas ' + icon + ' notes-section-icon"></i>';
              html +=
                '<span class="notes-section-title">' + sec.keyword + "</span>";
              html += "</div>";
              html +=
                '<div class="notes-section-body">' + sec.content + "</div>";
              html += "</div>";
            }
          } else {
            html += '<div class="notes-section-body">' + sec.content + "</div>";
          }

          div.innerHTML = html;
          notesBox.appendChild(div);
          sectionEls.push(div);
        });

        // Grammar hover for Related/Synonym/Antonym sections
        initGrammarHover(notesBox);

        // Card grid: Collapse/Expand All buttons
        notesBox
          .querySelectorAll(".notes-card-toggle-all")
          .forEach(function (btn) {
            btn.addEventListener("click", function (e) {
              e.stopPropagation();
              var section = btn.closest(".notes-card-section");
              if (!section) return;
              var descs = section.querySelectorAll(".notes-card-desc");
              var isExpanded = btn.getAttribute("data-state") === "expanded";

              descs.forEach(function (desc) {
                if (isExpanded) {
                  desc.classList.add("is-collapsed");
                } else {
                  desc.classList.remove("is-collapsed");
                }
              });

              btn.setAttribute(
                "data-state",
                isExpanded ? "collapsed" : "expanded",
              );
              btn.textContent = isExpanded ? "Expand All" : "Collapse All";

              if (!notesPanel.classList.contains("is-collapsed")) {
                notesPanel.style.maxHeight = notesPanel.scrollHeight + "px";
              }
            });
          });

        // Card grid: Individual card click to toggle description
        notesBox.querySelectorAll(".notes-card").forEach(function (card) {
          card.addEventListener("click", function (e) {
            if (e.target.closest(".notes-card-link")) return;
            var desc = card.querySelector(".notes-card-desc");
            if (!desc) return;
            desc.classList.toggle("is-collapsed");

            if (!notesPanel.classList.contains("is-collapsed")) {
              setTimeout(function () {
                notesPanel.style.maxHeight = notesPanel.scrollHeight + "px";
              }, 10);
            }
          });
        });

        // Card grid: Anki browse links
        notesBox.querySelectorAll(".notes-card-link").forEach(function (link) {
          link.addEventListener("click", function (e) {
            e.stopPropagation();
            var word = link.getAttribute("data-word");
            if (!word || !window.senrenAnkiRequest) return;

            var query = '"word:' + word + '"';

            window
              .senrenAnkiRequest("findNotes", { query: query })
              .then(function (noteIds) {
                if (noteIds && noteIds.length > 0) {
                  window.senrenAnkiRequest("guiBrowse", {
                    query: query,
                  });
                } else {
                  var origHTML = link.innerHTML;
                  link.innerHTML =
                    '<span style="font-size: 0.65rem; color: #bf616a;">Not Found</span>';
                  setTimeout(function () {
                    link.innerHTML = origHTML;
                  }, 2000);
                }
              });
          });
        });

        // Structure section: Standard/Polite toggle
        notesBox
          .querySelectorAll(".notes-structure-btn")
          .forEach(function (btn) {
            btn.addEventListener("click", function (e) {
              e.stopPropagation();
              var section = btn.closest(".notes-structure-section");
              if (!section) return;
              var mode = btn.getAttribute("data-mode");

              section
                .querySelectorAll(".notes-structure-btn")
                .forEach(function (b) {
                  b.classList.remove("active");
                });
              btn.classList.add("active");

              section
                .querySelectorAll(".notes-structure-panel")
                .forEach(function (p) {
                  p.classList.remove("active");
                });
              var target = section.querySelector(
                '.notes-structure-panel[data-panel="' + mode + '"]',
              );
              if (target) target.classList.add("active");

              if (!notesPanel.classList.contains("is-collapsed")) {
                notesPanel.style.maxHeight = notesPanel.scrollHeight + "px";
              }
            });
          });

        // Details section: Legend popup data
        var legendData = {
          pos: {
            title: "Parts of Speech",
            entries: [
              {
                term: "Expression",
                jp: "表現",
                reading: "ひょうげん",
                desc: "A set combination of words that together convey a specific meaning or grammatical function.",
              },
              {
                term: "Adjective",
                jp: "形容詞",
                reading: "けいようし",
                desc: "A word that describes or modifies a noun, expressing qualities, states, or characteristics.",
              },
              {
                term: "Adverb",
                jp: "副詞",
                reading: "ふくし",
                desc: "A word that modifies a verb, adjective, or another adverb, expressing manner, degree, or frequency.",
              },
              {
                term: "Auxiliary Verb",
                jp: "助動詞",
                reading: "じょどうし",
                desc: "Verbs that attach to other words to add grammatical meaning such as tense, negation, or politeness.",
              },
              {
                term: "Conjunctive Particle",
                jp: "接続助詞",
                reading: "せつぞくじょし",
                desc: "Suffixes or particles that connect clauses, indicating relationships like cause, condition, or contrast.",
              },
              {
                term: "Noun",
                jp: "名詞",
                reading: "めいし",
                desc: "A word that represents a person, place, thing, or concept.",
              },
              {
                term: "Particle",
                jp: "助詞",
                reading: "じょし",
                desc: "A suffix that indicates the grammatical relationship of a word within a sentence.",
              },
              {
                term: "Pronoun",
                jp: "代名詞",
                reading: "だいめいし",
                desc: "A word that takes the place of a noun, referring to people, things, or concepts.",
              },
              {
                term: "Verb",
                jp: "動詞",
                reading: "どうし",
                desc: "A word used to describe an action, state, or occurrence.",
              },
            ],
          },
          wordtype: {
            title: "Word Types",
            entries: [
              {
                term: "Abbreviation",
                desc: "A shortened form of a word or phrase.",
              },
              {
                term: "Adjectival Noun",
                desc: "A noun that functions as an adjective, typically using な to modify other nouns (な-adjective).",
              },
              {
                term: "Adjective",
                desc: "An い-adjective that directly modifies nouns and conjugates for tense and negation.",
              },
              {
                term: "Adverb",
                desc: "A word that modifies verbs, adjectives, or other adverbs.",
              },
              {
                term: "Adverb Phrase",
                desc: "A group of words functioning together as an adverb.",
              },
              {
                term: "Adverbial Particle",
                desc: "A particle that adds adverbial meaning to the word it follows.",
              },
              {
                term: "Auxiliary Verb",
                desc: "A verb that attaches to another verb to add grammatical meaning.",
              },
              {
                term: "Case Marking Particle",
                desc: "A particle that marks the grammatical role of a noun in a sentence (e.g. が, を, に).",
              },
              {
                term: "Conjunction",
                desc: "A word that connects words, phrases, or clauses together.",
              },
              {
                term: "Conjunctive Particle",
                desc: "A particle that connects clauses, indicating cause, condition, or contrast.",
              },
              {
                term: "Definite Article",
                desc: "A word that specifies a particular noun (not native to Japanese, used in comparative grammar).",
              },
              {
                term: "Demonstrative Pronoun",
                desc: "A pronoun that points to a specific thing (e.g. これ, それ, あれ).",
              },
              {
                term: "Dependent Word",
                desc: "A word that cannot stand alone and must be attached to another word.",
              },
              {
                term: "Dictionary Form",
                desc: "The base, unconjugated form of a verb as it appears in the dictionary.",
              },
              {
                term: "Indefinite Article",
                desc: "A word that refers to a non-specific noun (not native to Japanese, used in comparative grammar).",
              },
              {
                term: "Independent Word",
                desc: "A word that can stand alone and carry meaning by itself.",
              },
              {
                term: "Informal Speech",
                desc: "Casual language used in relaxed or familiar contexts.",
              },
              {
                term: "Linking Particle",
                desc: "A particle that connects elements within a sentence.",
              },
              {
                term: "Noun",
                desc: "A word representing a person, place, thing, or idea.",
              },
              {
                term: "Ordinary",
                desc: "Standard, everyday language without special formality.",
              },
              {
                term: "Personal Pronoun",
                desc: "A pronoun referring to a specific person (e.g. 私, あなた, 彼).",
              },
              {
                term: "Plural",
                desc: "A form indicating more than one of something.",
              },
              {
                term: "Possessive",
                desc: "A form indicating ownership or association.",
              },
              {
                term: "Possessive Pronoun",
                desc: "A pronoun indicating possession (e.g. 私の).",
              },
              {
                term: "Predicate",
                desc: "The part of a sentence that describes what the subject does or is.",
              },
              {
                term: "Present Simple Tense",
                desc: "The verb form expressing current or habitual actions.",
              },
              {
                term: "Pronoun",
                desc: "A word that substitutes for a noun.",
              },
              {
                term: "Question Sentence Order",
                desc: "The word order used when forming questions in Japanese.",
              },
              {
                term: "Sentence Ending Particle",
                desc: "A particle placed at the end of a sentence to add nuance (e.g. よ, ね, か).",
              },
              {
                term: "Verb",
                desc: "A word describing an action, state, or occurrence.",
              },
            ],
          },
          register: {
            title: "Register",
            entries: [
              {
                term: "Standard",
                jp: "標準語",
                reading: "ひょうじゅんご",
                desc: "The default level of formality used in everyday conversation and general writing.",
              },
              {
                term: "Formal",
                jp: "正式",
                reading: "せいしき",
                desc: "Used in official contexts, ceremonial situations, business documents, and formal speeches.",
              },
              {
                term: "Polite",
                jp: "丁寧語",
                reading: "ていねいご",
                desc: "Shows respect through polite forms (です/ます), appropriate for most social interactions.",
              },
              {
                term: "Casual",
                jp: "くだけた表現",
                reading: "",
                desc: "Informal speech used among close friends, family, or in relaxed social settings.",
              },
            ],
          },
          rarekanji: {
            title: "Rare Kanji",
            entries: [
              {
                term: "Rare Kanji",
                jp: "表外漢字",
                reading: "ひょうがいかんじ",
                desc: "Kanji not included in the Jōyō kanji list. These characters may appear in literature, names, or older texts but are uncommon in everyday modern usage.",
              },
              {
                term: "Hyōgai Kanji",
                jp: "表外漢字",
                reading: "ひょうがいかんじ",
                desc: "Characters outside the official Jōyō list, sometimes used in formal writing, classical texts, or specialized vocabulary.",
              },
              {
                term: "Variant Form",
                jp: "異体字",
                reading: "いたいじ",
                desc: "An alternative written form of a kanji that carries the same meaning and reading (e.g. 儘 and 侭).",
              },
              {
                term: "Old Form",
                jp: "旧字体",
                reading: "きゅうじたい",
                desc: "The traditional form of a kanji used before the post-war script reform (e.g. 國 → 国).",
              },
              {
                term: "Ateji",
                jp: "当て字",
                reading: "あてじ",
                desc: "Kanji assigned to a word based on phonetic reading rather than meaning.",
              },
            ],
          },
        };

        // Legend popup: create overlay lazily, show/hide
        var legendOverlay = null;

        function showLegend(type, currentValue) {
          var data = legendData[type];
          if (!data) return;
          var matchValue = (currentValue || "").trim().toLowerCase();

          if (!legendOverlay) {
            legendOverlay = document.createElement("div");
            legendOverlay.className = "notes-legend-overlay";
            legendOverlay.innerHTML =
              '<div class="notes-legend-modal">' +
              '<div class="notes-legend-header">' +
              '<span class="notes-legend-title"></span>' +
              '<button class="notes-legend-close tappable"><i class="fas fa-times"></i></button>' +
              "</div>" +
              '<div class="notes-legend-body"></div>' +
              "</div>";
            document.body.appendChild(legendOverlay);

            legendOverlay.addEventListener("click", function (e) {
              if (e.target === legendOverlay) closeLegend();
            });
            legendOverlay
              .querySelector(".notes-legend-close")
              .addEventListener("click", closeLegend);
          }

          legendOverlay.querySelector(".notes-legend-title").textContent =
            data.title;

          var bodyHtml = '<table class="notes-legend-table">';
          bodyHtml +=
            "<thead><tr><th>Term</th><th>Description</th></tr></thead>";
          bodyHtml += "<tbody>";
          data.entries.forEach(function (entry) {
            var isMatch = matchValue && entry.term.toLowerCase() === matchValue;
            bodyHtml +=
              "<tr" + (isMatch ? ' class="legend-highlight"' : "") + ">";
            bodyHtml += '<td class="notes-legend-term">';
            bodyHtml +=
              '<span class="notes-legend-term-en">' + entry.term + "</span>";
            if (entry.jp) {
              bodyHtml += '<span class="notes-legend-term-jp">' + entry.jp;
              if (entry.reading)
                bodyHtml +=
                  ' <span class="notes-legend-reading">(' +
                  entry.reading +
                  ")</span>";
              bodyHtml += "</span>";
            }
            bodyHtml += "</td>";
            bodyHtml += '<td class="notes-legend-desc">' + entry.desc + "</td>";
            bodyHtml += "</tr>";
          });
          bodyHtml += "</tbody></table>";

          legendOverlay.querySelector(".notes-legend-body").innerHTML =
            bodyHtml;
          legendOverlay.classList.add("active");

          // Scroll highlighted row into view
          var highlighted = legendOverlay.querySelector(".legend-highlight");
          if (highlighted) {
            highlighted.scrollIntoView({ block: "center", behavior: "smooth" });
          }
        }

        function closeLegend() {
          if (legendOverlay) legendOverlay.classList.remove("active");
        }

        if (window._senrenLegendKeyHandler) {
          document.removeEventListener(
            "keydown",
            window._senrenLegendKeyHandler,
          );
        }
        window._senrenLegendKeyHandler = function (e) {
          if (
            e.key === "Escape" &&
            legendOverlay &&
            legendOverlay.classList.contains("active")
          ) {
            closeLegend();
          }
        };
        document.addEventListener("keydown", window._senrenLegendKeyHandler, {signal:window.senrenCardController?.signal});

        // Details section: info icon click → show legend
        notesBox
          .querySelectorAll(".notes-details-info")
          .forEach(function (btn) {
            btn.addEventListener("click", function (e) {
              e.stopPropagation();
              var type = btn.getAttribute("data-legend");
              var item = btn.closest(".notes-details-item");
              var value = item
                ? item.querySelector(".notes-details-value").textContent
                : "";
              showLegend(type, value);
            });
          });

        var totalSections = sectionEls.length;
        var currentNoteIndex = 0;

        // Counter
        var counterEl = notesPanel.querySelector(".notes-counter");
        function updateCounter() {
          if (counterEl && totalSections > 1) {
            counterEl.textContent =
              currentNoteIndex + 1 + " / " + totalSections;
            counterEl.style.display = "block";
          } else if (counterEl) {
            counterEl.style.display = "none";
          }
        }

        // Toggle areas
        var toggleAreas = notesPanel.querySelectorAll(".toggle-area");
        if (totalSections <= 1) {
          toggleAreas.forEach(function (a) {
            a.style.display = "none";
          });
        }

        function showSection(index) {
          sectionEls.forEach(function (el, i) {
            el.style.display = i === index ? "block" : "none";
          });
          currentNoteIndex = index;
          updateCounter();
          // Recalculate max-height for the panel
          if (!notesPanel.classList.contains("is-collapsed")) {
            notesPanel.style.maxHeight = notesPanel.scrollHeight + "px";
          }
        }

        function handleNoteToggle(direction) {
          if (totalSections <= 1) return;
          var next;
          if (direction === "right") {
            next = (currentNoteIndex + 1) % totalSections;
          } else {
            next = (currentNoteIndex - 1 + totalSections) % totalSections;
          }
          showSection(next);
        }

        toggleAreas.forEach(function (area) {
          area.onclick = function () {
            if (totalSections <= 1) return;
            if (
              area.classList.contains("right") ||
              area.classList.contains("right-larger")
            ) {
              handleNoteToggle("right");
            } else {
              handleNoteToggle("left");
            }
          };
        });

        // H/L navigation for notes (only when notes visible)
        if (window._senrenNotesNavHandler) {
          document.removeEventListener(
            "keydown",
            window._senrenNotesNavHandler,
          );
        }
        window._senrenNotesNavHandler = function (e) {
          if (totalSections <= 1) return;
          if (e.ctrlKey || e.altKey || e.metaKey) return;
          if (notesPanel.classList.contains("is-collapsed")) return;
          if (
            document.activeElement &&
            (document.activeElement.tagName === "INPUT" ||
              document.activeElement.tagName === "TEXTAREA")
          )
            return;
          if (
            typeof lightbox !== "undefined" &&
            lightbox.classList.contains("active")
          )
            return;
          if (document.querySelector(".notes-legend-overlay.active")) return;

          if (e.key === "h") {
            e.preventDefault();
            handleNoteToggle("left");
          }
          if (e.key === "l") {
            e.preventDefault();
            handleNoteToggle("right");
          }
        };
        document.addEventListener("keydown", window._senrenNotesNavHandler, {signal:window.senrenCardController?.signal});

        updateCounter();
      } catch (err) {
        console.error("initNotesSections error:", err);
      }
    })();

    // Toggle notes expand/collapse via header button
    applyClickToggleEffect(".toggle-notes", "#notes");

    // N key to toggle notes expand/collapse
    (function () {
      var notesPanelN = document.getElementById("notes");
      if (!notesPanelN) return;

      if (window._senrenNotesToggleHandler) {
        document.removeEventListener(
          "keydown",
          window._senrenNotesToggleHandler,
        );
      }
      window._senrenNotesToggleHandler = function (e) {
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        if (
          document.activeElement &&
          (document.activeElement.tagName === "INPUT" ||
            document.activeElement.tagName === "TEXTAREA")
        )
          return;
        if (
          typeof lightbox !== "undefined" &&
          lightbox.classList.contains("active")
        )
          return;
        if (document.querySelector(".notes-legend-overlay.active")) return;

        if (e.key === "n") {
          e.preventDefault();
          requestAnimationFrame(function () {
            var isCollapsed = notesPanelN.classList.contains("is-collapsed");
            if (isCollapsed) {
              notesPanelN.classList.remove("is-collapsed");
              notesPanelN.style.maxHeight = notesPanelN.scrollHeight + "px";
            } else {
              notesPanelN.classList.add("is-collapsed");
              notesPanelN.style.maxHeight = "0";
            }
          });
        }
      };
      document.addEventListener("keydown", window._senrenNotesToggleHandler, {signal:window.senrenCardController?.signal});
    })();

    // Auto-expand notes if setting is true
    var notesPanel = document.getElementById("notes");
    if (notesPanel) {
      var noteExpandByDefault = senrenConfig.notesDefaultExpanded;
      if (noteExpandByDefault === "true") {
        if (notesPanel.classList.contains("is-collapsed")) {
          notesPanel.style.transition = "none";
          notesPanel.classList.remove("is-collapsed");
          notesPanel.style.maxHeight = notesPanel.scrollHeight + "px";
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              notesPanel.style.transition = "";
            });
          });
        }
      }
    }

    if (sentenceEng) {
      const expandByDefault = senrenConfig.translationDefaultExpanded;

      if (expandByDefault === "true") {
        sentenceEng.style.transition = "none";
        sentenceEng.classList.remove("is-collapsed");
        sentenceEng.style.maxHeight = sentenceEng.scrollHeight + "px";

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            sentenceEng.style.transition = "";
          });
        });
      }
    }

    applyClickToggleEffect("#formattedSentence", "#sentenceEng");

    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    const pictureContainer = document.querySelector(".picture-container");
    const hasPicture =
      pictureContainer &&
      pictureContainer.querySelector("img:not(.senren-filtered-image)");
    const backdropEnabled = senrenConfig.enableBackdropLayout === "1";
    const backdropStyle = senrenConfig.backdropStyle;

    let pictureHoverTriggerSelector;

    if (backdropEnabled && backdropStyle === "0") {
      let selectors = [
        ".background-box",
        ".picture-container",
        ".sentence-container",
        ".tags-and-links-wrapper",
        ".misc-info",
      ];

      if (window.matchMedia("(max-width: 1050px)").matches) {
        selectors.unshift(".header");
      }

      pictureHoverTriggerSelector = selectors.join(", ");
    } else {
      pictureHoverTriggerSelector =
        isTouchDevice || !hasPicture ? ".background-box" : ".picture-container";
    }

    const miscExpanded = senrenConfig.miscInfoDefaultExpanded;
    const miscInfoEl = document.querySelector(".misc-info");

    if (miscInfoEl) {
      if (miscInfoEl.textContent.trim() !== "") {
        miscInfoEl.classList.add("has-content");
      } else {
        miscInfoEl.classList.remove("has-content");
      }
    }

    if (miscExpanded !== "true") {
      applyHoverEffect(pictureHoverTriggerSelector, ".misc-info", 10);
    }
  }

  // Adjusts word size based on character length
  function dynamicWordSize() {
    const wordElement = document.querySelector("#word");
    if (wordElement) {
      const wordSpan = wordElement.querySelector("span");
      if (wordSpan) {
        const stackElement = wordSpan.querySelector(".word-reading-stack, ruby");
        const baseElement = stackElement?.querySelector(".ruby-base-word");
        const content = stackElement
          ? (baseElement || stackElement.firstChild).textContent.trim()
          : wordSpan.textContent.trim();
        const contentLength = content.length;

        const classNumber = Math.min(contentLength, 9);
        wordElement.classList.add(`length-${classNumber}`);
      }
    }
  }

  // Enables NSFW options
  function nsfw() {
    if (
      senrenConfig.muteNsfwAudio !== "true" &&
      senrenConfig.blurNsfwPicture !== "true"
    )
      return;

    if (!window.IS_NSFW) return;

    if (senrenConfig.muteNsfwAudio === "true") {
      const wordAudioButton = document.querySelector(
        ".audio .soundLink, .audio .replaybutton, .audio .replay-button",
      );
      if (wordAudioButton) {
        wordAudioButton.click();
      }
    }

    if (senrenConfig.blurNsfwPicture === "true") {
      document.querySelectorAll(".picture-container").forEach((container) => {
        if (container.classList.contains("nsfw")) {
          container.querySelectorAll("img").forEach((img) => {
            img.addEventListener("click", () => {
              img.classList.add("clicked");
            });
          });
        }
      });
    }
  }

  // Mutes the sentence audio playback based on CSS variables
  function muteSentence() {
    if (senrenConfig.muteSentenceAudio !== "true") return;

    const muteAudio = senrenConfig.muteSentenceAudio;

    if (muteAudio === "true") {
      const wordAudioButton = document.querySelector(
        ".audio .soundLink, .audio .replaybutton, .audio .replay-button",
      );

      if (wordAudioButton) {
        wordAudioButton.click();
      }
    }
  }

  // Adds titles to dictionaries
  function dictionaryTitle() {
    let processedDictionaries = new Set();

    document.querySelectorAll(".yomitan-glossary li").forEach((li) => {
      let dictionaryName = li.getAttribute("data-dictionary");
      if (dictionaryName && !processedDictionaries.has(dictionaryName)) {
        let titleElement = document.createElement("div");
        titleElement.textContent = dictionaryName;
        titleElement.classList.add("dictionary-title");
        li.prepend(titleElement);
        processedDictionaries.add(dictionaryName);
      }
    });
  }

  // Splits tags into separate elements
  function splitTags() {
    const tagsContainer = ELS.tagsContainer;
    if (tagsContainer) {
      const tagsAttr = document.querySelector(".back")?.getAttribute("data-tags") || "";
      const tags = tagsAttr.split(" ");
      const elements = tags.map((tag) => {
        const tagElem = document.createElement("div");
        tagElem.className = "tags";
        tagElem.innerText = tag;
        return tagElem;
      });
      tagsContainer.replaceChildren(...elements);
    }
  }

  var senrenPitchClassNames = [
    "heiban",
    "atamadaka",
    "nakadaka",
    "odaka",
    "kifuku",
  ];

  function getDirectListItems(container) {
    if (!container) return [];
    const lists = Array.from(container.querySelectorAll("ol, ul")).filter(
      (list) => !container.contains(list.parentElement.closest("ol, ul")),
    );
    return lists.flatMap((list) =>
      Array.from(list.children).filter((child) => child.matches("li")),
    );
  }

  function getWordReadingElement(stackElement) {
    return stackElement?.querySelector(".word-reading") ||
      stackElement?.querySelector("rt") || null;
  }

  function getFirstReadingHtml(html) {
    const container = document.createElement("div");
    container.innerHTML = html || "";
    container.querySelectorAll("script").forEach((node) => node.remove());
    const styles = Array.from(container.querySelectorAll('style, link[rel="stylesheet"]'));
    styles.forEach((node) => node.remove());
    const reading = container.querySelector("li") || container;
    if (!reading.children.length) {
      reading.textContent = reading.textContent.split(/[,、・]/)[0].trim();
    }
    return styles.map((node) => node.outerHTML).join("") + reading.innerHTML.trim();
  }
  window.senrenGetFirstReadingHtml = getFirstReadingHtml;

  function normalizeReadingText(element) {
    const copy = element?.cloneNode(true);
    copy?.querySelectorAll("style, script, rt, rp").forEach((node) => node.remove());
    if (copy) normalizeNasalAnnotations(copy);
    return (copy?.textContent || "").normalize("NFC").replace(/\s/g, "");
  }
  window.senrenGetReadingText = normalizeReadingText;

  function normalizeNasalAnnotations(copy) {
    let markerCount = 0;
    copy.querySelectorAll("span").forEach((mark) => {
      if (mark.textContent !== "゚") return;
      const wrapper = mark.parentElement;
      const kana = mark.previousElementSibling;
      const voiced = kana?.textContent.normalize("NFC").replace(/[かきくけこカキクケコ]/g,
        (character) => String.fromCharCode(character.charCodeAt(0) + 1));
      if (!/^[がぎぐげごガギグゲゴ]$/.test(voiced || "")) return;
      const circle = Array.from(wrapper.children).find((node) =>
        node.classList.contains("ic-7946e4873e") ||
        (node.style.borderRadius === "50%" && node.style.borderStyle === "solid"));
      if (!circle) return;
      // Yomitan encodes nasal が as a nested か + hidden handakuten + circle.
      // Only the comparison copy changes; the selected field markup stays intact.
      kana.textContent = voiced;
      mark.remove();
      circle.remove();
      wrapper.replaceWith(...wrapper.childNodes);
      markerCount++;
    });
    return markerCount;
  }

  function getReadingMorae(element) {
    return normalizeReadingText(element).replace(/[゙゚]/g, "").match(REGEX.MORA) || [];
  }

  // Explicit downstep positions are authoritative. Imported pitch classes are
  // used only when no usable position was supplied by the note.
  function getPitchType(number, readingElement, moraCount = getReadingMorae(readingElement).length) {
    if (!moraCount || !Number.isInteger(number) || number < 0) return "unknown";
    if (number === 0) return "heiban";
    if (number === 1) return "atamadaka";
    if (number > moraCount) return "unknown";
    if (number === moraCount) return moraCount > 1 ? "odaka" : "atamadaka";
    return number > 1 ? "nakadaka" : "unknown";
  }
  window.senrenGetPitchType = getPitchType;

  function getManualReadingContent(element) {
    if (!element || element.querySelector(':not(div):not(p):not(br):not(style):not(link[rel="stylesheet"])')) return null;
    const content = element?.cloneNode(true);
    if (!content) return null;
    content.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove());
    // Preserve imported/formatted readings; Anki may wrap manual text in divs.
    if (Array.from(content.querySelectorAll("*")).some((node) =>
      !node.matches("div, p, br"))) return null;
    return content;
  }

  function getManualReadingLines(element) {
    const content = getManualReadingContent(element);
    if (!content) return null;
    content.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    content.querySelectorAll("div, p").forEach((node) => node.append("\n"));
    return content.textContent.split(/[\r\n]+/).map((text) => text.trim()).filter(Boolean);
  }

  function prepareManualReadingLists(context) {
    if (!context.reading || !context.position) return;
    const items = getDirectListItems(context.reading);
    const lines = (items.length ? items : [context.reading]).map(getManualReadingLines);
    if (lines.some((line) => !line)) return;
    const readings = lines.flat();
    if (!readings.length || readings.some((text) => !REGEX.KANA_ONLY.test(text))) return;
    const positionItems = getDirectListItems(context.position);
    const positions = positionItems.length ? positionItems.map((item) => item.textContent) :
      getManualReadingLines(context.position) || [];
    if (readings.length === 1 && positions.length <= 1) return;
    if (readings.length > 1 && positions.length > 1 && positions.length !== readings.length) return;
    const readingList = document.createElement("ol");
    const positionList = document.createElement("ol");
    // A row is one contour; several brackets within that row are its downsteps.
    const rowCount = Math.max(readings.length, positions.length);
    for (let index = 0; index < rowCount; index++) {
      const reading = document.createElement("li");
      reading.textContent = readings[readings.length === 1 ? 0 : index];
      readingList.appendChild(reading);
      if (positions.length) {
        const position = document.createElement("li");
        position.textContent = positions[positions.length === 1 ? 0 : index];
        positionList.appendChild(position);
      }
    }
    context.reading.replaceChildren(...context.reading.querySelectorAll('style, link[rel="stylesheet"]'), readingList);
    if (positionList.children.length) context.position.replaceChildren(positionList);
  }

  function addReadingPitchGraph(element, position) {
    if (!element) return false;
    const content = getManualReadingContent(element);
    if (!content) return false;
    const text = normalizeReadingText(content);
    if (!REGEX.KANA_ONLY.test(text)) return false;
    const morae = text.replace(/[゙゚]/g, "").match(REGEX.MORA) || [];
    const positions = [...new Set(Array.isArray(position) ? position : [position])]
      .filter((number) => Number.isInteger(number) && number >= 0 && number <= morae.length)
      .sort((a, b) => a - b);
    if (!morae.length || !positions.length) return false;
    const drops = positions.filter((number) => number > 0);
    // Consecutive morae cannot both fall: a low mora separates two downsteps.
    if (drops.some((number, index) => index > 0 && number - drops[index - 1] === 1)) return false;
    const lastDrop = drops.at(-1) ?? morae.length;

    const graph = document.createElement("span");
    graph.className = "senren-generated-reading";
    graph.style.display = "inline";
    morae.forEach((mora, index) => {
      const high = (index === 0 && drops[0] === 1) ||
        (index > 0 && index < lastDrop && !drops.includes(index));
      const drop = high && drops.includes(index + 1);
      const wrapper = document.createElement("span");
      wrapper.className = "senren-generated-mora";
      wrapper.style.cssText = "display:inline-block;position:relative;";
      if (drop) {
        wrapper.style.paddingRight = "0.1em";
        wrapper.style.marginRight = "0.1em";
      }
      const kana = document.createElement("span");
      kana.style.display = "inline";
      kana.textContent = mora;
      const line = document.createElement("span");
      line.style.borderColor = "currentColor";
      if (high) {
        line.style.cssText += "display:block;user-select:none;pointer-events:none;position:absolute;top:0.1em;left:0;right:0;height:0;border-top-width:0.1em;border-top-style:solid;";
        if (drop) {
          line.style.right = "-0.1em";
          line.style.height = "0.4em";
          line.style.borderRightWidth = "0.1em";
          line.style.borderRightStyle = "solid";
        }
      }
      wrapper.append(kana, line);
      graph.appendChild(wrapper);
    });
    element.replaceChildren(...element.querySelectorAll('style, link[rel="stylesheet"]'), graph);
    return true;
  }
  window.senrenDrawPitchLines = (container) => {
    container?.querySelectorAll("li").forEach((entry) => {
      addReadingPitchGraph(entry.querySelector("rt"), getPitchPositions(entry.querySelector(".position")));
    });
  };

  function getPitchPosition(element) {
    const match = element?.textContent.match(/-?\d+/);
    if (!match) return null;
    const position = parseInt(match[0], 10);
    return position >= 0 ? position : null;
  }

  function getPitchPositions(element) {
    const content = element?.cloneNode(true);
    content?.querySelectorAll("style, script").forEach((node) => node.remove());
    content?.querySelectorAll("li, div, p, br").forEach((node) => node.after(" "));
    return [...new Set(Array.from(content?.textContent.matchAll(/-?\d+/g) || [],
      (match) => Number(match[0])).filter((position) => position >= 0))].sort((a, b) => a - b);
  }

  function isDevoicingMarker(element) {
    if (element.textContent.trim()) return false;
    // The extracted-media class identifies the circle before its CSS loads.
    return element.classList.contains("ic-3c7893fbde") ||
      element.style.borderStyle === "dotted" ||
      getComputedStyle(element).borderTopStyle === "dotted";
  }

  function getPitchGraphSignature(readingItem) {
    const copy = readingItem.cloneNode(true);
    const originalSpans = readingItem.querySelectorAll("span");
    let markerCount = 0;
    copy.querySelectorAll("span").forEach((span, index) => {
      if (isDevoicingMarker(originalSpans[index])) {
        span.remove();
        markerCount++;
      }
    });
    markerCount += normalizeNasalAnnotations(copy);
    copy.querySelectorAll("style, script").forEach((node) => node.remove());
    return {
      graphSignature: copy.innerHTML.normalize("NFC").replace(/>\s+</g, "><").trim(),
      markerCount,
    };
  }

  function getGraphPitchPosition(element) {
    const wrappers = Array.from(element.querySelectorAll("span")).filter((span) =>
      span.matches(".pronunciation-mora, .ic-d2079bc8a6, .ic-be55b7f1de") ||
      (span.style.display === "inline-block" && span.style.position === "relative"));
    const morae = wrappers.filter((span) =>
      !wrappers.some((parent) => parent !== span && parent.contains(span)));
    if (!morae.length) return null;
    const pattern = morae.map((mora) => {
      const line = Array.from(mora.children).find((child) =>
        child.matches(".pronunciation-mora-line, .ic-7dcf23255c, .ic-f900b61947") ||
        child.style.borderTopStyle === "solid");
      return {
        high: mora.dataset.pitch === "high" || Boolean(line &&
          (line.matches(".ic-7dcf23255c, .ic-f900b61947") || line.style.borderTopWidth)),
        drop: mora.dataset.pitchNext === "low" || Boolean(line &&
          (line.classList.contains("ic-f900b61947") || line.style.borderRightWidth)),
      };
    });
    const drop = pattern.findIndex((mora) => mora.high && mora.drop);
    if (drop >= 0) return drop + 1;
    if (!pattern[0].high && pattern.slice(1).every((mora) => mora.high)) return 0;
    return null;
  }

  function getReadingContext() {
    const word = ELS.word;
    const mainSpan = word?.querySelector(":scope > span");
    const stack = mainSpan?.querySelector(".word-reading-stack, ruby");
    return {
      word,
      mainSpan,
      stack,
      base: stack?.querySelector(".ruby-base-word") || null,
      reading: getWordReadingElement(stack),
      position: ELS.position,
      categories: mainSpan?.querySelector("#categories") || null,
      sentence: ELS.formattedSentence,
    };
  }

  function collectReadingEntries(context) {
    const readingItems = getDirectListItems(context.reading);
    const positionItems = getDirectListItems(context.position);
    const aligned =
      readingItems.length > 0 && positionItems.length === readingItems.length;
    const importedTypes = (context.categories?.textContent || "")
      .split(",")
      .map((value) => value.trim());
    const displayItems = readingItems.length
      ? readingItems
      : normalizeReadingText(context.reading)
        ? [context.reading]
        : [];

    return displayItems.map((element, index) => {
      const readingText = normalizeReadingText(element);
      const moraCount = (readingText.replace(/[゙゚]/g, "").match(REGEX.MORA) || []).length;
      const positionSource = aligned ? positionItems[index] :
        displayItems.length === 1 ? context.position : null;
      const positions = getManualReadingContent(element) ?
        getPitchPositions(positionSource).filter((number) => number <= moraCount) : null;
      let position = aligned
        ? getPitchPosition(positionItems[index])
        : displayItems.length === 1 && positionItems.length <= 1
          ? getPitchPosition(context.position)
          : null;
      if (positions?.length) position = positions[0];
      if (position > moraCount) {
        position = getGraphPitchPosition(element);
      }
      return {
        element,
        positionElement: aligned ? positionItems[index] : null,
        position,
        positions,
        readingText,
        moraCount,
        importedType: importedTypes.length === 1 ? importedTypes[0] : importedTypes[index],
        // Read styles for all entries before removing duplicates invalidates layout.
        ...getPitchGraphSignature(element),
      };
    });
  }

  function deduplicateReadingEntries(context) {
    const entries = collectReadingEntries(context);
    const seen = new Map();
    const uniqueEntries = [];

    entries.forEach((entry) => {
      const signature = JSON.stringify([
        entry.readingText,
        entry.positions?.length ? entry.positions : entry.position,
        Number.isInteger(entry.position) ? null : entry.importedType,
        entry.graphSignature,
      ]);

      const previous = seen.get(signature);
      if (previous) {
        const preferCurrent = entry.markerCount < previous.markerCount;
        const discarded = preferCurrent ? previous : entry;
        if (preferCurrent) {
          previous.element.replaceWith(entry.element);
          if (previous.positionElement && entry.positionElement) {
            previous.positionElement.replaceWith(entry.positionElement);
          }
        }
        if (discarded.element !== context.reading) discarded.element.remove();
        discarded.positionElement?.remove();
        if (preferCurrent) {
          uniqueEntries[uniqueEntries.indexOf(previous)] = entry;
          seen.set(signature, entry);
        }
        return;
      }

      seen.set(signature, entry);
      uniqueEntries.push(entry);
    });

    uniqueEntries.forEach((entry) => {
      if (entry.element !== context.reading) {
        entry.element.parentElement.classList.add("pitch-readings-ready");
      }
    });
    context.reading?.classList.add("reading-ready");
    context.reading?.classList.toggle("reading-single", uniqueEntries.length === 1);
    return uniqueEntries;
  }

  function cleanCommaSeparatedClasses(elements) {
    elements.filter(Boolean).forEach((element) => {
      Array.from(element.classList).forEach((className) => {
        if (!className.includes(",")) return;
        element.classList.remove(className);
        const primaryClass = className.split(",")[0].trim();
        if (primaryClass) element.classList.add(primaryClass);
      });
    });
  }

  function resolveEntryPitchTypes(context, entries) {
    entries.forEach((entry) => {
      entry.element.classList.add("pitch-reading");
      entry.element.classList.remove(...senrenPitchClassNames);
      const calculated = Number.isInteger(entry.position)
        ? getPitchType(entry.position, entry.element, entry.moraCount)
        : "unknown";
      entry.pitchType =
        calculated !== "unknown" ? calculated : entry.importedType || "unknown";
      if (senrenPitchClassNames.includes(entry.pitchType)) {
        entry.element.classList.add(entry.pitchType);
      }
    });
  }

  function formatPitchMetadata(context, entries) {
    const positionItems = getDirectListItems(context.position);
    const fallbackNumbers = (positionItems.length ? positionItems : [context.position])
      .flatMap((element) => Array.from(
        element?.textContent.matchAll(/-?\d+/g) || [],
        (match) => parseInt(match[0], 10),
      )).filter((position) => position >= 0);
    const numbers = [...new Set(entries.length && entries.every((entry) => entry.positionElement || entry.positions?.length)
      ? entries.flatMap((entry) => entry.positions || [entry.position]).filter(Number.isInteger)
      : fallbackNumbers)];
    const resolvedTypes = numbers.map((number) => {
      const entry = entries.find((entry) => entry.positions?.includes(number) || entry.position === number) ||
        (entries.length === 1 ? entries[0] : null);
      const calculated = entry ? getPitchType(number, entry.element, entry.moraCount) : "unknown";
      return calculated !== "unknown"
        ? calculated
        : entry?.pitchType || "unknown";
    });

    if (context.position) {
      context.position.replaceChildren(
        ...numbers.flatMap((number, index) => {
          const numberElement = document.createElement("span");
          numberElement.className = `pitch-number ${resolvedTypes[index]}`;
          numberElement.textContent = String(number);
          if (index === numbers.length - 1) return [numberElement];
          return [numberElement, document.createTextNode("・")];
        }),
      );
      context.position.dataset.cleaned = "true";
    }

    if (context.categories && resolvedTypes.length) {
      context.categories.dataset.fullCategories = resolvedTypes.join("<br>");
      context.categories.textContent = resolvedTypes[0];
      if (!context.position?.dataset.categoryHoverBound) {
        context.position?.addEventListener("mouseenter", () => {
          context.categories.innerHTML = context.categories.dataset.fullCategories;
        });
        if (context.position) context.position.dataset.categoryHoverBound = "true";
      }
    }

    const pitchTypes = new Set(
      [...resolvedTypes, ...entries.map((entry) => entry.pitchType)]
        .filter((pitchType) => senrenPitchClassNames.includes(pitchType)),
    );
    const multiplePitchTypes = pitchTypes.size > 1;
    context.mainSpan?.classList.toggle(
      "multiple-pitch-readings",
      multiplePitchTypes,
    );
    context.sentence?.classList.toggle(
      "multiple-pitch-readings",
      multiplePitchTypes,
    );

    const primaryType = entries[0]?.pitchType;
    if (senrenPitchClassNames.includes(primaryType)) {
      [context.mainSpan, context.sentence].filter(Boolean).forEach((element) => {
        element.classList.remove(...senrenPitchClassNames);
        element.classList.add(primaryType);
      });
    }
  }

  function restoreKanaReading(context) {
    if (!context.word?.classList.contains("reading-is-word")) return;
    const originalBaseHtml =
      context.stack._senrenOriginalBaseHtml ??
      context.stack.dataset.originalBaseHtml;
    if (originalBaseHtml !== undefined) context.base.innerHTML = originalBaseHtml;
    context.reading.style.display = context.stack._senrenOriginalReadingDisplay;
    context.word.classList.remove("reading-is-word");
  }

  function applyKanaReading(context, entries) {
    restoreKanaReading(context);
    if (senrenConfig.noDuplicateKana !== "true" || entries.length !== 1) return;
    if (context.base.querySelector("img")) return;

    const wordText = normalizeReadingText(context.base).replace(/[（(].*?[）)]$/, "");
    const toHiragana = (text) => text.replace(/[ァ-ヶ]/g,
      (kana) => String.fromCharCode(kana.charCodeAt(0) - 0x60));
    if (!REGEX.KANA_ONLY.test(wordText) ||
        toHiragana(wordText) !== toHiragana(entries[0].readingText)) return;

    context.stack._senrenOriginalBaseHtml = context.base.innerHTML;
    context.stack._senrenOriginalReadingDisplay = context.reading.style.display;
    context.base.innerHTML = entries[0].element.innerHTML;
    context.reading.style.display = "none";
    context.word.classList.add("reading-is-word");
  }

  function renderBackReading() {
    const context = getReadingContext();
    if (!context.word || !context.stack || !context.base || !context.reading) {
      return;
    }

    let entries = context.stack._senrenReadingEntries;
    if (!entries) {
      cleanCommaSeparatedClasses([
        context.mainSpan,
        context.stack,
        context.position,
        context.sentence,
      ]);
      prepareManualReadingLists(context);
      entries = deduplicateReadingEntries(context);
      resolveEntryPitchTypes(context, entries);
      entries.forEach((entry) => addReadingPitchGraph(entry.element, entry.positions || entry.position));
      formatPitchMetadata(context, entries);
      context.stack._senrenReadingEntries = entries;
    }

    applyKanaReading(context, entries);
    context.word.classList.add("word-layout-ready");
  }

  // Compatibility entry points used by settings and the kanji-hover module.
  window.renderBackReading = renderBackReading;
  window.noDuplicateKana = renderBackReading;
  window.senrenDeduplicatePitchReadings = (stackElement, positionElement) => {
    const context = getReadingContext();
    if (stackElement) {
      context.stack = stackElement;
      context.reading = getWordReadingElement(stackElement);
    }
    if (positionElement) context.position = positionElement;
    const entries = context.stack?._senrenReadingEntries || deduplicateReadingEntries(context);
    resolveEntryPitchTypes(context, entries);
    return new Set(entries.map((entry) => entry.pitchType));
  };

  // Highlight the target word in the furigana sentence
  function highlightFurigana() {
    const sentence = document.getElementById("hiddenSentence")?.innerHTML || "";
    let sentenceFurigana = document.getElementById("hiddenSentenceFurigana")?.innerHTML || "";

    if (!sentenceFurigana.trim()) {
      ELS.formattedSentence.innerHTML = sentence;
      return;
    }

    sentenceFurigana = sentenceFurigana.replace(
      /([\u3005\u4e00-\u9faf]+)\[([^\]]+)\]/g,
      "<ruby><rb>$1</rb><rt>$2</rt></ruby>",
    );

    sentenceFurigana = sentenceFurigana.replace(
      REGEX.RUBY_RT,
      "<ruby><rb>$1</rb><rt>$2</rt></ruby>",
    );

    let cleanedFurigana = sentenceFurigana
      .replace(/<ruby><rb>([。、！？！？])<\/rb><rt>.*?<\/rt><\/ruby>/g, "$1")
      .replace(/<ruby>([。、！？！？])<rt>.*?<\/rt><\/ruby>/g, "$1");

    if (
      cleanedFurigana.includes('<span class="highlight">') ||
      cleanedFurigana.includes("<b>")
    ) {
      ELS.formattedSentence.innerHTML = cleanedFurigana;
      return;
    }

    const highlightedWords = [];
    let match;
    while ((match = REGEX.HIGHLIGHT.exec(sentence)) !== null) {
      highlightedWords.push(match[1]);
    }

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = cleanedFurigana;

    const allNodes = [];

    function collectTextAndRubyNodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent.length > 0) {
          allNodes.push({ type: "text", node: node });
        }
      } else if (node.tagName === "RUBY") {
        allNodes.push({ type: "ruby", node: node });
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          collectTextAndRubyNodes(node.childNodes[i]);
        }
      }
    }

    collectTextAndRubyNodes(tempDiv);

    let plainText = "";
    const nodePositions = [];

    allNodes.forEach((item) => {
      let text;
      if (item.type === "text") {
        text = item.node.textContent;
      } else {
        const rb = item.node.querySelector("rb") || item.node.firstChild;
        text = rb.textContent;
      }

      nodePositions.push({
        node: item.node,
        type: item.type,
        start: plainText.length,
        end: plainText.length + text.length,
      });

      plainText += text;
    });

    highlightedWords.forEach((word) => {
      let searchStartIndex = 0;
      let wordStart;

      while ((wordStart = plainText.indexOf(word, searchStartIndex)) !== -1) {
        const wordEnd = wordStart + word.length;

        const affectedNodes = nodePositions.filter(
          (pos) => pos.start < wordEnd && pos.end > wordStart,
        );

        affectedNodes.forEach((pos) => {
          const node = pos.node;
          if (!node.parentNode) return;

          const relativeStart = Math.max(0, wordStart - pos.start);
          let relativeEnd = Math.min(pos.end - pos.start, wordEnd - pos.start);

          if (pos.type === "ruby") {
            const rb = node.querySelector("rb") || node.firstChild;
            relativeEnd = Math.min(relativeEnd, rb.textContent.length);
          } else {
            relativeEnd = Math.min(relativeEnd, node.textContent.length);
          }

          if (pos.start >= wordStart && pos.end <= wordEnd) {
            const wrapper = document.createElement("span");
            wrapper.className = "highlight";

            if (pos.type === "ruby") {
              const clone = node.cloneNode(true);
              wrapper.appendChild(clone);
              node.parentNode.replaceChild(wrapper, node);
            } else {
              wrapper.textContent = node.textContent;
              node.parentNode.replaceChild(wrapper, node);
            }
          } else {
            if (pos.type === "ruby") {
              const ruby = node;
              const rb = ruby.querySelector("rb") || ruby.firstChild;
              const rt = ruby.querySelector("rt");
              if (!rb || !rt) return;

              const baseText = rb.textContent;
              const rtText = rt.textContent;

              let newHTML = "";

              if (relativeStart > 0) {
                const subRb = baseText.substring(0, relativeStart);
                const subRtLen = Math.round(
                  (rtText.length * relativeStart) / baseText.length,
                );
                const subRt = rtText.substring(0, subRtLen);
                newHTML += `<ruby><rb>${subRb}</rb><rt>${subRt}</rt></ruby>`;
              }

              const midRb = baseText.substring(relativeStart, relativeEnd);
              const startRtIdx = Math.round(
                (rtText.length * relativeStart) / baseText.length,
              );
              const endRtIdx = Math.round(
                (rtText.length * relativeEnd) / baseText.length,
              );
              const midRt = rtText.substring(startRtIdx, endRtIdx);

              newHTML += `<span class="highlight"><ruby><rb>${midRb}</rb><rt>${midRt}</rt></ruby></span>`;

              if (relativeEnd < baseText.length) {
                const subRb = baseText.substring(relativeEnd);
                const subRt = rtText.substring(endRtIdx);
                newHTML += `<ruby><rb>${subRb}</rb><rt>${subRt}</rt></ruby>`;
              }

              const span = document.createElement("span");
              span.innerHTML = newHTML;
              ruby.parentNode.replaceChild(span, ruby);
            } else {
              const text = node.textContent;
              const beforeText = text.substring(0, relativeStart);
              const highlightedText = text.substring(
                relativeStart,
                relativeEnd,
              );
              const afterText = text.substring(relativeEnd);

              const fragment = document.createDocumentFragment();
              if (beforeText)
                fragment.appendChild(document.createTextNode(beforeText));

              const hlSpan = document.createElement("span");
              hlSpan.className = "highlight";
              hlSpan.textContent = highlightedText;
              fragment.appendChild(hlSpan);

              if (afterText)
                fragment.appendChild(document.createTextNode(afterText));

              node.parentNode.replaceChild(fragment, node);
            }
          }
        });
        searchStartIndex = wordEnd;
      }
    });

    ELS.formattedSentence.innerHTML = tempDiv.innerHTML;
  }

  // Alternative pitch styling based on CSS variables
  function alternativePitchStyle() {
    const rootElement = document.documentElement;
    const wordElement = document.getElementById("word");
    if (wordElement) {
      const pitchStyleValue = senrenConfig.pitchStyle;
      wordElement.classList.toggle("alt", pitchStyleValue === "alt");

      const pitchColorsValue = senrenConfig.pitchColors;
      wordElement.classList.toggle("colors", pitchColorsValue === "false");
    }

    const sentenceElement = document.getElementById("formattedSentence");
    if (sentenceElement) {
      const sentenceHighlightValue = senrenConfig.sentencePitchHighlight;
      sentenceElement.classList.toggle(
        "alt-highlight",
        sentenceHighlightValue === "true",
      );
    }
  }

  // Merge entries from the same dictionary
  function consolidateYomitanGlossaryEntries(root) {
    const glossarySpan = root || ELS.glossary?.querySelector(".glossary-box > span");
    if (!glossarySpan) return;
    const owner = glossarySpan.ownerDocument;

    if (glossarySpan.dataset.consolidated === "true") return;

    // Some exports close the dictionary entry before its definition list.
    glossarySpan.querySelectorAll("li[data-dictionary]").forEach((entry) => {
      if (!entry.nextElementSibling?.matches("li:not([data-dictionary])")) return;
      const continuation = owner.createElement("ul");
      while (entry.nextElementSibling?.matches("li:not([data-dictionary])")) {
        continuation.appendChild(entry.nextElementSibling);
      }
      entry.appendChild(continuation);
    });

    const yomitanGlossaryDivs = glossarySpan.querySelectorAll(
      "div.yomitan-glossary",
    );
    if (yomitanGlossaryDivs.length === 0) return;


    yomitanGlossaryDivs.forEach((ygDiv) => {
      const olElement = ygDiv.querySelector("ol");
      if (!olElement) return;

      const listItems = Array.from(
        olElement.children,
      ).filter((item) => item.matches("li[data-dictionary]"));
      if (listItems.length === 0) return;

      const groupedItems = {};
      listItems.forEach((li) => {
        const dictName = li.getAttribute("data-dictionary");
        if (!dictName) return;

        if (!groupedItems[dictName]) {
          groupedItems[dictName] = [];
        }
        groupedItems[dictName].push(li);
      });

      Object.keys(groupedItems).forEach((dictName) => {
        const items = groupedItems[dictName];

        if (items.length > 1) {
          const firstItem = items[0];
          const consolidatedLi = firstItem.cloneNode(false);
          const fragment = owner.createDocumentFragment();

          items.forEach((li, index) => {
            while (li.firstChild) {
              fragment.appendChild(li.firstChild);
            }
            if (index < items.length - 1) {
              const hr = owner.createElement("hr");
              hr.className = "consolidated-entry-separator";
              fragment.appendChild(hr);
            }
          });

          consolidatedLi.appendChild(fragment);
          olElement.replaceChild(consolidatedLi, firstItem);

          for (let i = 1; i < items.length; i++) {
            olElement.removeChild(items[i]);
          }

        }
      });
    });

    glossarySpan.dataset.consolidated = "true";
  }

  // Collapses long dictionary entries and adds a clickable fade-out.
  function collapseDictionary(container) {
    const isCollapsedEnabled = senrenConfig.dictionaryCollapse;
    if (isCollapsedEnabled !== "1") {
      return;
    }

    if (!container || container.dataset.expanded === "true") {
      return;
    }

    const maxHeight = parseInt(senrenConfig.dictionaryMaxHeight, 10);

    const oldFade = container.querySelector(".fade-to-show-more");
    if (oldFade) oldFade.remove();
    container.classList.remove("is-collapsed");

    if (container.scrollHeight > maxHeight) {
      container.classList.add("is-collapsed");

      const fadeElement = document.createElement("div");
      fadeElement.className = "fade-to-show-more tappable";
      container.appendChild(fadeElement);

      fadeElement.addEventListener("click", (e) => {
        e.stopPropagation();
        container.classList.remove("is-collapsed");
        container.dataset.expanded = "true";
        fadeElement.remove();
      });
    }
  }

  // Groups text, audio, and images into navigable scenes
  function enableSceneSwitching() {
    if (window.currentSceneKeyHandler) {
      document.removeEventListener("keydown", window.currentSceneKeyHandler);
      window.currentSceneKeyHandler = null;
    }

    const audioContainer = ELS.audioContainer;
    const audioParts = audioContainer
      ? Array.from(audioContainer.children).filter((el) => el.tagName !== "BR")
      : [];

    if (audioParts.length <= 1) {
      return;
    }

    const baseWaitTime = 100;
    const timePerChar = 150;

    const wordEl = ELS.word;
    let charCount = 5;

    if (wordEl) {
      const rt = wordEl.querySelector(".word-reading, rt");
      const targetElement =
        rt && rt.querySelector("li") ? rt.querySelector("li") : rt || wordEl;

      let rawText = targetElement.textContent;
      let cleanedText = rawText.replace(REGEX.KANA_MODIFIERS, "");

      cleanedText = cleanedText.replace(
        /[ぁぃぅぇぉゃゅょゎァィゥェォャュョヮ]/g,
        "",
      );

      let effectiveCount = cleanedText.length;

      const narrowMatches = cleanedText.match(REGEX.NARROW_VOWELS);

      if (narrowMatches) {
        effectiveCount -= narrowMatches.length * 0.3;
      }

      charCount = Math.round(effectiveCount);

      if (charCount < 1) charCount = 1;
    }

    let SENTENCE_DELAY;

    const hasWordAudio = !!ELS.wordAudioBtn;

    if (!hasWordAudio) {
      SENTENCE_DELAY = 0;
    } else {
      if (charCount === 2) SENTENCE_DELAY = 550;
      else if (charCount === 3) SENTENCE_DELAY = 650;
      else if (charCount === 4) SENTENCE_DELAY = 700;
      else if (charCount === 5) SENTENCE_DELAY = 850;
      else if (charCount === 6) SENTENCE_DELAY = 1000;
      else if (charCount === 7) SENTENCE_DELAY = 1080;
      else if (charCount === 8) SENTENCE_DELAY = 1150;
      else SENTENCE_DELAY = baseWaitTime + charCount * timePerChar;
    }

    const backContainer = ELS.back;
    let newArrows = [];

    if (backContainer) {
      let arrowLeft = backContainer.querySelector(".sentence-nav.left");
      let arrowRight = backContainer.querySelector(".sentence-nav.right");

      if (!arrowLeft) {
        arrowLeft = document.createElement("div");
        arrowLeft.className = "sentence-nav left";
        backContainer.appendChild(arrowLeft);
      }

      if (!arrowRight) {
        arrowRight = document.createElement("div");
        arrowRight.className = "sentence-nav right";
        backContainer.appendChild(arrowRight);
      }

      newArrows = [arrowLeft, arrowRight];
    } else {
      return;
    }

    // Sentence Group
    const sentenceContainer = ELS.formattedSentence;
    if (
      sentenceContainer &&
      !sentenceContainer.getAttribute("data-split-done")
    ) {
      const groupWrappers = Array.from(
        sentenceContainer.querySelectorAll(".group"),
      ).filter((el) => el.textContent.trim().length > 0);

      if (groupWrappers.length > 0) {
        const parts = groupWrappers.map((el) => el.outerHTML);
        sentenceContainer.innerHTML = "";
        parts.forEach((partHTML) => {
          const div = document.createElement("div");
          div.classList.add("split-sentence");
          div.innerHTML = partHTML;
          div.style.display = "none";
          sentenceContainer.appendChild(div);
        });
        sentenceContainer.setAttribute("data-split-done", "true");
      }
    }

    // Sentence Eng Group
    const engContainer = ELS.sentenceEng;
    if (engContainer && !engContainer.getAttribute("data-split-done")) {
      const allSpans = Array.from(engContainer.querySelectorAll("span"));
      const groupWrappers = allSpans.filter((el) => {
        return el.className.split(/\s+/).some((c) => /^group\d*$/.test(c));
      });

      if (groupWrappers.length > 0) {
        engContainer.innerHTML = "";

        groupWrappers.forEach((el) => {
          const div = document.createElement("div");
          div.classList.add("split-sentence-eng");
          div.innerHTML = el.outerHTML;
          div.style.display = "none";

          const match = el.className.match(/group(\d+)/);
          if (match) {
            div.setAttribute("data-target-index", parseInt(match[1], 10) - 1);
          }

          engContainer.appendChild(div);
        });
        engContainer.setAttribute("data-split-done", "true");
      }
    }

    // Misc Info Group
    const miscInfoContainer = ELS.miscInfo;

    if (
      miscInfoContainer &&
      !miscInfoContainer.getAttribute("data-split-done")
    ) {
      const allSpans = Array.from(miscInfoContainer.querySelectorAll("span"));
      const groupWrappers = allSpans.filter((el) => {
        return el.className.split(/\s+/).some((c) => /^group\d*$/.test(c));
      });

      if (groupWrappers.length > 0) {
        miscInfoContainer.innerHTML = "";

        groupWrappers.forEach((el) => {
          const div = document.createElement("div");
          div.classList.add("split-misc-info");
          div.innerHTML = el.outerHTML;
          div.style.display = "none";

          const match = el.className.match(/group(\d+)/);
          if (match) {
            div.setAttribute("data-target-index", parseInt(match[1], 10) - 1);
          }

          miscInfoContainer.appendChild(div);
        });
        miscInfoContainer.setAttribute("data-split-done", "true");
      }
    }

    const sentenceParts =
      ELS.formattedSentence?.querySelectorAll(".split-sentence") || [];
    const engParts =
      ELS.sentenceEng?.querySelectorAll(".split-sentence-eng") || [];
    const miscInfoParts =
      ELS.miscInfo?.querySelectorAll(".split-misc-info") || [];

    let totalSlides = 1;
    if (audioParts.length > 0) {
      totalSlides = audioParts.length;
    }

    // Picture Group — build scene-to-image mapping from group classes
    const pictureContainer = ELS.pictureContainer;
    var sceneToImageIndex = null; // null = no group classes, use original behavior
    if (
      pictureContainer &&
      !pictureContainer.getAttribute("data-picture-mapped")
    ) {
      const allChildren = Array.from(pictureContainer.children);
      const groupWrappers = allChildren.filter((el) => {
        return (
          el.className &&
          el.className.split(/\s+/).some((c) => /^group\d*$/.test(c))
        );
      });

      if (groupWrappers.length > 0) {
        // 1) Build mapping BEFORE unwrapping: scene index → image src
        var sceneToSrc = {};
        groupWrappers.forEach((wrapper) => {
          var cls = wrapper.className.match(/group(\d+)/);
          if (cls) {
            var sceneIdx = parseInt(cls[1], 10) - 1;
            var img = wrapper.querySelector("img");
            if (img) sceneToSrc[sceneIdx] = img.getAttribute("src");
          }
        });

        // 2) Unwrap: move imgs out of group spans into container directly
        var insertRef = pictureContainer.querySelector(
          ".nav-arrow, .toggle-image-visibility",
        );
        groupWrappers.forEach((wrapper) => {
          var imgs = Array.from(wrapper.querySelectorAll("img"));
          imgs.forEach((img) => {
            pictureContainer.insertBefore(img, insertRef);
          });
          wrapper.remove();
        });

        // 3) Build final mapping: scene index → image DOM index
        var allImgs = Array.from(pictureContainer.querySelectorAll("img"));
        sceneToImageIndex = {};
        for (var sceneIdx in sceneToSrc) {
          var src = sceneToSrc[sceneIdx];
          var imgIdx = allImgs.findIndex(
            (img) => img.getAttribute("src") === src,
          );
          if (imgIdx !== -1) sceneToImageIndex[sceneIdx] = imgIdx;
        }

        pictureContainer.setAttribute("data-picture-mapped", "true");
      }
    }

    let currentIndex = 0;

    function playActiveAudio() {
      if (senrenConfig.muteSentenceAudio === "true") return;
      if (audioParts.length === 0) return;

      document.querySelectorAll("audio").forEach((a) => {
        try {
          a.pause();
          a.currentTime = 0;
        } catch (e) {}
      });

      let audioToPlay = null;
      if (audioParts.length === 1) {
        audioToPlay = audioParts[0];
      } else if (audioParts[currentIndex]) {
        audioToPlay = audioParts[currentIndex];
      }

      if (audioToPlay) {
        audioToPlay.click();
      }
    }

    let replayTimeout;

    const handleSceneShortcuts = (e) => {
      if (
        document.activeElement &&
        ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)
      )
        return;
      if (document.querySelector(".notes-legend-overlay.active")) return;
      if (
        typeof lightbox !== "undefined" &&
        lightbox.classList.contains("active")
      )
        return;

      const cssVal = senrenConfig.sceneReplayShortcutKey;

      const replayConfig = parseKeyConfig(cssVal) || {
        key: "w",
        ctrl: false,
        alt: false,
        shift: false,
        meta: false,
      };

      if (isKeyMatch(e, replayConfig)) {
        e.preventDefault();
        e.stopPropagation();

        if (replayTimeout) clearTimeout(replayTimeout);
        document.querySelectorAll("audio").forEach((a) => {
          try {
            a.pause();
            a.currentTime = 0;
          } catch (e) {}
        });

        const wordAudioBtn = ELS.wordAudioBtn;
        if (wordAudioBtn) {
          wordAudioBtn.click();
        }

        const replayLoadOffset = 200;
        const delay = wordAudioBtn ? SENTENCE_DELAY + replayLoadOffset : 0;

        replayTimeout = setTimeout(() => {
          updateDisplay(true);
        }, delay);
      }

      if (e.ctrlKey) {
        if (e.key === "j") {
          e.preventDefault();
          e.stopPropagation();
          currentIndex--;
          if (currentIndex < 0) currentIndex = totalSlides - 1;
          updateDisplay(true);
        } else if (e.key === "k") {
          e.preventDefault();
          e.stopPropagation();
          currentIndex++;
          if (currentIndex >= totalSlides) currentIndex = 0;
          updateDisplay(true);
        }
      }
    };

    window.currentSceneKeyHandler = handleSceneShortcuts;
    document.addEventListener("keydown", handleSceneShortcuts, {signal:window.senrenCardController?.signal});

    function updateDisplay(shouldPlayAudio = false) {
      const pictureContainer = ELS.pictureContainer;
      if (pictureContainer) {
        // Show the image mapped to current scene (if group classes were used)
        if (sceneToImageIndex !== null) {
          var allImgs = Array.from(pictureContainer.querySelectorAll("img"));
          if (allImgs.length > 0) {
            // Determine which image to show for this scene
            var targetImgIdx = sceneToImageIndex[currentIndex];
            if (targetImgIdx === undefined) {
              // No group assigned for this scene → show first image
              targetImgIdx = 0;
            }

            if (
              allImgs[targetImgIdx] &&
              allImgs[targetImgIdx].classList.contains(
                "senren-filtered-image",
              )
            ) {
              targetImgIdx = allImgs.findIndex(
                (img) => !img.classList.contains("senren-filtered-image"),
              );
            }
            allImgs.forEach((img, i) => {
              const shouldShow =
                i === targetImgIdx &&
                !img.classList.contains("senren-filtered-image");
              img.style.setProperty(
                "display",
                shouldShow ? "block" : "none",
                "important",
              );
            });
          }
        } else {
          // Original behavior: index-based, fallback to first image
          const pictureParts = Array.from(pictureContainer.children).filter(
            (el) => {
              if (el.tagName === "BR") return false;
              if (el.classList.contains("nav-arrow")) return false;
              if (el.classList.contains("toggle-image-visibility"))
                return false;
              if (
                el.tagName === "IMG" &&
                el.classList.contains("senren-filtered-image")
              ) {
                return false;
              }
              if (el.querySelector("img.senren-filtered-image")) return false;
              return true;
            },
          );

          if (pictureParts.length > 0) {
            // If current scene index exceeds available images, show first image
            const targetIndex =
              currentIndex < pictureParts.length ? currentIndex : 0;
            pictureParts.forEach((part, i) => {
              const shouldShow = i === targetIndex;
              part.style.setProperty(
                "display",
                shouldShow ? "block" : "none",
                "important",
              );
            });
          }
        }
      }

      if (sentenceParts.length > 0) {
        sentenceParts.forEach((part, i) => {
          const shouldShow = sentenceParts.length === 1 || i === currentIndex;
          part.style.display = shouldShow ? "block" : "none";
        });
      }

      const mainMiscContainer = ELS.miscInfo;
      if (miscInfoParts.length > 0) {
        let isAnyChildVisible = false;

        miscInfoParts.forEach((part, i) => {
          let shouldShow = false;

          if (part.hasAttribute("data-target-index")) {
            const targetIndex = parseInt(
              part.getAttribute("data-target-index"),
              10,
            );
            shouldShow = targetIndex === currentIndex;
          } else {
            if (miscInfoParts.length === 1) {
              shouldShow = currentIndex === 0;
            } else {
              shouldShow = i === currentIndex;
            }
          }

          if (shouldShow) {
            part.style.setProperty("display", "flex", "important");
            isAnyChildVisible = true;
          } else {
            part.style.setProperty("display", "none", "important");
          }
        });

        if (mainMiscContainer) {
          const displayValue = isAnyChildVisible ? "flex" : "none";
          mainMiscContainer.style.setProperty(
            "display",
            displayValue,
            "important",
          );
        }
      } else if (mainMiscContainer) {
        if (currentIndex === 0) {
          mainMiscContainer.style.setProperty("display", "flex", "important");
        } else {
          mainMiscContainer.style.setProperty("display", "none", "important");
        }
      }

      const mainEngContainer = ELS.sentenceEng;
      if (engParts.length > 0) {
        engParts.forEach((part, i) => {
          let shouldShow = false;

          if (part.hasAttribute("data-target-index")) {
            const targetIndex = parseInt(
              part.getAttribute("data-target-index"),
              10,
            );
            shouldShow = targetIndex === currentIndex;
          } else {
            if (engParts.length === 1) {
              shouldShow = currentIndex === 0;
            } else {
              shouldShow = i === currentIndex;
            }
          }

          part.style.display = shouldShow ? "flex" : "none";
        });

        if (mainEngContainer) mainEngContainer.style.display = "flex";
      } else if (mainEngContainer) {
        mainEngContainer.style.display = currentIndex === 0 ? "flex" : "none";
      }

      if (audioParts.length > 0) {
        audioParts.forEach((btn, i) => {
          const shouldShow = audioParts.length === 1 || i === currentIndex;
          if (shouldShow) {
            btn.style.setProperty("display", "inline-block", "important");
          } else {
            btn.style.setProperty("display", "none", "important");
          }
        });
      }

      if (shouldPlayAudio) {
        playActiveAudio();
      }
    }

    newArrows.forEach((arrow) => {
      if (arrow.dataset.hasSceneListener) return;
      arrow.dataset.hasSceneListener = "true";

      arrow.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        const direction = arrow.classList.contains("left") ? -1 : 1;
        currentIndex += direction;

        if (currentIndex >= totalSlides) {
          currentIndex = 0;
        } else if (currentIndex < 0) {
          currentIndex = totalSlides - 1;
        }

        updateDisplay(true);
      });
    });

    window.senrenRefreshScenes = () => updateDisplay(false);
    updateDisplay(false);

    // Do not synthesize sentence-audio playback when the back side loads.
    // Anki's own replay/autoplay policy should behave the same for single- and
    // multi-scene cards. Navigation and the replay shortcut still call
    // updateDisplay(true), which intentionally plays the selected scene.
  }

  // Toggle Image
  function enableImageToggle() {
    const hideBtn = ELS.pictureContainer?.querySelector(".hide-btn");
    const showBtn = document.querySelector(".header .show-btn");
    const backWrapper = ELS.back;

    if (!hideBtn || !showBtn || !backWrapper) return;

    const savedState = localStorage.getItem("senrenImageHidden");

    if (savedState === "true") {
      backWrapper.classList.add("image-removed");
      showBtn.style.setProperty("display", "flex", "important");
    } else {
      backWrapper.classList.remove("image-removed");
      showBtn.style.setProperty("display", "none", "important");
    }

    const toggle = () => {
      backWrapper.classList.toggle("image-removed");
      const isHidden = backWrapper.classList.contains("image-removed");

      localStorage.setItem("senrenImageHidden", isHidden ? "true" : "false");

      if (isHidden) {
        showBtn.style.setProperty("display", "flex", "important");
      } else {
        showBtn.style.setProperty("display", "none", "important");
      }

      dynamicCardHeight();
    };

    hideBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggle();
    });

    showBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      toggle();
    });
  }

  // Adjusts the height of the card to match the picture in Backdrop Layout (BG Card mode)
  function dynamicCardHeight() {
    const back = ELS.back, pictures = ELS.pictureContainer;
    if (!back || !pictures) return;
    const active = senrenConfig.enableBackdropLayout === "1" &&
      senrenConfig.backdropDynamicHeight === "1" && senrenConfig.backdropStyle === "0";
    if (!active) {
      back._senrenHeightObserver?.disconnect();
      back._senrenHeightObserver = null;
      back._senrenHeightSchedule = null;
      back.style.removeProperty("min-height");
      return;
    }
    if (back._senrenHeightSchedule) { back._senrenHeightSchedule(); return; }
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!back.isConnected) return;
        const img = pictures.querySelector("img:not(.senren-filtered-image)");
        const height = img?.offsetHeight || 0;
        if (back.classList.contains("image-removed") || !height) {
          back.style.removeProperty("min-height");
          return;
        }
        const style = getComputedStyle(back);
        const target = Math.max(0, height - (parseFloat(style.paddingTop) || 0) -
          (parseFloat(style.paddingBottom) || 0)) + "px";
        if (back.style.minHeight !== target) back.style.setProperty("min-height", target, "important");
      });
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(pictures);
    back._senrenHeightObserver = observer;
    back._senrenHeightSchedule = schedule;
    window.senrenCardController?.signal.addEventListener("abort", () => {
      observer.disconnect(); cancelAnimationFrame(frame);
    }, {once:true});
    schedule();
  }

  (function () {
    window.senrenUpdateConfig = function (runLogic = false) {
      // Regex Cache
      window.REGEX = {
        MORA: /[きしちにひみりぎじぢびぴゔ][ゃゅょ]|[うくすつぬふむゆるぐずづぶゔ][ぁぃぅぇぉ]|[てで][ぃ]|[とど][ぅ]|[キシチニヒミリギジヂビピヴ][ャュョ]|[ウクスツヌフムユルグズヅブプヴ][ァィゥェォ]|[テデ][ィ]|[トド][ぅ]|[クグ][ヮ]|[フ][ォ]|[っッ]|ー|[んン]|[\u3041-\u3096\u30A1-\u4DBF\u3005\u3007]|[\u3041-\u3096\u30A1-\u30F6\u30FD\u30FE]|\S/g,
        KANJI: /[\u4E00-\u9FFF\u3400-\u4DBF\u3005\u3007]/,
        KANA_MODIFIERS: /[\s\u3099\u309A\u309B\u309C]/g,
        NARROW_VOWELS:
          /[いきしちにひみりぎじぢびぴイキシチニヒミリギジヂビピうくすつぬふむるぐずづぶぷウクスツヌフムルグズヅブプ]/g,
        DIGITS: /\d+/g,
        RUBY_RT: /<ruby>([^<]+?)<rt>(.*?)<\/rt><\/ruby>/g,
        HIGHLIGHT: /<(?:span class="highlight"|b)>(.*?)<\/(?:span|b)>/g,
        KANA_ONLY: /^[ぁ-ゖァ-ヺ゙゚ー\s]+$/,
        COMBINING_MARK: /([ぁ-ゖァ-ヺ])[\u3099\u309A]/g,
        SMALL_KANA: /[ぁぃぅぇぉゃゅょゎァィゥェォャゅョヮ]/g,
      };

      // NSFW Cache
      const tagsAttr = document.querySelector(".back")?.getAttribute("data-tags") || "";
      window.IS_NSFW = tagsAttr.toLowerCase().includes("nsfw");

      // DOM Cache
      window.ELS = {
        back: document.querySelector(".back"),
        word: document.getElementById("word"),
        sentence: document.getElementById("sentence"),
        formattedSentence: document.getElementById("formattedSentence"),
        sentenceEng: document.getElementById("sentenceEng"),
        glossary: document.getElementById("glossary"),
        definition: document.getElementById("definition"),
        selectionText: document.getElementById("selectionText"),
        miscInfo: document.querySelector(".misc-info"),
        pictureContainer: document.querySelector(".picture-container"),
        tagsContainer: document.querySelector(".tags-container"),
        audioContainer: document.querySelector(".sentenceaudio"),
        position: document.getElementById("position"),
        wordAudioBtn: document.querySelector(
          ".audio .soundLink, .audio .replaybutton, .audio .replay-button",
        ),
      };

      const style = getComputedStyle(document.documentElement);
      const getVar = (prop) =>
        style.getPropertyValue(prop).trim().toLowerCase();

      // Notes
      senrenConfig.notesDefaultExpanded = getVar("--notes-default-expanded");

      // Translation
      senrenConfig.translationDefaultExpanded = getVar(
        "--translation-default-expanded",
      );

      // Collect Glossary Images
      senrenConfig.collectGlossaryImages = getVar("--collect-glossary-images");
      senrenConfig.collectGlossaryImagesMax = getVar(
        "--collect-glossary-images-max",
      );
      senrenConfig.collectGlossaryImagesMinDim = getVar(
        "--collect-glossary-images-min-dim",
      );
      senrenConfig.collectGlossaryImagesMinArea = getVar(
        "--collect-glossary-images-min-area",
      );

      // Backdrop Layout
      senrenConfig.enableBackdropLayout = getVar("--enable-backdrop-layout");
      senrenConfig.backdropStyle = getVar("--backdrop-style");
      senrenConfig.backdropDynamicHeight = getVar("--backdrop-dynamic-height");

      // Misc Info
      senrenConfig.miscInfoDefaultExpanded = getVar(
        "--misc-info-default-expanded",
      );
      senrenConfig.miscInfoVisibility = getVar("--misc-info-visibility");
      if (window.ELS.miscInfo) {
        window.ELS.miscInfo.classList.toggle(
          "senren-misc-info-hidden",
          senrenConfig.miscInfoVisibility === "0",
        );
      }

      // Audio
      senrenConfig.muteNsfwAudio = getVar("--mute-nsfw-audio");
      senrenConfig.muteSentenceAudio = getVar("--mute-sentence-audio");
      senrenConfig.blurNsfwPicture = getVar("--blur-nsfw-picture");

      // Kanji
      senrenConfig.enableKanjiHover = getVar("--enable-kanji-hover");
      senrenConfig.kanjiHoverAutoQuote = getVar("--kanji-hover-auto-quote");
      senrenConfig.noDuplicateKana = getVar("--no-duplicate-kana");

      // Dictionary
      senrenConfig.dictionaryCollapse = getVar("--dictionary-collapse");
      senrenConfig.dictionaryMaxHeight = getVar("--dictionary-max-height");

      // Keys
      senrenConfig.sceneReplayShortcutKey = getVar(
        "--scene-replay-shortcut-key",
      );
      senrenConfig.toggleSettingsKey = getVar("--toggle-settings-key");
      senrenConfig.togglePictureLightboxGridKey = getVar(
        "--toggle-picture-lightbox-grid-key",
      );
      senrenConfig.togglePictureLightboxKey = getVar(
        "--toggle-picture-lightbox-key",
      );
      senrenConfig.toggleCustomDarkModeKey = getVar(
        "--toggle-custom-dark-mode-key",
      );
      senrenConfig.toggleImageKey = getVar("--toggle-image-key");

      // Pitch
      senrenConfig.pitchStyle = getVar("--pitch-style");
      senrenConfig.pitchColors = getVar("--pitch-colors");
      senrenConfig.sentencePitchHighlight = getVar(
        "--sentence-pitch-highlight",
      );

      if (!runLogic) return;

      if (typeof window.dynamicCardHeight === "function") {
        window.dynamicCardHeight();
      }
      if (typeof window.alternativePitchStyle === "function") {
        window.alternativePitchStyle();
      }
    };

    // Initial load
    window.senrenUpdateConfig();

    window.IS_MOBILE =
      document.documentElement.classList.contains("mobile") ||
      document.body.classList.contains("mobile");
    window.SENREN_COMPACT_VIEW =
      window.IS_MOBILE ||
      (window.matchMedia &&
        window.matchMedia("(max-width: 1050px)").matches);
    window.SENREN_HAS_HOVER = !(
      window.matchMedia && window.matchMedia("(hover: none)").matches
    );

    const delayedFunctions =
      window.requestIdleCallback ||
      function (cb) {
        return setTimeout(cb, 200);
      };

    // Initializes immediate functions
    function init() {
      darkMode();
      nsfw();
      muteSentence();
      splitTags();
      highlightFurigana();
      renderBackReading();
      dynamicWordSize();
      alternativePitchStyle();
      prepareDictionarySources();
      dictionaryTitle();
      prefilterTinyImages();
      consolidateYomitanGlossaryEntries();
      toggleDefinition();
      enableInteractions();
      enableSceneSwitching();
      enableImageToggle();

      if (!window.SENREN_COMPACT_VIEW) {
        collectGlossaryImages();
        dynamicCardHeight();
      }
      setupSettingsButton();
    }

    window.senrenLoadSettingsMenu = function (callback) {
      if (window.senrenBuildMenu) {
        if (callback) callback();
        return;
      }
      const script = document.createElement("script");
      script.src = "_senren_settings_v4.7.0.js?v=20261008.1";
      script.onload = () => {
        setTimeout(callback, 100);
      };
      document.body.appendChild(script);
    };

    function setupSettingsButton() {
      const btn = document.querySelector(".toggle-settings-btn");
      if (btn && !btn.dataset.hasLazyLoadListener) {
        btn.dataset.hasLazyLoadListener = "true";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const modal = document.getElementById("senren-settings-modal");
          if (modal) {
            modal.classList.add("active");
            if (window.renderPresetUI) window.renderPresetUI();
          } else {
            window.senrenLoadSettingsMenu(() => {
              const m = document.getElementById("senren-settings-modal");
              if (m) {
                m.classList.add("active");
                if (window.renderPresetUI) window.renderPresetUI();
              }
            });
          }
        });
      }
    }

    // initializes deferred functions
    function initDeferred() {
      const signal = window.senrenCardController?.signal;
      delayedFunctions(() => {
        if (signal?.aborted) return;
        collectGlossaryImages(true);

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setTimeout(() => {
              if (signal?.aborted) return;
              // External deferred functions
              if (window.senrenInitDeferred) {
                window.senrenInitDeferred();
              } else {
                const script = document.createElement("script");
                script.src = "_senren_deferred_v4.7.0.js?v=20261109.2";
                document.body.appendChild(script);
              }

              // Kanji hover
              if (!window.SENREN_COMPACT_VIEW && window.SENREN_HAS_HOVER) {
                if (window.senrenInitKanjiHover) {
                  window.senrenInitKanjiHover();
                } else {
                  const script = document.createElement("script");
                  script.src =
                    "_senren_kanji_hover_v4.7.0.js?v=20261109.2";
                  document.body.appendChild(script);
                }
              }
            }, 50);
          });
        });
      });
    }

    try {
      init();
    } finally {
      const back = ELS.back;
      if (window.SenrenTheme?.revealCard) window.SenrenTheme.revealCard(back);
      else back?.removeAttribute("data-senren-layout-pending");
    }
    initDeferred();
  })();
