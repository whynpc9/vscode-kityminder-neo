"use strict";
(() => {
  // src/shared/km.ts
  var KM_VERSION = "1.4.50";
  function isPlainObject(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }
  function normalizeKmNode(value, path = "root") {
    if (!isPlainObject(value)) {
      throw new Error(`${path} must be an object.`);
    }
    if (!isPlainObject(value.data)) {
      throw new Error(`${path}.data must be an object.`);
    }
    const childrenSource = value.children;
    if (childrenSource !== void 0 && !Array.isArray(childrenSource)) {
      throw new Error(`${path}.children must be an array when present.`);
    }
    return {
      data: { ...value.data },
      children: (childrenSource ?? []).map(
        (child, index) => normalizeKmNode(child, `${path}.children[${index}]`)
      )
    };
  }
  function normalizeKmDocument(value) {
    if (!isPlainObject(value)) {
      throw new Error("KM document must be a JSON object.");
    }
    if (!("root" in value)) {
      throw new Error("KM document is missing the root field.");
    }
    return {
      root: normalizeKmNode(value.root),
      template: typeof value.template === "string" ? value.template : value.template === void 0 ? void 0 : String(value.template),
      theme: value.theme === null || value.theme === void 0 ? value.theme ?? void 0 : typeof value.theme === "string" ? value.theme : String(value.theme),
      version: typeof value.version === "string" ? value.version : value.version === void 0 ? void 0 : String(value.version)
    };
  }
  function parseKmDocument(text) {
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid JSON: ${message}`);
    }
    return normalizeKmDocument(parsed);
  }
  function createDefaultKmDocument(title = "Central Topic") {
    return {
      root: {
        data: {
          text: title
        },
        children: []
      },
      template: "default",
      theme: null,
      version: KM_VERSION
    };
  }
  function stringifyKmDocument(document2) {
    const normalized = normalizeKmDocument(document2);
    return `${JSON.stringify(
      {
        root: normalized.root,
        template: normalized.template ?? "default",
        theme: normalized.theme ?? null,
        version: normalized.version ?? KM_VERSION
      },
      null,
      2
    )}
`;
  }

  // src/webview/index.ts
  var KityMinderWebviewApp = class {
    vscode = acquireVsCodeApi();
    filename = this.getElement("filename");
    warningBanner = this.getElement("warning-banner");
    container = this.getElement("mindmap-container");
    errorOverlay = this.getElement("error-overlay");
    errorMessage = this.getElement("error-message");
    titleInput = this.getElement("node-title");
    noteInput = this.getElement("node-note");
    selectionMeta = this.getElement("selection-meta");
    templateButtons = Array.from(
      document.querySelectorAll(".template-btn")
    );
    minder;
    pendingSync;
    suppressSync = false;
    updatingForm = false;
    hasValidDocument = false;
    currentSerialized = "";
    positionMode = false;
    positionDrag;
    bootstrap() {
      this.createMinder();
      this.bindUi();
      window.addEventListener("message", (event) => {
        this.handleHostMessage(event.data);
      });
      window.addEventListener("mouseup", () => this.finishPositionDrag());
      this.vscode.postMessage({ type: "ready" });
    }
    createMinder() {
      const { kityminder } = window;
      const minder = new kityminder.Minder({
        enableAnimation: true,
        enableKeyReceiver: false
      });
      minder.renderTo(this.container);
      minder.importJson(createDefaultKmDocument());
      minder.select(minder.getRoot(), true);
      minder.execCommand("camera");
      minder.on("contentchange", () => {
        if (!this.suppressSync && this.hasValidDocument) {
          this.scheduleSync();
        }
      });
      minder.on("selectionchange interactchange layoutallfinish", () => {
        this.refreshSelectionState();
      });
      minder.on("position.mousedown", (event) => this.handlePositionMouseDown(event));
      minder.on("position.mousemove", (event) => this.handlePositionMouseMove(event));
      minder.on("position.mouseup", () => this.finishPositionDrag());
      this.minder = minder;
    }
    bindUi() {
      this.getElement("btn-add-child").addEventListener("click", () => {
        this.executeCommand("AppendChildNode", "\u65B0\u8282\u70B9");
      });
      this.getElement("btn-add-sibling").addEventListener("click", () => {
        this.executeCommand("AppendSiblingNode", "\u65B0\u8282\u70B9");
      });
      this.getElement("btn-add-parent").addEventListener("click", () => {
        this.executeCommand("AppendParentNode", "\u65B0\u8282\u70B9");
      });
      this.getElement("btn-delete").addEventListener("click", () => {
        this.executeCommand("RemoveNode");
      });
      this.getElement("btn-expand").addEventListener("click", () => {
        this.executeCommand("expand");
      });
      this.getElement("btn-collapse").addEventListener("click", () => {
        this.executeCommand("collapse");
      });
      this.getElement("btn-expand-all").addEventListener("click", () => {
        this.executeCommand("expandtolevel", 9999);
      });
      this.getElement("btn-level-1").addEventListener("click", () => {
        this.executeCommand("expandtolevel", 1);
      });
      this.getElement("btn-level-2").addEventListener("click", () => {
        this.executeCommand("expandtolevel", 2);
      });
      this.getElement("btn-level-3").addEventListener("click", () => {
        this.executeCommand("expandtolevel", 3);
      });
      this.getElement("btn-level-all").addEventListener("click", () => {
        this.executeCommand("expandtolevel", 9999);
      });
      this.getElement("btn-reset-layout").addEventListener("click", () => {
        const selected = this.minder.getSelectedNode();
        this.minder.select(this.minder.getRoot(), true);
        this.executeCommand("resetlayout");
        if (selected) {
          this.minder.select(selected, true);
        }
      });
      this.getElement("btn-center").addEventListener("click", () => {
        this.executeCommand("camera");
      });
      this.getElement("btn-open-source").addEventListener("click", () => {
        this.openSourceJson();
      });
      this.getElement("btn-open-source-error").addEventListener("click", () => {
        this.openSourceJson();
      });
      this.getElement("btn-position-mode").addEventListener("click", () => {
        this.setPositionMode(!this.positionMode);
      });
      for (const button of this.templateButtons) {
        button.addEventListener("click", () => {
          const template = button.dataset.template;
          if (template) {
            this.executeCommand("template", template);
          }
        });
      }
      let titleTimer;
      this.titleInput.addEventListener("input", () => {
        if (this.updatingForm) {
          return;
        }
        window.clearTimeout(titleTimer);
        titleTimer = window.setTimeout(() => {
          const node = this.minder.getSelectedNode();
          if (!node) {
            return;
          }
          this.minder.execCommand("text", this.titleInput.value);
        }, 120);
      });
      let noteTimer;
      this.noteInput.addEventListener("input", () => {
        if (this.updatingForm) {
          return;
        }
        window.clearTimeout(noteTimer);
        noteTimer = window.setTimeout(() => {
          const note = this.noteInput.value.trim();
          this.minder.execCommand("note", note.length > 0 ? this.noteInput.value : null);
        }, 120);
      });
    }
    handleHostMessage(message) {
      switch (message.type) {
        case "init":
          this.filename.textContent = message.filename;
          this.loadDocument(message.text);
          break;
        case "documentReplaced":
          this.loadDocument(message.text);
          break;
        case "error":
          this.showError(message.message);
          break;
        case "importWarnings":
          this.showWarnings(message.warnings);
          break;
      }
    }
    loadDocument(text) {
      try {
        const parsed = parseKmDocument(text);
        this.hasValidDocument = true;
        this.hideError();
        this.suppressSync = true;
        this.minder.importJson(parsed);
        this.minder.select(this.minder.getRoot(), true);
        this.minder.execCommand("camera");
        this.currentSerialized = stringifyKmDocument(this.minder.exportJson());
        this.suppressSync = false;
        this.refreshSelectionState();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.hasValidDocument = false;
        this.showError(message);
      }
    }
    showWarnings(warnings) {
      if (warnings.length === 0) {
        this.warningBanner.classList.add("hidden");
        this.warningBanner.textContent = "";
        return;
      }
      this.warningBanner.classList.remove("hidden");
      this.warningBanner.innerHTML = `
      <div class="banner-title">\u5BFC\u5165\u63D0\u793A</div>
      <ul class="warning-list">${warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>
    `;
    }
    showError(message) {
      this.errorMessage.textContent = message;
      this.errorOverlay.classList.remove("hidden");
    }
    hideError() {
      this.errorOverlay.classList.add("hidden");
      this.errorMessage.textContent = "";
    }
    refreshSelectionState() {
      const node = this.minder.getSelectedNode();
      const hasNode = Boolean(node);
      this.updatingForm = true;
      this.titleInput.disabled = !hasNode;
      this.noteInput.disabled = !hasNode;
      this.titleInput.value = hasNode ? node.getData("text") ?? node.getText?.() ?? "" : "";
      this.noteInput.value = hasNode ? node.getData("note") ?? "" : "";
      this.updatingForm = false;
      if (hasNode) {
        const childCount = Array.isArray(node.children) ? node.children.length : 0;
        const isRoot = typeof node.isRoot === "function" ? node.isRoot() : false;
        this.selectionMeta.textContent = `${isRoot ? "\u6839\u8282\u70B9" : `\u5C42\u7EA7 ${node.getLevel?.() ?? "-"}`} / ${childCount} \u4E2A\u5B50\u8282\u70B9${this.positionMode ? " / \u4F4D\u7F6E\u6A21\u5F0F" : ""}`;
      } else {
        this.selectionMeta.textContent = "\u672A\u9009\u62E9\u8282\u70B9";
      }
      this.updateTemplateButtons();
      this.updatePositionButton();
    }
    updateTemplateButtons() {
      const currentTemplate = this.minder.queryCommandValue("template") ?? "default";
      for (const button of this.templateButtons) {
        button.classList.toggle("active", button.dataset.template === currentTemplate);
      }
    }
    updatePositionButton() {
      const button = this.getElement("btn-position-mode");
      button.classList.toggle("active", this.positionMode);
      button.textContent = this.positionMode ? "\u9000\u51FA\u4F4D\u7F6E\u6A21\u5F0F" : "\u4F4D\u7F6E\u6A21\u5F0F";
    }
    openSourceJson() {
      this.vscode.postMessage({ type: "revealSourceJson" });
    }
    executeCommand(command, value) {
      if (!this.hasValidDocument) {
        return;
      }
      if (value === void 0) {
        this.minder.execCommand(command);
      } else {
        this.minder.execCommand(command, value);
      }
      this.refreshSelectionState();
    }
    setPositionMode(enabled) {
      this.positionMode = enabled;
      this.finishPositionDrag();
      this.minder.setStatus(enabled ? "position" : "normal", true);
      this.updatePositionButton();
      this.refreshSelectionState();
    }
    handlePositionMouseDown(event) {
      if (!this.positionMode) {
        return;
      }
      const node = this.minder.getSelectedNode();
      const target = event.getTargetNode();
      if (!node || !target || node !== target || node.isRoot()) {
        return;
      }
      this.positionDrag = {
        node,
        startMouse: event.getPosition(),
        startOffset: node.getLayoutOffset()
      };
      event.preventDefault?.();
      event.stopPropagation?.();
    }
    handlePositionMouseMove(event) {
      if (!this.positionDrag) {
        return;
      }
      const delta = window.kity.Vector.fromPoints(
        this.positionDrag.startMouse,
        event.getPosition()
      );
      const nextOffset = this.positionDrag.startOffset.offset(delta);
      this.positionDrag.node.setLayoutOffset(nextOffset);
      this.minder.applyLayoutResult(this.positionDrag.node, 0);
    }
    finishPositionDrag() {
      if (!this.positionDrag) {
        return;
      }
      this.positionDrag = void 0;
      this.minder.fire("contentchange");
    }
    scheduleSync() {
      window.clearTimeout(this.pendingSync);
      this.pendingSync = window.setTimeout(() => {
        const serialized = stringifyKmDocument(this.minder.exportJson());
        if (serialized === this.currentSerialized) {
          return;
        }
        this.currentSerialized = serialized;
        this.vscode.postMessage({
          type: "applyEdit",
          text: serialized
        });
      }, 120);
    }
    getElement(id) {
      const element = document.getElementById(id);
      if (!element) {
        throw new Error(`Missing required element: ${id}`);
      }
      return element;
    }
  };
  function escapeHtml(value) {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  new KityMinderWebviewApp().bootstrap();
})();
//# sourceMappingURL=webview.js.map
