// @ts-nocheck
// File purpose: application bootstrap and browser event wiring for desktop/mobile controls.
import './styles/main.css';
import { DEFAULT_CODE } from './core/config';
import { ui, consoleUI } from './ui/ui';
import { app } from './ui/app';
import { editor } from './ui/editor';
import { editorAutocomplete } from './ui/editorAutocomplete';
import { refreshIcons } from './ui/icons';

window.app = app;
window.ui = ui;
window.editor = editor;
window.consoleUI = consoleUI;
window.loadVisualizerContent = (payload) => app.loadExternalContent(payload);
window.setVisualizerContent = window.loadVisualizerContent;
window.setVisualizerEmbedOptions = (options) => app.applyEmbedUiOptions(options);

// --- KEYBOARD SHORTCUTS ---
document.getElementById('code-input').addEventListener('keydown', (e) => {
    // Autocomplete/pair insertion gets first pass at key handling.
    if (editorAutocomplete.handleKeydown(e)) return;

    if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
            editor.outdentSelection();
            return;
        }
        if (editor.hasMultilineSelection()) {
            editor.indentSelection();
            return;
        }
        editor.insertText('    ');
    }

    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        editor.undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        editor.redo();
    }

    if (e.key === 'Enter') {
        const loadPopup = document.getElementById('load-popup');
        if (loadPopup && loadPopup.classList.contains('visible')) {
            app.loadSelectedScenario();
        }
    }
});

// --- INIT & EVENTS ---
document.getElementById('code-input').value = DEFAULT_CODE;
app.initializeEditorBuffers(DEFAULT_CODE);
editor.adjustHeight();
editor.refresh();
editorAutocomplete.init();
refreshIcons();
app.initScenarioLoader();
ui.renderDomPanel();
ui.switchTab('memory');
ui.updateDisplayOptionsControls();
app.updateOptionsPopupControls();

const closeDrawerForEditorFocus = () => {
    if (window.innerWidth >= 800) return;
    const rightPanel = document.getElementById('right-panel');
    if (!rightPanel) return;
    rightPanel.classList.remove('open');
    rightPanel.style.height = '';
    ui.isDrawerOpen = false;
    ui.hideOptionsPopup();
};

document.getElementById('code-input').addEventListener('focus', closeDrawerForEditorFocus);

// Drawer Drag Logic
const handle = document.getElementById('drawer-handle');
const panel = document.getElementById('right-panel');
const desktopSplitter = document.getElementById('desktop-splitter');
const mainContainer = document.getElementById('main-container');
let startY = 0;
let startHeight = 0;
let isDragging = false;
let isDesktopDragging = false;
const MIN_RIGHT_PANEL_WIDTH = 300;
const MIN_EDITOR_WIDTH = 320;

const clampDesktopPanelWidth = () => {
    if (!panel || !mainContainer || !desktopSplitter) return;
    if (window.innerWidth < 800) {
        panel.style.width = '';
        return;
    }
    const containerRect = mainContainer.getBoundingClientRect();
    const splitterRect = desktopSplitter.getBoundingClientRect();
    const splitterWidth = Math.max(0, splitterRect.width || 0);
    const maxPanelWidth = Math.max(
        MIN_RIGHT_PANEL_WIDTH,
        containerRect.width - MIN_EDITOR_WIDTH - splitterWidth
    );
    const currentPanelWidth = panel.getBoundingClientRect().width;
    const clampedWidth = Math.min(maxPanelWidth, Math.max(MIN_RIGHT_PANEL_WIDTH, currentPanelWidth));
    panel.style.width = `${Math.round(clampedWidth)}px`;
};

const setDesktopPanelWidthFromPointer = (clientX: number) => {
    if (!panel || !mainContainer || !desktopSplitter || window.innerWidth < 800) return;
    const containerRect = mainContainer.getBoundingClientRect();
    const splitterRect = desktopSplitter.getBoundingClientRect();
    const splitterWidth = Math.max(0, splitterRect.width || 0);
    const maxPanelWidth = Math.max(
        MIN_RIGHT_PANEL_WIDTH,
        containerRect.width - MIN_EDITOR_WIDTH - splitterWidth
    );
    const rawWidth = containerRect.right - clientX;
    const clampedWidth = Math.min(maxPanelWidth, Math.max(MIN_RIGHT_PANEL_WIDTH, rawWidth));
    panel.style.width = `${Math.round(clampedWidth)}px`;
};

handle.addEventListener('touchstart', (e) => {
    if (window.innerWidth >= 800) return;
    startY = e.touches[0].clientY;
    startHeight = panel.getBoundingClientRect().height;
    isDragging = true;
    panel.style.transition = 'none';
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    if (window.innerWidth >= 800) return;
    e.preventDefault();
    const currentY = e.touches[0].clientY;
    const deltaY = startY - currentY;
    const newHeight = startHeight + deltaY;
    const maxHeight = window.innerHeight * 0.85;
    if (newHeight >= 32 && newHeight <= maxHeight) {
        panel.style.height = `${newHeight}px`;
    }
}, { passive: false });

handle.addEventListener('touchend', () => {
    if (!isDragging) return;
    if (window.innerWidth >= 800) return;
    isDragging = false;
    panel.style.transition = '';
    const currentHeight = panel.getBoundingClientRect().height;
    if (currentHeight > 120) {
        panel.classList.add('open');
        ui.isDrawerOpen = true;
    } else {
        panel.classList.remove('open');
        ui.isDrawerOpen = false;
    }
    panel.style.height = '';
});

handle.addEventListener('click', () => {
    if (window.innerWidth >= 800) return;
    ui.toggleDrawer();
    panel.style.height = '';
});

desktopSplitter?.addEventListener('pointerdown', (event) => {
    if (window.innerWidth < 800) return;
    isDesktopDragging = true;
    desktopSplitter.classList.add('is-dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    if (desktopSplitter.setPointerCapture) desktopSplitter.setPointerCapture(event.pointerId);
    setDesktopPanelWidthFromPointer(event.clientX);
});

document.addEventListener('pointermove', (event) => {
    if (!isDesktopDragging) return;
    setDesktopPanelWidthFromPointer(event.clientX);
    ui.positionOptionsPopup();
});

const stopDesktopDrag = (event?: PointerEvent) => {
    if (!isDesktopDragging) return;
    isDesktopDragging = false;
    if (desktopSplitter) desktopSplitter.classList.remove('is-dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (desktopSplitter && event && desktopSplitter.releasePointerCapture && desktopSplitter.hasPointerCapture?.(event.pointerId)) {
        desktopSplitter.releasePointerCapture(event.pointerId);
    }
    clampDesktopPanelWidth();
    ui.positionOptionsPopup();
};

document.addEventListener('pointerup', (event) => stopDesktopDrag(event));
document.addEventListener('pointercancel', (event) => stopDesktopDrag(event));

window.addEventListener('resize', () => {
    if (window.innerWidth >= 800) {
        document.getElementById('right-panel').classList.remove('open');
        clampDesktopPanelWidth();
    } else {
        const hasActive = document.querySelector('.drawer-tab.active');
        if (!hasActive) ui.switchTab('memory');
        panel.style.width = '';
    }
    ui.positionOptionsPopup();
});

window.requestAnimationFrame(() => {
    clampDesktopPanelWidth();
    ui.positionOptionsPopup();
});

const updateToolbarWrapState = () => {
    const toolbar = document.querySelector('.toolbar');
    const toolbarMain = document.querySelector('.toolbar-main');
    const editorModeGroup = document.querySelector('.editor-mode-group');
    const settingsGroup = document.querySelector('.settings-group');
    if (!toolbar || !toolbarMain || !editorModeGroup || !settingsGroup) return;

    const wasWrapped = toolbar.classList.contains('toolbar-needs-wrap');
    if (wasWrapped) toolbar.classList.remove('toolbar-needs-wrap');

    const toolbarStyle = window.getComputedStyle(toolbar);
    const horizontalPadding = (parseFloat(toolbarStyle.paddingLeft) || 0) + (parseFloat(toolbarStyle.paddingRight) || 0);
    const columnGap = parseFloat(toolbarStyle.columnGap || toolbarStyle.gap || '0') || 0;
    const availableWidth = Math.max(0, toolbar.clientWidth - horizontalPadding);

    const mainWidth = toolbarMain.scrollWidth;
    const editorWidth = editorModeGroup.getBoundingClientRect().width;
    const settingsWidth = settingsGroup.getBoundingClientRect().width;
    const totalRequired = mainWidth + editorWidth + settingsWidth + (columnGap * 2);

    toolbar.classList.toggle('toolbar-needs-wrap', totalRequired > availableWidth + 0.5);
};

window.addEventListener('resize', updateToolbarWrapState);
window.requestAnimationFrame(updateToolbarWrapState);
window.setTimeout(updateToolbarWrapState, 80);
if (document.fonts && typeof document.fonts.ready?.then === 'function') {
    document.fonts.ready.then(updateToolbarWrapState).catch(() => {});
}

document.addEventListener('click', (event) => {
    const popup = document.getElementById('options-popup');
    if (!popup || !popup.classList.contains('visible')) return;
    const target = event.target;
    const optionsButton = document.getElementById('btn-options');
    if (target instanceof Node) {
        if (popup.contains(target)) return;
        if (optionsButton && optionsButton.contains(target)) return;
    }
    ui.hideOptionsPopup();
});

const setAppHeight = () => {
    if (window.visualViewport) {
        document.documentElement.style.setProperty('--app-height', `${window.visualViewport.height}px`);
        window.scrollTo(0, 0);
    } else {
        document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    }
};

if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight);
    window.visualViewport.addEventListener('scroll', setAppHeight);
}
window.addEventListener('resize', setAppHeight);
setAppHeight();

window.addEventListener('message', (event) => {
    const data = event ? event.data : null;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'visualizer:p5-console') {
        app.onP5ConsoleMessage(data.payload || {});
        return;
    }
    if (data.type === 'visualizer:p5-error') {
        app.onP5ErrorMessage(data.payload || {});
        return;
    }
    if (data.type === 'visualizer:p5-ready') {
        app.onP5ReadyMessage(data.payload || {});
        return;
    }
    if (data.type === 'visualizer:load-content') {
        const payload = Object.prototype.hasOwnProperty.call(data, 'payload') ? data.payload : data;
        app.loadExternalContent(payload);
        return;
    }
    if (data.type === 'visualizer:set-options') {
        const options = Object.prototype.hasOwnProperty.call(data, 'options') ? data.options : data;
        app.applyEmbedUiOptions(options);
    }
});

if (window.parent && window.parent !== window) {
    try {
        window.parent.postMessage({ type: 'visualizer:ready' }, '*');
    } catch (error) {
        // noop
    }
}
