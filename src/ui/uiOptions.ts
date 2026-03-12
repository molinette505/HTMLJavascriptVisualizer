// @ts-nocheck

export function attachOptionsMethods(ui) {
    Object.assign(ui, {
        hideOptionsPopup: () => {
            const popup = document.getElementById('options-popup');
            if (popup) popup.classList.remove('visible');
        },
        positionOptionsPopup: () => {
            const popup = document.getElementById('options-popup');
            const optionsButton = document.getElementById('btn-options');
            const toolbar = document.querySelector('.toolbar');
            if (!popup || !optionsButton || !toolbar) return;
            const toolbarRect = toolbar.getBoundingClientRect();
            const buttonRect = optionsButton.getBoundingClientRect();
            const popupRect = popup.getBoundingClientRect();
            const popupWidth = popupRect.width || popup.offsetWidth || 250;
            const buttonCenter = (buttonRect.left - toolbarRect.left) + (buttonRect.width / 2);
            const minLeft = 8;
            const maxLeft = Math.max(minLeft, toolbar.clientWidth - popupWidth - 8);
            const alignedLeft = Math.max(minLeft, Math.min(maxLeft, buttonCenter - (popupWidth / 2)));
            popup.style.right = 'auto';
            popup.style.left = `${alignedLeft}px`;
        },
        toggleOptionsPopup: (forceOpen = null) => {
            const popup = document.getElementById('options-popup');
            if (!popup) return;
            const shouldOpen = forceOpen === null ? !popup.classList.contains('visible') : Boolean(forceOpen);
            if (!shouldOpen) {
                popup.classList.remove('visible');
                return;
            }
            const eventPopup = document.getElementById('event-popup');
            const loadPopup = document.getElementById('load-popup');
            if (eventPopup) eventPopup.classList.remove('visible');
            if (loadPopup) loadPopup.classList.remove('visible');
            popup.classList.add('visible');
            ui.updateDisplayOptionsControls();
            if (window.app && typeof window.app.updateOptionsPopupControls === 'function') {
                window.app.updateOptionsPopupControls();
            }
            window.requestAnimationFrame(ui.positionOptionsPopup);
            window.requestAnimationFrame(ui.positionOptionsPopup);
        },
    });
}
