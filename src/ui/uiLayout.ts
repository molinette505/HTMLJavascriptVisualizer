// @ts-nocheck
// File purpose: drawer/tab/mobile layout controls extracted from ui.ts.

export function attachLayoutMethods(ui) {
    Object.assign(ui, {
        toggleDrawer: () => {
            if (window.innerWidth >= 800) return;
            const panel = document.getElementById('right-panel');
            if (panel.classList.contains('open')) {
                panel.classList.remove('open');
                ui.isDrawerOpen = false;
            } else {
                panel.classList.add('open');
                ui.isDrawerOpen = true;
            }
        },
        switchTab: (tabName) => {
            if (ui.p5ModeEnabled && tabName === 'dom') tabName = 'memory';
            document.querySelectorAll('.drawer-tab').forEach((tab) => tab.classList.remove('active'));
            const tabElement = document.getElementById(`tab-${tabName}`);
            if (tabElement) tabElement.classList.add('active');
            document.querySelectorAll('.drawer-content').forEach((content) => content.classList.remove('active'));
            const viewElement = document.getElementById(`view-${tabName}`);
            if (viewElement) viewElement.classList.add('active');
            if (tabName === 'dom') ui.renderDomPanel();
        },
        ensureDrawerOpen: (tabName) => {
            if (ui.p5ModeEnabled && tabName === 'dom') tabName = 'memory';
            return new Promise((resolve) => {
                if (ui.skipMode || ui.isStopping) {
                    const panel = document.getElementById('right-panel');
                    if (window.innerWidth >= 800) {
                        ui.switchTab(tabName);
                        resolve();
                        return;
                    }
                    if (panel) {
                        ui.switchTab(tabName);
                        panel.classList.add('open');
                        ui.isDrawerOpen = true;
                    }
                    resolve();
                    return;
                }
                if (window.innerWidth >= 800) {
                    const targetContentDesktop = document.getElementById(`view-${tabName}`);
                    if (targetContentDesktop && !targetContentDesktop.classList.contains('active')) ui.switchTab(tabName);
                    resolve();
                    return;
                }

                const panel = document.getElementById('right-panel');
                const targetContent = document.getElementById(`view-${tabName}`);
                if (!panel || !targetContent) {
                    resolve();
                    return;
                }

                if (!panel.classList.contains('open')) {
                    ui.switchTab(tabName);
                    panel.classList.add('open');
                    ui.isDrawerOpen = true;
                    setTimeout(resolve, 650);
                    return;
                }
                if (!targetContent.classList.contains('active')) {
                    ui.switchTab(tabName);
                    setTimeout(resolve, 600);
                    return;
                }
                resolve();
            });
        },
        showMobileTools: () => {
            if (window.innerWidth < 800) {
                const container = document.getElementById('mobile-tools-container');
                container.classList.add('visible');
            }
        },
        hideMobileTools: () => {
            setTimeout(() => {
                document.getElementById('mobile-tools-container').classList.remove('visible');
                ui.activeSubTool = null;
                ui.renderSubToolbar();
            }, 150);
        },
        toggleSubTool: (category, event) => {
            if (event) {
                event.preventDefault();
                event.stopPropagation();
            }
            if (ui.activeSubTool === category) {
                ui.activeSubTool = null;
            } else {
                ui.activeSubTool = category;
            }
            ui.renderSubToolbar();
        },
        renderSubToolbar: () => {
            const subRow = document.getElementById('sub-toolbar');
            const mainRow = document.getElementById('main-toolbar');
            mainRow.querySelectorAll('.tool-btn').forEach((button) => button.classList.remove('active-category'));

            if (!ui.activeSubTool) {
                subRow.classList.add('hidden');
                subRow.innerHTML = '';
                return;
            }
            const activeBtn = document.getElementById(`btn-cat-${ui.activeSubTool}`);
            if (activeBtn) activeBtn.classList.add('active-category');

            subRow.classList.remove('hidden');
            let keys = [];

            if (ui.activeSubTool === 'brackets') keys = ['(', ')', '{', '}', '[', ']'];
            else if (ui.activeSubTool === 'math') keys = ['+', '-', '*', '/', '%'];
            else if (ui.activeSubTool === 'logic') keys = ['<', '>', '<=', '>=', '===', '!=', '&&', '||', '!'];

            subRow.innerHTML = keys.map((key) =>
                `<button class="tool-btn" onmousedown="event.preventDefault()" onclick="editor.insertText('${key}', false, true)">${key.replace('<', '&lt;').replace('>', '&gt;')}</button>`
            ).join('');
        },
    });
}
