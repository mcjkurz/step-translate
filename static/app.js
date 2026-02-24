// Step Translate - Frontend Application

import * as pdfjsLib from "https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.min.mjs";
import * as pdfjsViewer from "https://unpkg.com/pdfjs-dist@4.0.379/web/pdf_viewer.mjs";

// ============================================================================
// DOM Elements
// ============================================================================

const els = {
  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  documentViewport: document.getElementById("documentViewport"),
  pdfViewerContainer: document.getElementById("pdfViewerContainer"),
  passagesContainer: document.getElementById("passagesContainer"),
  documentInfo: document.getElementById("documentInfo"),
  selectionBadge: document.getElementById("selectionBadge"),
  toggleViewBtn: document.getElementById("toggleViewBtn"),
  resetDocumentBtn: document.getElementById("resetDocumentBtn"),
  pdfControls: document.querySelector(".pdf-controls"),
  zoomIn: document.getElementById("zoomIn"),
  zoomOut: document.getElementById("zoomOut"),
  prevPage: document.getElementById("prevPage"),
  nextPage: document.getElementById("nextPage"),
  pageIndicator: document.getElementById("pageIndicator"),
  translationEditor: document.getElementById("translationEditor"),
  translateBtn: document.getElementById("translateBtn"),
  selectPassageBtn: document.getElementById("selectPassageBtn"),
  uploadTranslationBtn: document.getElementById("uploadTranslationBtn"),
  downloadTranslationBtn: document.getElementById("downloadTranslationBtn"),
  downloadDropdown: document.getElementById("downloadDropdown"),
  downloadMenu: document.getElementById("downloadMenu"),
  translationFileInput: document.getElementById("translationFileInput"),
  clearBtn: document.getElementById("clearBtn"),
  targetLang: document.getElementById("targetLang"),
  customLang: document.getElementById("customLang"),
  resizer: document.getElementById("resizer"),
  floatingTranslateBtn: document.getElementById("floatingTranslateBtn"),
  leftPanel: document.getElementById("leftPanel"),
  rightPanel: document.getElementById("rightPanel"),
  settingsBtn: document.getElementById("settingsBtn"),
  settingsModal: document.getElementById("settingsModal"),
  closeSettingsBtn: document.getElementById("closeSettingsBtn"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  apiKey: document.getElementById("apiKey"),
  apiEndpoint: document.getElementById("apiEndpoint"),
  modelName: document.getElementById("modelName"),
  contextPassages: document.getElementById("contextPassages"),
  contextCharacters: document.getElementById("contextCharacters"),
  temperature: document.getElementById("temperature"),
  systemPrompt: document.getElementById("systemPrompt"),
  userPrompt: document.getElementById("userPrompt"),
  resetAllSettingsBtn: document.getElementById("resetAllSettingsBtn"),
  fontIncrease: document.getElementById("fontIncrease"),
  fontDecrease: document.getElementById("fontDecrease"),
  docFontIncrease: document.getElementById("docFontIncrease"),
  docFontDecrease: document.getElementById("docFontDecrease"),
  // Adapt modal elements
  floatingAdaptBtn: document.getElementById("floatingAdaptBtn"),
  adaptModal: document.getElementById("adaptModal"),
  adaptBtn: document.getElementById("adaptBtn"),
  adaptInstructions: document.getElementById("adaptInstructions"),
  adaptModel: document.getElementById("adaptModel"),
  adaptAcceptBtn: document.getElementById("adaptAcceptBtn"),
  adaptCloseBtn: document.getElementById("adaptCloseBtn"),
  adaptOriginalText: document.getElementById("adaptOriginalText"),
  adaptResultText: document.getElementById("adaptResultText"),
  adaptSystemPrompt: document.getElementById("adaptSystemPrompt"),
  adaptUserPrompt: document.getElementById("adaptUserPrompt"),
};

// ============================================================================
// State
// ============================================================================

const state = {
  fileType: null, // 'pdf', 'txt', 'docx'
  filename: null, // Original filename
  passages: [],
  selectedPassageIds: [], // Array of selected passage IDs (for multi-select)
  selectedText: "", // Currently selected text (from passage click or manual selection)
  translationHistory: [], // { original, translation, passageId }
  isTranslating: false,
  settings: {
    apiKey: "",
    apiEndpoint: "",
    model: "",
    contextPassages: 3,
    contextCharacters: 0,
    temperature: null,  // Loaded from server prompts.json
    systemPrompt: "",
    userPrompt: "",
    adaptSystemPrompt: "",
    adaptUserPrompt: "",
  },
  serverSettings: null, // Loaded from window.SERVER_DEFAULTS (injected by server)
  // PDF view state
  pdfUrl: null, // URL to the uploaded PDF for viewing
  viewMode: "text", // 'text' or 'pdf' - current view mode for PDFs
  // PDF.js state
  pdfDoc: null,
  pdfViewer: null,
  eventBus: null,
  linkService: null,
  // Caret position tracking
  savedCaretPosition: null, // { node, offset } - saved when focus leaves editor
  // Adapt feature state
  isAdapting: false,
  adaptSelectedText: "", // Text selected in translation editor for adaptation
  adaptSelectionRange: null, // Saved range for replacing text after Accept
};

// Storage keys
const STORAGE_KEYS = {
  settings: "step-translate-settings",
  panelWidth: "step-translate-panel-width",
  editorFontSize: "step-translate-editor-font-size",
  docFontSize: "step-translate-doc-font-size",
};

// Font size config
const FONT_SIZE = {
  min: 10,
  max: 28,
  default: 14,
  docDefault: 16,
  step: 2,
};

// ============================================================================
// PDF.js Setup
// ============================================================================

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://unpkg.com/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs";

function initPdfViewer() {
  // Create viewer structure with inner container (PDF.js requires absolute positioning)
  els.pdfViewerContainer.innerHTML = "";
  
  const innerContainer = document.createElement("div");
  innerContainer.className = "pdf-viewer-inner";
  
  const viewerDiv = document.createElement("div");
  viewerDiv.className = "pdfViewer";
  
  innerContainer.appendChild(viewerDiv);
  els.pdfViewerContainer.appendChild(innerContainer);
  
  state.eventBus = new pdfjsViewer.EventBus();
  state.linkService = new pdfjsViewer.PDFLinkService({ eventBus: state.eventBus });
  
  state.pdfViewer = new pdfjsViewer.PDFViewer({
    container: innerContainer,  // Use the inner absolutely-positioned container
    viewer: viewerDiv,
    eventBus: state.eventBus,
    linkService: state.linkService,
    textLayerMode: 2, // Enable text selection
  });
  
  state.linkService.setViewer(state.pdfViewer);
  
  state.eventBus.on("pagesinit", () => {
    requestAnimationFrame(() => {
      state.pdfViewer.currentScaleValue = "page-width";
      updatePageIndicator();
    });
  });
  
  state.eventBus.on("pagechanging", updatePageIndicator);
  
  // Refit on resize
  window.addEventListener("resize", debounce(() => {
    if (state.pdfViewer && state.pdfDoc) {
      state.pdfViewer.currentScaleValue = "page-width";
    }
  }, 150));
  
  // Handle copy for PDF text layer (keyboard shortcut)
  innerContainer.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "c") {
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        navigator.clipboard.writeText(selection.toString()).catch(err => {
          console.error("Failed to copy:", err);
        });
      }
    }
  });
  
  // Make inner container focusable to receive keyboard events
  innerContainer.setAttribute("tabindex", "0");
  innerContainer.style.outline = "none";
}

function updatePageIndicator() {
  if (!state.pdfViewer || !state.pdfDoc) return;
  const current = state.pdfViewer.currentPageNumber || 0;
  const total = state.pdfDoc.numPages || 0;
  els.pageIndicator.textContent = `${current} / ${total}`;
}

async function loadPdf(url) {
  initPdfViewer();
  
  try {
    // Load PDF if not already preloaded
    if (!state.pdfDoc) {
      const loadingTask = pdfjsLib.getDocument(url);
      state.pdfDoc = await loadingTask.promise;
    }
    
    state.pdfViewer.setDocument(state.pdfDoc);
    state.linkService.setDocument(state.pdfDoc, null);
    updatePageIndicator();
  } catch (e) {
    console.error("Error loading PDF:", e);
    setStatus("Error loading PDF: " + (e.message || e), true);
  }
}

// Preload PDF document in background (just the document, not the viewer)
async function preloadPdf(url) {
  try {
    const loadingTask = pdfjsLib.getDocument(url);
    state.pdfDoc = await loadingTask.promise;
    console.log("PDF preloaded:", state.pdfDoc.numPages, "pages");
  } catch (e) {
    console.error("Error preloading PDF:", e);
    state.pdfDoc = null; // Clear so loadPdf will retry
  }
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

// ============================================================================
// Settings Management
// ============================================================================

async function loadSettings() {
  // Server defaults are injected into HTML at {{SERVER_DEFAULTS}}
  state.serverSettings = window.SERVER_DEFAULTS || {};
  
  // Load user overrides from localStorage (if any)
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.settings);
    if (saved) {
      const parsed = JSON.parse(saved);
      state.settings = { ...state.settings, ...parsed };
    }
  } catch (e) {
    console.error("Failed to load settings from localStorage:", e);
  }
  
  // Update form fields
  updateSettingsForm();
}

function updateSettingsForm() {
  const server = state.serverSettings || {};
  
  // API Key: show masked server key if available and no local override
  if (state.settings.apiKey) {
    els.apiKey.value = state.settings.apiKey;
    els.apiKey.placeholder = "Enter API key...";
  } else if (server.hasApiKey) {
    els.apiKey.value = "";
    els.apiKey.placeholder = `Using server key: ${server.apiKeyMasked}`;
  } else {
    els.apiKey.value = "";
    els.apiKey.placeholder = "sk-...";
  }
  
  // Endpoint: show server default as placeholder
  els.apiEndpoint.value = state.settings.apiEndpoint || "";
  els.apiEndpoint.placeholder = server.apiEndpoint || "https://api.openai.com/v1";
  
  // Model: show server default as placeholder
  els.modelName.value = state.settings.model || "";
  els.modelName.placeholder = server.model || "gpt-4o-mini";
  
  // Context settings (frontend-only, defaults to 3 passages, 0 characters)
  els.contextPassages.value = state.settings.contextPassages ?? 3;
  els.contextCharacters.value = state.settings.contextCharacters ?? 0;
  
  // Temperature (default from server prompts config)
  const defaultTemp = server.temperature ?? 0.1;
  els.temperature.value = state.settings.temperature ?? defaultTemp;
  
  // Prompts: show user value if set, otherwise show server default as actual value
  els.systemPrompt.value = state.settings.systemPrompt || server.systemPrompt || "";
  els.userPrompt.value = state.settings.userPrompt || server.userPrompt || "";
  
  // Adapt prompts
  els.adaptSystemPrompt.value = state.settings.adaptSystemPrompt || server.adaptSystemPrompt || "";
  els.adaptUserPrompt.value = state.settings.adaptUserPrompt || server.adaptUserPrompt || "";
}

function saveSettings() {
  const server = state.serverSettings || {};
  const defaultTemp = server.temperature ?? 0.1;
  
  state.settings = {
    apiKey: els.apiKey.value.trim(),
    apiEndpoint: els.apiEndpoint.value.trim(),
    model: els.modelName.value.trim(),
    contextPassages: parseInt(els.contextPassages.value) || 0,
    contextCharacters: parseInt(els.contextCharacters.value) || 0,
    temperature: parseFloat(els.temperature.value) ?? defaultTemp,
    systemPrompt: els.systemPrompt.value.trim(),
    userPrompt: els.userPrompt.value.trim(),
    adaptSystemPrompt: els.adaptSystemPrompt.value.trim(),
    adaptUserPrompt: els.adaptUserPrompt.value.trim(),
  };
  
  try {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    setStatus("Settings saved");
    closeSettingsModal();
  } catch (e) {
    console.error("Failed to save settings:", e);
    setStatus("Failed to save settings", true);
  }
}

function resetAllSettings() {
  // Clear localStorage
  localStorage.removeItem(STORAGE_KEYS.settings);
  
  // Reset state to defaults
  state.settings = {
    apiKey: "",
    apiEndpoint: "",
    model: "",
    contextPassages: 3,
    contextCharacters: 0,
    temperature: null,
    systemPrompt: "",
    userPrompt: "",
    adaptSystemPrompt: "",
    adaptUserPrompt: "",
  };
  
  // Refresh form with server defaults
  updateSettingsForm();
  showToast("Settings reset to server defaults");
}

function openSettingsModal() {
  updateSettingsForm();
  els.settingsModal.style.display = "flex";
}

function closeSettingsModal() {
  els.settingsModal.style.display = "none";
}

function hasApiKey() {
  // Has local key or server has key configured
  return !!(state.settings.apiKey || (state.serverSettings && state.serverSettings.hasApiKey));
}

// ============================================================================
// Status & UI Helpers
// ============================================================================

// Toast notification system
function showToast(msg, isError = false, duration = 3000) {
  if (!msg) return;
  
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${isError ? "toast-error" : "toast-info"}`;
  toast.textContent = msg;
  
  container.appendChild(toast);
  
  // Trigger animation
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });
  
  // Auto-remove
  setTimeout(() => {
    toast.classList.remove("visible");
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// For backward compatibility, setStatus now shows toasts for errors and important messages
function setStatus(msg, isError = false) {
  // Skip non-actionable messages
  if (!msg || msg === "Uploading...") return;
  
  // Show toast for errors or success messages
  if (isError || msg.includes("Downloaded") || msg.includes("Loaded") || msg.includes("saved")) {
    showToast(msg, isError);
  }
}

function setTranslating(isTranslating) {
  state.isTranslating = isTranslating;
  els.translateBtn.disabled = isTranslating;
  els.floatingTranslateBtn.disabled = isTranslating;
  
  if (isTranslating) {
    showInlineLoader();
    hideFloatingTranslateBtn();
  } else {
    hideInlineLoader();
  }
}

// Show loading spinner at the insertion point in the editor
function showInlineLoader() {
  hideInlineLoader(); // Remove any existing loader
  
  const editor = els.translationEditor;
  const loader = document.createElement("span");
  loader.id = "inlineLoader";
  loader.className = "inline-loader";
  loader.innerHTML = `<span class="loader-spinner"></span>`;
  
  // Insert at caret marker position if exists, else at end
  const marker = document.getElementById("caretMarker");
  if (marker) {
    marker.parentNode.insertBefore(loader, marker);
    // Hide the caret marker while loading (but keep it in DOM for position reference)
    marker.style.display = "none";
  } else {
    editor.appendChild(loader);
  }
  
  // Scroll loader into view (only if element has offsetParent, i.e., is visible in layout)
  if (loader.offsetParent !== null) {
    loader.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function hideInlineLoader() {
  const loader = document.getElementById("inlineLoader");
  if (loader) {
    loader.remove();
  }
  // Restore caret marker visibility if it exists
  const marker = document.getElementById("caretMarker");
  if (marker) {
    marker.style.display = "";
  }
}

// ============================================================================
// Document Upload
// ============================================================================

async function uploadDocument(file) {
  if (!file) {
    setStatus("No file selected.", true);
    return;
  }
  
  const validExtensions = [".pdf", ".txt", ".text", ".docx"];
  const ext = file.name.toLowerCase().slice(file.name.lastIndexOf("."));
  
  if (!validExtensions.includes(ext)) {
    setStatus("Please select a PDF, TXT, or DOCX file.", true);
    return;
  }
  
  setStatus("Uploading...");
  
  try {
    const formData = new FormData();
    formData.append("file", file);
    
    const resp = await fetch("/api/upload", {
      method: "POST",
      body: formData,
    });
    
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "Upload failed");
    }
    
    const data = await resp.json();
    
    // Store state
    state.fileType = data.file_type;
    state.filename = data.filename;
    state.passages = data.passages;
    state.selectedPassageIds = [];
    state.translationHistory = [];
    state.pdfUrl = data.pdf_url || null;
    state.viewMode = "text"; // Always start in text mode
    
    // Hide drop zone
    els.dropZone.classList.add("hidden");
    
    // Reset selected text
    state.selectedText = "";
    els.selectPassageBtn.style.display = "none";
    
    // Show text passages view (default for all file types)
    showTextView();
    
    // Show toggle button only for PDFs and preload PDF in background
    if (state.fileType === "pdf" && state.pdfUrl) {
      els.toggleViewBtn.style.display = "inline-block";
      els.toggleViewBtn.textContent = "Show Original";
      // Preload PDF in background for instant switching
      preloadPdf(state.pdfUrl);
    } else {
      els.toggleViewBtn.style.display = "none";
    }
    
    els.documentInfo.textContent = data.filename;
    els.translationEditor.innerHTML = "";
    els.resetDocumentBtn.style.display = "inline-flex";
    
  } catch (e) {
    setStatus(e.message || "Upload failed", true);
  }
}

function resetDocument() {
  // Clear state
  state.fileType = null;
  state.filename = null;
  state.passages = [];
  state.selectedPassageIds = [];
  state.selectedText = "";
  state.pdfUrl = null;
  state.viewMode = "text";
  state.pdfDoc = null;
  
  // Reset UI
  els.dropZone.classList.remove("hidden");
  els.documentViewport.classList.remove("has-pdf");
  els.pdfViewerContainer.style.display = "none";
  els.pdfViewerContainer.innerHTML = "";
  els.passagesContainer.classList.remove("visible");
  els.passagesContainer.innerHTML = "";
  els.pdfControls.style.display = "none";
  els.documentInfo.textContent = "";
  els.selectionBadge.style.display = "none";
  els.toggleViewBtn.style.display = "none";
  els.resetDocumentBtn.style.display = "none";
  els.selectPassageBtn.style.display = "none";
  els.fileInput.value = "";
  hideFloatingTranslateBtn();
}

// ============================================================================
// View Toggle (PDF Original vs Text Passages)
// ============================================================================

function showTextView() {
  state.viewMode = "text";
  els.documentViewport.classList.remove("has-pdf");
  els.pdfViewerContainer.style.display = "none";
  els.passagesContainer.classList.add("visible");
  els.pdfControls.style.display = "none";
  
  // Clear any PDF selection state when switching back
  state.selectedText = "";
  state.selectedPassageIds = [];
  els.selectionBadge.style.display = "none";
  hideFloatingTranslateBtn();
  
  renderPassages();
  
  if (state.fileType === "pdf") {
    els.toggleViewBtn.textContent = "Show Original";
  }
}

async function showPdfView() {
  if (!state.pdfUrl) return;
  
  state.viewMode = "pdf";
  els.documentViewport.classList.add("has-pdf");
  els.pdfViewerContainer.style.display = "block";
  els.passagesContainer.classList.remove("visible");
  els.pdfControls.style.display = "flex";
  els.toggleViewBtn.textContent = "Back to Text";
  
  // Clear text view selection state when switching to PDF
  state.selectedText = "";
  state.selectedPassageIds = [];
  els.selectionBadge.style.display = "none";
  hideFloatingTranslateBtn();
  
  // Always call loadPdf to initialize viewer and set document
  await loadPdf(state.pdfUrl);
}

function toggleDocumentView() {
  if (state.viewMode === "text") {
    showPdfView();
  } else {
    showTextView();
  }
}

// ============================================================================
// Passage Rendering (for TXT/DOCX)
// ============================================================================

function renderPassages(container = els.passagesContainer) {
  container.innerHTML = "";
  
  let currentPage = null;
  
  for (const passage of state.passages) {
    // Add page indicator if this is a new page
    if (passage.page !== null && passage.page !== currentPage) {
      currentPage = passage.page;
      const pageDiv = document.createElement("div");
      pageDiv.className = "passage-page";
      pageDiv.textContent = `Page ${currentPage}`;
      container.appendChild(pageDiv);
    }
    
    const div = document.createElement("div");
    div.className = `passage passage-${passage.style || 'paragraph'}`;
    div.dataset.id = passage.id;
    div.textContent = passage.text;
    
    // Click to select entire passage (with multi-select support)
    div.addEventListener("click", (e) => {
      // Check if user is selecting text (drag selection)
      const selection = window.getSelection();
      if (selection && selection.toString().trim()) {
        // User selected partial text - use that instead
        state.selectedText = selection.toString().trim();
        state.selectedPassageIds = []; // Clear passage selection - this is partial text
        highlightPassages(container);
        updateSelectionBadge(0, state.selectedText.length); // Show char count only
        showFloatingTranslateBtn();
        return;
      }
      // Click without selection - select/deselect entire passage
      // Cmd (Mac) or Ctrl (Windows) for multi-select
      const multiSelect = e.metaKey || e.ctrlKey;
      selectPassage(passage.id, container, multiSelect);
      
      // Show or hide floating button based on selection state
      if (state.selectedPassageIds.length > 0) {
        showFloatingTranslateBtn();
      } else {
        hideFloatingTranslateBtn();
      }
    });
    
    container.appendChild(div);
  }
}

function selectPassage(passageId, container = els.passagesContainer, multiSelect = false) {
  const passage = state.passages.find(p => p.id === passageId);
  if (!passage) return;
  
  const isAlreadySelected = state.selectedPassageIds.includes(passageId);
  
  if (multiSelect) {
    // Toggle selection in multi-select mode
    if (isAlreadySelected) {
      state.selectedPassageIds = state.selectedPassageIds.filter(id => id !== passageId);
    } else {
      state.selectedPassageIds.push(passageId);
    }
  } else {
    // Single click behavior:
    // - If clicking the only selected passage, deselect it
    // - Otherwise, select only this passage
    if (isAlreadySelected && state.selectedPassageIds.length === 1) {
      state.selectedPassageIds = [];
    } else {
      state.selectedPassageIds = [passageId];
    }
  }
  
  highlightPassages(container);
  updateSelectedText();
}

function updateSelectedText() {
  // Combine selected passages in document order
  if (state.selectedPassageIds.length === 0) {
    state.selectedText = "";
    updateSelectionBadge(0, 0);
    return;
  }
  
  // Get passages in their original order
  const selectedPassages = state.passages.filter(p => 
    state.selectedPassageIds.includes(p.id)
  );
  
  // Combine text with double newline separator
  state.selectedText = selectedPassages.map(p => p.text).join("\n\n");
  
  const count = state.selectedPassageIds.length;
  const charCount = state.selectedText.length;
  updateSelectionBadge(count, charCount);
}

function updateSelectionBadge(count, chars) {
  if (count === 0) {
    els.selectionBadge.style.display = "none";
    return;
  }
  
  els.selectionBadge.style.display = "inline-block";
  if (count === 1) {
    els.selectionBadge.textContent = `${chars} chars`;
  } else {
    els.selectionBadge.textContent = `${count} passages · ${chars} chars`;
  }
}

function highlightPassages(container = els.passagesContainer) {
  // Remove all previous selection highlighting
  container.querySelectorAll(".passage.selected").forEach(el => {
    el.classList.remove("selected");
  });
  
  // Highlight all selected passages
  state.selectedPassageIds.forEach(id => {
    const passageEl = container.querySelector(`[data-id="${id}"]`);
    if (passageEl) {
      passageEl.classList.add("selected");
    }
  });
}

// ============================================================================
// Floating Translate Button
// ============================================================================

function showFloatingTranslateBtn() {
  // Show if we have selected passages OR selected text
  if (state.selectedPassageIds.length === 0 && !state.selectedText) {
    hideFloatingTranslateBtn();
    return;
  }
  
  els.floatingTranslateBtn.style.display = "flex";
}

function hideFloatingTranslateBtn() {
  els.floatingTranslateBtn.style.display = "none";
}

// ============================================================================
// Translation
// ============================================================================

function isEditorEffectivelyEmpty() {
  // Check if editor has no meaningful content (ignoring caret marker)
  const text = getEditorTextContent();
  return !text.trim();
}

function getEditorTextContent() {
  // Get plain text from editor, normalizing browser DOM quirks
  const editor = els.translationEditor;
  
  // Clone to manipulate without affecting original
  const clone = editor.cloneNode(true);
  
  // Remove caret marker from clone if present
  const markerClone = clone.querySelector("#caretMarker");
  if (markerClone) {
    markerClone.remove();
  }
  
  // Replace <br> with newlines
  clone.querySelectorAll("br").forEach(br => {
    br.replaceWith("\n");
  });
  
  // Replace block elements (div, p) with newlines
  clone.querySelectorAll("div, p").forEach(block => {
    if (block.previousSibling) {
      block.insertAdjacentText("beforebegin", "\n");
    }
  });
  
  return clone.textContent || "";
}

function getTextBeforeCaret() {
  const editor = els.translationEditor;
  const marker = document.getElementById("caretMarker");
  
  if (marker) {
    // Use marker position - get text from start to marker
    const range = document.createRange();
    range.setStart(editor, 0);
    range.setEndBefore(marker);
    
    // Create a temporary container to extract and normalize the text
    const fragment = range.cloneContents();
    const temp = document.createElement("div");
    temp.appendChild(fragment);
    
    // Replace <br> with newlines
    temp.querySelectorAll("br").forEach(br => {
      br.replaceWith("\n");
    });
    
    // Replace block elements with newlines
    temp.querySelectorAll("div, p").forEach(block => {
      if (block.previousSibling) {
        block.insertAdjacentText("beforebegin", "\n");
      }
    });
    
    return temp.textContent || "";
  }
  
  // No marker = caret is at end, return full editor text
  return getEditorTextContent();
}

function getTextAfterCaret() {
  const editor = els.translationEditor;
  const marker = document.getElementById("caretMarker");
  
  if (marker) {
    // Get all text after the marker
    const range = document.createRange();
    range.setStartAfter(marker);
    range.setEnd(editor, editor.childNodes.length);
    
    // Create a temporary container to extract and normalize the text
    const fragment = range.cloneContents();
    const temp = document.createElement("div");
    temp.appendChild(fragment);
    
    // Replace <br> with newlines
    temp.querySelectorAll("br").forEach(br => {
      br.replaceWith("\n");
    });
    
    // Replace block elements with newlines
    temp.querySelectorAll("div, p").forEach(block => {
      if (block.previousSibling) {
        block.insertAdjacentText("beforebegin", "\n");
      }
    });
    
    return temp.textContent || "";
  }
  
  // No marker = caret is at end, nothing after
  return "";
}

function getPriorTranslationsForContext() {
  const maxPassages = state.settings.contextPassages || 0;
  const maxChars = state.settings.contextCharacters || 0;
  
  // Both limits are 0 = no context
  if (maxPassages === 0 && maxChars === 0) {
    return [];
  }
  
  // Get text before the insertion point (caret position)
  const textBeforeCaret = getTextBeforeCaret();
  
  
  if (!textBeforeCaret.trim()) {
    return [];
  }
  
  // Split into paragraphs - handle various newline patterns
  // Split on 2+ newlines (with possible whitespace between)
  const paragraphs = textBeforeCaret
    .split(/\n\s*\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
  
  
  if (paragraphs.length === 0) {
    return [];
  }
  
  // Take the last N paragraphs (closest to caret), respecting limits
  const result = [];
  let totalChars = 0;
  
  // Work backwards from the paragraph closest to caret
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    // Check passage limit (if set)
    if (maxPassages > 0 && result.length >= maxPassages) {
      break;
    }
    
    const para = paragraphs[i];
    const paraChars = para.length;
    
    // Check character limit (if set)
    if (maxChars > 0 && totalChars + paraChars > maxChars && result.length > 0) {
      break;
    }
    
    // Add to beginning to maintain order (oldest first)
    result.unshift({ translation: para });
    totalChars += paraChars;
    
    // If character limit is set and we've hit it, stop
    if (maxChars > 0 && totalChars >= maxChars) {
      break;
    }
  }
  
  return result;
}

function getTargetLanguage() {
  const selectValue = els.targetLang.value;
  if (selectValue === "Other") {
    return els.customLang.value.trim() || "English";
  }
  return selectValue;
}

function getSelectedText() {
  // First check if we have a stored selected text from passage click
  if (state.selectedText) {
    return state.selectedText;
  }
  
  // Then check for manual text selection in the document
  const selection = window.getSelection();
  if (selection && selection.toString().trim()) {
    const range = selection.getRangeAt(0);
    if (els.documentViewport.contains(range.commonAncestorContainer)) {
      return selection.toString().trim();
    }
  }
  
  return "";
}

// Find which passage best matches the given text (for PDF click-to-select)
function findMatchingPassage(text) {
  if (!text || !state.passages.length) return null;
  
  const normalizedText = text.replace(/\s+/g, ' ').trim().toLowerCase();
  
  // Try to find a passage that contains this text or is contained by it
  for (const passage of state.passages) {
    const normalizedPassage = passage.text.replace(/\s+/g, ' ').trim().toLowerCase();
    
    // Check if the selected text is part of this passage or vice versa
    if (normalizedPassage.includes(normalizedText) || normalizedText.includes(normalizedPassage)) {
      return passage;
    }
  }
  
  // Fuzzy match: find passage with most word overlap
  const textWords = new Set(normalizedText.split(/\s+/).filter(w => w.length > 3));
  let bestMatch = null;
  let bestScore = 0;
  
  for (const passage of state.passages) {
    const passageWords = passage.text.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    let score = 0;
    for (const word of passageWords) {
      if (textWords.has(word)) score++;
    }
    if (score > bestScore && score >= 3) {
      bestScore = score;
      bestMatch = passage;
    }
  }
  
  return bestMatch;
}

// ============================================================================
// Caret Position Tracking
// ============================================================================

function saveCaretPosition(showMarker = false) {
  const editor = els.translationEditor;
  const selection = window.getSelection();
  
  // Always remove existing marker first
  hideCaretMarker();
  
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (editor.contains(range.startContainer) || editor === range.startContainer) {
      state.savedCaretPosition = {
        node: range.startContainer,
        offset: range.startOffset,
      };
      if (showMarker) showCaretMarker();
      return;
    }
  }
  
  // If no valid position, save at end
  if (editor.lastChild) {
    state.savedCaretPosition = {
      node: editor.lastChild,
      offset: editor.lastChild.textContent ? editor.lastChild.textContent.length : 0,
    };
  } else {
    state.savedCaretPosition = {
      node: editor,
      offset: 0,
    };
  }
  if (showMarker) showCaretMarker();
}

function isCaretOnEmptyLine(marker) {
  // Check if the caret marker is at the START of an empty line
  // Cases:
  // 1. Editor is completely empty
  // 2. Caret is after a newline and before another newline (or end with nothing on current line)
  
  const prev = marker.previousSibling;
  const next = marker.nextSibling;
  
  // Get text content before caret (from immediate previous sibling)
  let prevText = "";
  if (prev && prev.nodeType === Node.TEXT_NODE) {
    prevText = prev.textContent;
  }
  
  // Get text content after caret (from immediate next sibling)  
  let nextText = "";
  if (next && next.nodeType === Node.TEXT_NODE) {
    nextText = next.textContent;
  }
  
  // Case 1: Editor is empty (no prev, no next, or both are empty)
  const editorIsEmpty = (!prev && !next) || 
    ((!prev || prevText === "") && (!next || nextText === ""));
  if (editorIsEmpty) return true;
  
  // Case 2: Previous ends with newline AND current line is empty
  // Current line is empty if: next starts with newline, or next is empty/null
  const prevEndsWithNewline = prevText.endsWith("\n") || prev?.nodeName === "BR";
  const currentLineIsEmpty = !next || 
    nextText === "" || 
    nextText.startsWith("\n") || 
    next?.nodeName === "BR";
  
  // But we need to distinguish "after newline at end" from "after text at end"
  // If prev ends with \n and next is empty, we're on an empty line
  // If prev ends with text (no \n) and next is empty, we're at end of content (not empty line)
  
  return prevEndsWithNewline && currentLineIsEmpty;
}

function isCaretAtEndOfLine(marker) {
  // Check if the caret is at the end of the CURRENT LINE
  // This means: nothing on this line after the caret (but there might be content on next lines)
  // We want to show the trail effect if the rest of the current line is empty
  
  const next = marker.nextSibling;
  
  // No next sibling = at end of all content = end of line
  if (!next) return true;
  
  // Check immediate next sibling
  if (next.nodeType === Node.TEXT_NODE) {
    const text = next.textContent;
    // If next text is empty or starts with newline, we're at end of line
    if (!text || text === "" || text.startsWith("\n")) {
      return true;
    }
    // If there's non-newline content immediately after, we're not at end of line
    return false;
  }
  
  // If next is a BR, we're at end of line
  if (next.nodeName === "BR") {
    return true;
  }
  
  // For other elements, assume we're not at end of line
  return false;
}

function applyCaretTrailEffect(marker) {
  // Use requestAnimationFrame to ensure marker is rendered before measuring
  requestAnimationFrame(() => {
    // Verify marker still exists (might have been removed)
    if (!marker.parentNode) return;
    
    const editor = els.translationEditor;
    const markerRect = marker.getBoundingClientRect();
    const editorRect = editor.getBoundingClientRect();
    
    // Get the editor's padding-right
    const editorStyle = window.getComputedStyle(editor);
    const paddingRight = parseFloat(editorStyle.paddingRight) || 0;
    
    // Calculate remaining width (editor right edge - padding - caret position)
    const remainingWidth = editorRect.right - paddingRight - markerRect.right;
    
    if (remainingWidth > 10) { // Only show if there's meaningful space
      marker.classList.add("end-of-content");
      marker.style.setProperty("--caret-trail-width", `${remainingWidth}px`);
    }
  });
}

function showCaretMarker() {
  // Remove existing marker
  hideCaretMarker();
  
  const editor = els.translationEditor;
  if (!state.savedCaretPosition) return;
  
  // Create marker element
  const marker = document.createElement("span");
  marker.id = "caretMarker";
  marker.className = "caret-marker";
  marker.textContent = "\u200B"; // Zero-width space
  
  try {
    const { node, offset } = state.savedCaretPosition;
    
    if (node.nodeType === Node.TEXT_NODE) {
      // Split text node and insert marker
      const textContent = node.textContent;
      const before = textContent.slice(0, offset);
      const after = textContent.slice(offset);
      
      const beforeNode = document.createTextNode(before);
      const afterNode = document.createTextNode(after);
      
      const parent = node.parentNode;
      parent.insertBefore(beforeNode, node);
      parent.insertBefore(marker, node);
      parent.insertBefore(afterNode, node);
      parent.removeChild(node);
      
      // Update saved position to reference the marker
      state.savedCaretPosition = { marker: true };
    } else if (editor.contains(node) || editor === node) {
      // Insert at child offset
      if (node.childNodes[offset]) {
        node.insertBefore(marker, node.childNodes[offset]);
      } else {
        node.appendChild(marker);
      }
      state.savedCaretPosition = { marker: true };
    } else {
      editor.appendChild(marker);
      state.savedCaretPosition = { marker: true };
    }
    
    // Check if caret is on an empty line and add class accordingly
    if (isCaretOnEmptyLine(marker)) {
      marker.classList.add("empty-line");
    } else if (isCaretAtEndOfLine(marker)) {
      // Caret is at end of content but not on empty line - show trail effect
      applyCaretTrailEffect(marker);
    }
  } catch (e) {
    console.error("Failed to show caret marker:", e);
    // Fall back to appending at end
    editor.appendChild(marker);
    state.savedCaretPosition = { marker: true };
    
    // Check empty line for fallback case too
    if (isCaretOnEmptyLine(marker)) {
      marker.classList.add("empty-line");
    } else if (isCaretAtEndOfLine(marker)) {
      applyCaretTrailEffect(marker);
    }
  }
}

function hideCaretMarker() {
  const marker = document.getElementById("caretMarker");
  if (marker) {
    // Merge adjacent text nodes
    const parent = marker.parentNode;
    const prev = marker.previousSibling;
    const next = marker.nextSibling;
    
    marker.remove();
    
    // Normalize to merge text nodes
    if (parent) {
      parent.normalize();
    }
  }
}

function restoreCaretPosition() {
  const editor = els.translationEditor;
  const marker = document.getElementById("caretMarker");
  const selection = window.getSelection();
  
  if (marker) {
    const range = document.createRange();
    range.setStartAfter(marker);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    hideCaretMarker();
    return true;
  }
  
  return false;
}

function insertTranslation(text) {
  const editor = els.translationEditor;
  const selection = window.getSelection();
  const marker = document.getElementById("caretMarker");
  
  // Insert text exactly where the caret is - no automatic newlines
  // User is responsible for positioning and spacing
  
  // First, try to insert at marker position
  if (marker && marker.parentNode) {
    const parent = marker.parentNode;
    const textNode = document.createTextNode(text);
    parent.insertBefore(textNode, marker);
    
    // Remove marker WITHOUT normalizing (to preserve our textNode reference)
    marker.remove();
    
    // Position caret after inserted text
    const range = document.createRange();
    range.setStartAfter(textNode);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    saveCaretPosition(false);
    return;
  }
  
  // Remove orphaned marker if it exists but has no parent
  if (marker) {
    marker.remove();
  }
  
  // Try current selection in editor
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer) || editor === range.commonAncestorContainer) {
      range.deleteContents();
      const textNode = document.createTextNode(text);
      range.insertNode(textNode);
      
      // Position caret after inserted text
      range.setStartAfter(textNode);
      range.setEndAfter(textNode);
      selection.removeAllRanges();
      selection.addRange(range);
      saveCaretPosition(false);
      return;
    }
  }
  
  // Append at end (fallback)
  const textNode = document.createTextNode(text);
  editor.appendChild(textNode);
  
  // Position caret after inserted text
  const range = document.createRange();
  range.setStartAfter(textNode);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  saveCaretPosition(false);
}

async function doTranslate() {
  const text = getSelectedText();
  
  if (!text) {
    setStatus("Select text from the document first.", true);
    return;
  }
  
  if (!hasApiKey()) {
    setStatus("Please configure your API key in Settings or set API_KEY in .env", true);
    openSettingsModal();
    return;
  }
  
  setTranslating(true);
  
  try {
    const priorTranslations = getPriorTranslationsForContext();
    
    // Log context summary to console for debugging
    if (priorTranslations.length > 0) {
      const contextSummary = priorTranslations.map((pt, i) => {
        const t = pt.translation || "";
        const preview = t.length <= 40 
          ? t 
          : `${t.slice(0, 20)}...${t.slice(-20)}`;
        return `  [${i + 1}] "${preview}"`;
      }).join("\n");
      console.log(`[Translate] Context (${priorTranslations.length} entries):\n${contextSummary}`);
    } else {
      console.log("[Translate] Context: (none)");
    }
    
    // Build request with settings (only send non-default values)
    const requestBody = {
      selected_text: text,
      target_language: getTargetLanguage(),
      prior_translations: priorTranslations,
      api_key: state.settings.apiKey || undefined,
      api_endpoint: state.settings.apiEndpoint || undefined,
      model: state.settings.model || undefined,
      temperature: state.settings.temperature ?? undefined,
      system_prompt: state.settings.systemPrompt || undefined,
      user_prompt: state.settings.userPrompt || undefined,
    };
    
    const resp = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "Translation failed");
    }
    
    const data = await resp.json();
    const translation = data.translation.trim();
    
    insertTranslation(translation);
    
    state.translationHistory.push({
      original: text,
      translation: translation,
      passageIds: [...state.selectedPassageIds],
    });
    
  } catch (e) {
    showToast(e.message || "Translation failed", true);
  } finally {
    setTranslating(false);
  }
}

function updateLastTranslation() {
  if (state.translationHistory.length === 0) return;
  
  const editorContent = els.translationEditor.textContent.trim();
  if (editorContent && state.translationHistory.length > 0) {
    const lastEntry = state.translationHistory[state.translationHistory.length - 1];
    const lines = editorContent.split(/\n\n+/);
    if (lines.length > 0) {
      const lastBlock = lines[lines.length - 1].trim();
      if (lastBlock !== lastEntry.translation) {
        lastEntry.translation = lastBlock;
      }
    }
  }
}

function clearTranslation() {
  els.translationEditor.innerHTML = "";
  state.translationHistory = [];
}

// ============================================================================
// Adapt Feature
// ============================================================================

function showFloatingAdaptBtn() {
  const selection = window.getSelection();
  if (!selection || !selection.toString().trim()) {
    hideFloatingAdaptBtn();
    return;
  }
  
  // Only show if selection is within the translation editor
  const range = selection.getRangeAt(0);
  if (!els.translationEditor.contains(range.commonAncestorContainer)) {
    hideFloatingAdaptBtn();
    return;
  }
  
  // Position the button near the selection
  const rect = range.getBoundingClientRect();
  const btn = els.floatingAdaptBtn;
  
  btn.style.position = "fixed";
  btn.style.left = `${rect.left + rect.width / 2}px`;
  btn.style.top = `${rect.top - 36}px`;
  btn.style.transform = "translateX(-50%)";
  btn.style.display = "flex";
}

function hideFloatingAdaptBtn() {
  els.floatingAdaptBtn.style.display = "none";
}

function openAdaptPanel(selectedText) {
  state.adaptSelectedText = selectedText;
  
  // Save the selection range so Accept can replace it later
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    state.adaptSelectionRange = selection.getRangeAt(0).cloneRange();
  }
  
  // Populate the modal
  els.adaptOriginalText.textContent = selectedText;
  els.adaptResultText.textContent = "";
  els.adaptAcceptBtn.style.display = "none";
  
  // Reset button styles
  els.adaptBtn.textContent = "Adapt";
  els.adaptBtn.classList.remove("danger");
  els.adaptBtn.classList.add("primary");
  els.adaptAcceptBtn.classList.remove("success");
  els.adaptAcceptBtn.classList.add("primary");
  
  // Show the modal overlay
  els.adaptModal.style.display = "flex";
  
  // Hide floating button
  hideFloatingAdaptBtn();
}

function closeAdaptPanel() {
  els.adaptModal.style.display = "none";
  state.adaptSelectedText = "";
  state.adaptSelectionRange = null;
  state.isAdapting = false;
  els.adaptOriginalText.textContent = "";
  els.adaptResultText.textContent = "";
  els.adaptAcceptBtn.style.display = "none";
}

function setAdapting(isAdapting) {
  state.isAdapting = isAdapting;
  els.adaptBtn.disabled = isAdapting;
  
  if (isAdapting) {
    els.adaptResultText.innerHTML = '<span class="inline-loader"><span class="loader-spinner"></span></span>';
  }
}

async function doAdapt() {
  const text = state.adaptSelectedText;
  if (!text) {
    showToast("No text selected to adapt.", true);
    return;
  }
  
  if (!hasApiKey()) {
    showToast("Please configure your API key in Settings or set API_KEY in .env", true);
    openSettingsModal();
    return;
  }
  
  setAdapting(true);
  
  try {
    const requestBody = {
      selected_text: text,
      target_language: getTargetLanguage(),
      additional_instructions: els.adaptInstructions.value.trim() || undefined,
      api_key: state.settings.apiKey || undefined,
      api_endpoint: state.settings.apiEndpoint || undefined,
      model: els.adaptModel.value.trim() || state.settings.model || undefined,
      temperature: state.settings.temperature ?? undefined,
      adapt_system_prompt: state.settings.adaptSystemPrompt || undefined,
      adapt_user_prompt: state.settings.adaptUserPrompt || undefined,
    };
    
    const resp = await fetch("/api/adapt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "Adaptation failed");
    }
    
    const data = await resp.json();
    const adaptedText = data.adapted_text.trim();
    
    els.adaptResultText.textContent = adaptedText;
    els.adaptAcceptBtn.style.display = "inline-flex";
    
    // Switch Adapt button to "Try Again" style
    els.adaptBtn.textContent = "Try Again";
    els.adaptBtn.classList.remove("primary");
    els.adaptBtn.classList.add("danger");
    els.adaptAcceptBtn.classList.remove("primary");
    els.adaptAcceptBtn.classList.add("success");
    
  } catch (e) {
    showToast(e.message || "Adaptation failed", true);
    els.adaptResultText.textContent = "";
  } finally {
    setAdapting(false);
  }
}

function acceptAdaptation() {
  const adaptedText = els.adaptResultText.textContent.trim();
  if (!adaptedText) {
    showToast("No adapted text to accept.", true);
    return;
  }
  
  const editor = els.translationEditor;
  
  if (state.adaptSelectionRange) {
    try {
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(state.adaptSelectionRange);
      
      state.adaptSelectionRange.deleteContents();
      const textNode = document.createTextNode(adaptedText);
      state.adaptSelectionRange.insertNode(textNode);
      
      // Position caret after inserted text
      const range = document.createRange();
      range.setStartAfter(textNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      
      editor.normalize();
    } catch (e) {
      console.error("Failed to replace selection:", e);
      showToast("Failed to replace text. Please copy the adapted text manually.", true);
      return;
    }
  } else {
    showToast("Could not locate original selection. Please copy the adapted text manually.", true);
    return;
  }
  
  closeAdaptPanel();
}

// ============================================================================
// Editor Font Size
// ============================================================================

function getEditorFontSize() {
  const saved = localStorage.getItem(STORAGE_KEYS.editorFontSize);
  return saved ? parseInt(saved, 10) : FONT_SIZE.default;
}

function setEditorFontSize(size) {
  const clamped = Math.max(FONT_SIZE.min, Math.min(FONT_SIZE.max, size));
  els.translationEditor.style.fontSize = `${clamped}px`;
  localStorage.setItem(STORAGE_KEYS.editorFontSize, clamped);
}

function increaseEditorFontSize() {
  const current = getEditorFontSize();
  setEditorFontSize(current + FONT_SIZE.step);
}

function decreaseEditorFontSize() {
  const current = getEditorFontSize();
  setEditorFontSize(current - FONT_SIZE.step);
}

// ============================================================================
// Document Font Size
// ============================================================================

function getDocFontSize() {
  const saved = localStorage.getItem(STORAGE_KEYS.docFontSize);
  return saved ? parseInt(saved, 10) : FONT_SIZE.docDefault;
}

function setDocFontSize(size) {
  const clamped = Math.max(FONT_SIZE.min, Math.min(FONT_SIZE.max, size));
  els.passagesContainer.style.fontSize = `${clamped}px`;
  localStorage.setItem(STORAGE_KEYS.docFontSize, clamped);
}

function increaseDocFontSize() {
  setDocFontSize(getDocFontSize() + FONT_SIZE.step);
}

function decreaseDocFontSize() {
  setDocFontSize(getDocFontSize() - FONT_SIZE.step);
}

// ============================================================================
// Translation Upload/Download
// ============================================================================

function uploadTranslation(file) {
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    els.translationEditor.textContent = text;
    state.translationHistory = [];
    setStatus(`Loaded translation from ${file.name}`);
  };
  reader.onerror = () => {
    setStatus("Failed to read file", true);
  };
  reader.readAsText(file);
}

function toggleDownloadMenu() {
  const menu = els.downloadMenu;
  const isVisible = menu.classList.contains("visible");
  
  if (isVisible) {
    hideDownloadMenu();
  } else {
    // Check if there's content to download first
    const text = getPlainTextFromEditor();
    if (!text.trim()) {
      setStatus("Nothing to download", true);
      return;
    }
    
    // Position the menu below the button using fixed positioning
    const btnRect = els.downloadTranslationBtn.getBoundingClientRect();
    menu.style.top = `${btnRect.bottom + 4}px`;
    menu.style.right = `${window.innerWidth - btnRect.right}px`;
    menu.style.bottom = "auto";
    
    menu.classList.add("visible");
  }
}

function hideDownloadMenu() {
  els.downloadMenu.classList.remove("visible");
}

async function downloadTranslation(format = "txt") {
  hideDownloadMenu();
  
  const text = getPlainTextFromEditor();
  if (!text.trim()) {
    setStatus("Nothing to download", true);
    return;
  }
  
  const baseName = state.filename 
    ? state.filename.replace(/\.[^.]+$/, "") + "_translated"
    : "translation";
  
  if (format === "txt") {
    // Direct client-side download for plain text
    const filename = `${baseName}.txt`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    setStatus(`Downloaded as ${filename}`);
  } else {
    // Server-side generation for DOCX and PDF
    try {
      const resp = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text,
          format: format,
          filename: baseName,
        }),
      });
      
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.detail || "Export failed");
      }
      
      const blob = await resp.blob();
      const filename = `${baseName}.${format}`;
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setStatus(`Downloaded as ${filename}`);
    } catch (e) {
      setStatus(e.message || "Export failed", true);
    }
  }
}

// Extract plain text from contenteditable, preserving line breaks
function getPlainTextFromEditor() {
  const editor = els.translationEditor;
  
  // Clone the editor to manipulate without affecting the original
  const clone = editor.cloneNode(true);
  
  // Replace <br> with newlines
  clone.querySelectorAll("br").forEach(br => {
    br.replaceWith("\n");
  });
  
  // Replace block elements (div, p) with newlines
  clone.querySelectorAll("div, p").forEach(block => {
    // Add newline before block content if it's not the first element
    if (block.previousSibling) {
      block.insertAdjacentText("beforebegin", "\n");
    }
  });
  
  // Get the text content
  let text = clone.textContent || "";
  
  // Clean up multiple consecutive newlines (but keep double for paragraphs)
  text = text.replace(/\n{3,}/g, "\n\n");
  
  return text;
}

function setupTranslationDragDrop() {
  const editor = els.translationEditor;
  
  editor.addEventListener("dragover", (e) => {
    e.preventDefault();
    editor.classList.add("drag-over");
  });
  
  editor.addEventListener("dragleave", (e) => {
    e.preventDefault();
    editor.classList.remove("drag-over");
  });
  
  editor.addEventListener("drop", (e) => {
    e.preventDefault();
    editor.classList.remove("drag-over");
    
    const file = e.dataTransfer.files[0];
    if (file && (file.name.endsWith(".txt") || file.name.endsWith(".text"))) {
      uploadTranslation(file);
    } else if (file) {
      setStatus("Only .txt files can be loaded here", true);
    }
  });
}

// ============================================================================
// Drag & Drop
// ============================================================================

function setupDragAndDrop() {
  const dropZone = els.dropZone;
  
  ["dragenter", "dragover", "dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, e => {
      e.preventDefault();
      e.stopPropagation();
    });
  });
  
  ["dragenter", "dragover"].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.add("drag-over");
    });
  });
  
  ["dragleave", "drop"].forEach(eventName => {
    dropZone.addEventListener(eventName, () => {
      dropZone.classList.remove("drag-over");
    });
  });
  
  dropZone.addEventListener("drop", e => {
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadDocument(files[0]);
    }
  });
  
  dropZone.addEventListener("click", () => {
    els.fileInput.click();
  });
}

// ============================================================================
// Resizable Panel
// ============================================================================

function setupResizer() {
  const resizer = els.resizer;
  const leftPanel = els.leftPanel;
  const rightPanel = els.rightPanel;
  
  const savedRatio = localStorage.getItem(STORAGE_KEYS.panelWidth);
  if (savedRatio) {
    const ratio = parseFloat(savedRatio);
    if (ratio > 0 && ratio < 1) {
      leftPanel.style.flex = ratio;
      rightPanel.style.flex = 1 - ratio;
    }
  }
  
  let isResizing = false;
  let startX = 0;
  let startLeftWidth = 0;
  let startRightWidth = 0;
  
  resizer.addEventListener("mousedown", e => {
    isResizing = true;
    startX = e.clientX;
    startLeftWidth = leftPanel.offsetWidth;
    startRightWidth = rightPanel.offsetWidth;
    resizer.classList.add("dragging");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    e.preventDefault();
  });
  
  document.addEventListener("mousemove", e => {
    if (!isResizing) return;
    
    const dx = e.clientX - startX;
    const totalWidth = startLeftWidth + startRightWidth;
    const newLeftWidth = Math.max(300, Math.min(totalWidth - 300, startLeftWidth + dx));
    
    const leftRatio = newLeftWidth / totalWidth;
    leftPanel.style.flex = leftRatio;
    rightPanel.style.flex = 1 - leftRatio;
  });
  
  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove("dragging");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      
      const totalWidth = leftPanel.offsetWidth + rightPanel.offsetWidth;
      const ratio = leftPanel.offsetWidth / totalWidth;
      localStorage.setItem(STORAGE_KEYS.panelWidth, ratio.toString());
    }
  });
}

// ============================================================================
// Custom Language
// ============================================================================

function setupCustomLanguage() {
  els.targetLang.addEventListener("change", () => {
    if (els.targetLang.value === "Other") {
      els.customLang.style.display = "block";
      els.customLang.focus();
    } else {
      els.customLang.style.display = "none";
    }
  });
}

// ============================================================================
// PDF Controls
// ============================================================================

function setupPdfControls() {
  els.zoomIn.addEventListener("click", () => {
    if (state.pdfViewer) {
      state.pdfViewer.currentScale = Math.min(4, state.pdfViewer.currentScale * 1.25);
    }
  });
  
  els.zoomOut.addEventListener("click", () => {
    if (state.pdfViewer) {
      state.pdfViewer.currentScale = Math.max(0.25, state.pdfViewer.currentScale / 1.25);
    }
  });
  
  els.prevPage.addEventListener("click", () => {
    if (state.pdfViewer && state.pdfViewer.currentPageNumber > 1) {
      state.pdfViewer.currentPageNumber -= 1;
    }
  });
  
  els.nextPage.addEventListener("click", () => {
    if (state.pdfViewer && state.pdfDoc && state.pdfViewer.currentPageNumber < state.pdfDoc.numPages) {
      state.pdfViewer.currentPageNumber += 1;
    }
  });
  
}

// ============================================================================
// Initialization
// ============================================================================

async function init() {
  await loadSettings();
  
  // Restore font sizes
  setEditorFontSize(getEditorFontSize());
  setDocFontSize(getDocFontSize());
  
  els.fileInput.addEventListener("change", () => {
    const file = els.fileInput.files?.[0];
    if (file) uploadDocument(file);
  });
  
  setupDragAndDrop();
  setupPdfControls();
  
  // Toggle between PDF original and text view
  els.toggleViewBtn.addEventListener("click", toggleDocumentView);
  
  // Reset document button
  els.resetDocumentBtn.addEventListener("click", resetDocument);
  
  els.translateBtn.addEventListener("click", doTranslate);
  els.floatingTranslateBtn.addEventListener("click", doTranslate);
  els.clearBtn.addEventListener("click", clearTranslation);
  
  // Font size controls (translation editor)
  els.fontIncrease.addEventListener("click", increaseEditorFontSize);
  els.fontDecrease.addEventListener("click", decreaseEditorFontSize);
  
  // Font size controls (document panel)
  els.docFontIncrease.addEventListener("click", increaseDocFontSize);
  els.docFontDecrease.addEventListener("click", decreaseDocFontSize);
  
  // Adapt feature
  // Prevent the floating button from stealing focus (which clears the text selection)
  els.floatingAdaptBtn.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  els.floatingAdaptBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      openAdaptPanel(selection.toString().trim());
    }
  });
  els.adaptBtn.addEventListener("click", doAdapt);
  els.adaptAcceptBtn.addEventListener("click", acceptAdaptation);
  els.adaptCloseBtn.addEventListener("click", closeAdaptPanel);
  
  // Detect text selection in translation editor to show floating Adapt button
  els.translationEditor.addEventListener("mouseup", () => {
    // Small delay to let the selection finalize
    setTimeout(() => {
      const selection = window.getSelection();
      if (selection && selection.toString().trim() && 
          els.translationEditor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
        showFloatingAdaptBtn();
      } else {
        hideFloatingAdaptBtn();
      }
    }, 10);
  });
  
  // Also handle keyboard selection (Shift+Arrow, Ctrl+A, etc.)
  els.translationEditor.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key === "a" && (e.ctrlKey || e.metaKey)) {
      setTimeout(() => {
        const selection = window.getSelection();
        if (selection && selection.toString().trim() &&
            els.translationEditor.contains(selection.getRangeAt(0).commonAncestorContainer)) {
          showFloatingAdaptBtn();
        } else {
          hideFloatingAdaptBtn();
        }
      }, 10);
    }
  });
  
  // Hide floating adapt button when clicking outside the editor
  document.addEventListener("mousedown", (e) => {
    if (!els.floatingAdaptBtn.contains(e.target) && !els.translationEditor.contains(e.target)) {
      hideFloatingAdaptBtn();
    }
  });
  
  // Translation upload/download
  els.uploadTranslationBtn.addEventListener("click", () => {
    els.translationFileInput.click();
  });
  els.translationFileInput.addEventListener("change", () => {
    const file = els.translationFileInput.files?.[0];
    if (file) uploadTranslation(file);
    els.translationFileInput.value = ""; // Reset for re-upload
  });
  els.downloadTranslationBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleDownloadMenu();
  });
  
  // Handle download format selection
  els.downloadMenu.querySelectorAll(".dropdown-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.stopPropagation();
      const format = item.dataset.format;
      downloadTranslation(format);
    });
  });
  
  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!els.downloadDropdown.contains(e.target)) {
      hideDownloadMenu();
    }
  });
  setupTranslationDragDrop();
  
  // "Select Passage" button - expands selection to full passage
  els.selectPassageBtn.addEventListener("click", () => {
    if (state.selectedText) {
      const matchingPassage = findMatchingPassage(state.selectedText);
      if (matchingPassage) {
        state.selectedPassageIds = [matchingPassage.id];
        state.selectedText = matchingPassage.text;
        updateSelectionBadge(1, matchingPassage.text.length);
        highlightPassages();
        els.selectPassageBtn.style.display = "none";
      } else {
        showToast("No matching passage found", true);
      }
    }
  });
  
  els.settingsBtn.addEventListener("click", openSettingsModal);
  els.closeSettingsBtn.addEventListener("click", closeSettingsModal);
  els.saveSettingsBtn.addEventListener("click", saveSettings);
  els.resetAllSettingsBtn.addEventListener("click", resetAllSettings);
  
  els.settingsModal.addEventListener("click", e => {
    if (e.target === els.settingsModal) {
      closeSettingsModal();
    }
  });
  
  // Adapt modal: do NOT close on overlay click (user needs to select/copy text inside)
  // Only close via the × button or Escape key
  
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (els.adaptModal.style.display !== "none") {
        closeAdaptPanel();
      } else if (els.settingsModal.style.display !== "none") {
        closeSettingsModal();
      }
    }
  });
  
  setupResizer();
  setupCustomLanguage();
  
  els.translationEditor.addEventListener("blur", updateLastTranslation);
  
  // Strip formatting when pasting - keep only plain text
  els.translationEditor.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  
  // Strip formatting for adapt result field too
  els.adaptResultText.addEventListener("paste", (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
  });
  
  // When clicking in editor, hide marker and placeholder (user is actively editing)
  els.translationEditor.addEventListener("focus", () => {
    hideCaretMarker();
    els.translationEditor.classList.add("hide-placeholder");
    els.translationEditor.classList.remove("show-placeholder");
  });
  
  // When leaving editor, show placeholder if empty
  els.translationEditor.addEventListener("blur", () => {
    els.translationEditor.classList.remove("hide-placeholder");
    // Show placeholder if editor is effectively empty
    if (isEditorEffectivelyEmpty()) {
      els.translationEditor.classList.add("show-placeholder");
    } else {
      els.translationEditor.classList.remove("show-placeholder");
    }
  });
  
  // When clicking anywhere on right panel, hide floating translate button
  els.rightPanel.addEventListener("mousedown", () => {
    hideFloatingTranslateBtn();
  });
  
  // When clicking on document viewport, save and show caret marker
  els.documentViewport.addEventListener("mousedown", () => {
    // Save current caret position and show marker before focus leaves editor
    if (document.activeElement === els.translationEditor || 
        els.translationEditor.contains(document.activeElement)) {
      saveCaretPosition(true); // true = show marker
    }
  });
  
  // Clear passage selection when manually selecting text in document
  els.documentViewport.addEventListener("mouseup", () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      // User made a manual text selection
      state.selectedText = selection.toString().trim();
    }
  });
  
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      doTranslate();
    }
  });
}

init();
