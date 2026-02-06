// @ts-nocheck
import './styles/main.css';
import { DEFAULT_CODE } from './core/config';
import { ui, consoleUI } from './ui/ui';
import { app } from './ui/app';
import { editor } from './ui/editor';
import { refreshIcons } from './ui/icons';

window.app = app;
window.ui = ui;
window.editor = editor;
window.consoleUI = consoleUI;

// --- KEYBOARD SHORTCUTS ---
document.getElementById('code-input').addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
        e.preventDefault();
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
        const popup = document.getElementById('event-popup');
        if (popup.classList.contains('visible')) {
            app.saveEventName();
        }
    }
});

// --- INIT & EVENTS ---
document.getElementById('code-input').value = DEFAULT_CODE;
editor.adjustHeight();
editor.refresh();
refreshIcons();

if (window.innerWidth >= 800) {
    document.getElementById('view-memory').classList.add('active');
    document.getElementById('view-console').classList.add('active');
} else {
    ui.switchTab('memory');
}

// Drawer Drag Logic
const handle = document.getElementById('drawer-handle');
const panel = document.getElementById('right-panel');
let startY = 0;
let startHeight = 0;
let isDragging = false;

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

window.addEventListener('resize', () => {
    if (window.innerWidth >= 800) {
        document.getElementById('view-memory').classList.add('active');
        document.getElementById('view-console').classList.add('active');
        document.getElementById('right-panel').classList.remove('open');
    } else {
        const memActive = document.getElementById('tab-memory').classList.contains('active');
        const conActive = document.getElementById('tab-console').classList.contains('active');
        if (!memActive && !conActive) ui.switchTab('memory');
    }
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
