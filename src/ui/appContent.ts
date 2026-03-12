// @ts-nocheck

export const EDITOR_MODES = ['html', 'css', 'js'];

export const isEditorMode = (mode) => EDITOR_MODES.includes(mode);

const DRAWER_TABS = ['memory', 'console', 'dom'];

export const normalizeDrawerTab = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return null;
    if (normalized === 'output') return 'console';
    if (normalized === 'render') return 'dom';
    return DRAWER_TABS.includes(normalized) ? normalized : null;
};

const normalizeLineBreaks = (text) => String(text || '').replace(/\r\n?/g, '\n');
const stripEdgeBlankLines = (text) => String(text || '').replace(/^\s*\n+/, '').replace(/\n+\s*$/, '');
const stripTrailingSpaces = (text) => String(text || '').replace(/[ \t]+$/gm, '');
const dedentCommonIndent = (text) => {
    const lines = String(text || '').split('\n');
    const nonEmpty = lines.filter((line) => line.trim().length > 0);
    if (nonEmpty.length === 0) return String(text || '');
    const minIndent = nonEmpty.reduce((min, line) => {
        const match = line.match(/^[ \t]*/);
        const indent = match ? match[0].length : 0;
        return Math.min(min, indent);
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(minIndent) || minIndent <= 0) return String(text || '');
    return lines.map((line) => {
        if (line.trim().length === 0) return '';
        return line.slice(minIndent);
    }).join('\n');
};

export const formatLoadedText = (text, mode = 'js') => {
    const normalized = dedentCommonIndent(stripTrailingSpaces(stripEdgeBlankLines(normalizeLineBreaks(text))));
    if (mode === 'html') return normalized || '<body></body>';
    return normalized;
};

export const extractScenarioHtml = (rawHtml) => {
    const source = String(rawHtml || '').trim();
    if (!source) return { code: '', css: '', domHtml: '<body></body>' };

    const scriptBlocks = [];
    const styleBlocks = [];
    const withoutScripts = source.replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, (_, content = '') => {
        scriptBlocks.push(formatLoadedText(content, 'js'));
        return '';
    });
    const withoutScriptsAndStyles = withoutScripts.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, content = '') => {
        styleBlocks.push(formatLoadedText(content, 'css'));
        return '';
    });

    const code = formatLoadedText(scriptBlocks.join('\n\n'), 'js');
    const css = formatLoadedText(styleBlocks.join('\n\n'), 'css');
    const domHtml = formatLoadedText(withoutScriptsAndStyles, 'html');
    return { code, css, domHtml };
};

export const setEditorCode = (nextCode, editor) => {
    const input = document.getElementById('code-input');
    if (!input) return;
    input.value = nextCode;
    editor.history = [nextCode];
    editor.historyIdx = 0;
    editor.adjustHeight();
    editor.refresh();
};

export const normalizeExternalContent = (payload) => {
    let code = null;
    let domHtml = null;
    let css = null;
    const cssChunks = [];
    let label = 'Externe';
    let clearConsole = true;
    let run = false;
    let uiOptions = null;
    let initialEditorMode = null;
    let initialDrawerTab = null;

    if (typeof payload === 'string') {
        code = formatLoadedText(payload, 'js');
    } else if (payload && typeof payload === 'object') {
        if (typeof payload.js === 'string') code = formatLoadedText(payload.js, 'js');
        else if (typeof payload.code === 'string') code = formatLoadedText(payload.code, 'js');

        if (typeof payload.html === 'string') {
            const parsed = extractScenarioHtml(payload.html);
            domHtml = parsed.domHtml;
            if (code === null && parsed.code) code = parsed.code;
            if (parsed.css) cssChunks.push(parsed.css);
        } else if (typeof payload.domHtml === 'string') {
            domHtml = formatLoadedText(payload.domHtml || '<body></body>', 'html');
        }
        if (typeof payload.css === 'string') cssChunks.push(formatLoadedText(payload.css, 'css'));
        else if (typeof payload.domCss === 'string') cssChunks.push(formatLoadedText(payload.domCss, 'css'));

        if (typeof payload.label === 'string' && payload.label.trim()) label = payload.label.trim();
        else if (typeof payload.source === 'string' && payload.source.trim()) label = payload.source.trim();
        else if (typeof payload.title === 'string' && payload.title.trim()) label = payload.title.trim();

        if (typeof payload.clearConsole === 'boolean') clearConsole = payload.clearConsole;
        if (typeof payload.run === 'boolean') run = payload.run;
        if (payload.ui && typeof payload.ui === 'object') uiOptions = payload.ui;
        if (
            typeof payload.p5ModeEnabled === 'boolean'
            || typeof payload.p5Enabled === 'boolean'
            || Object.prototype.hasOwnProperty.call(payload, 'p5FrameRate')
            || Object.prototype.hasOwnProperty.call(payload, 'p5Fps')
            || Object.prototype.hasOwnProperty.call(payload, 'p5DeltaTime')
            || Object.prototype.hasOwnProperty.call(payload, 'p5DeltaTimeMs')
            || Object.prototype.hasOwnProperty.call(payload, 'p5FrameDelay')
            || Object.prototype.hasOwnProperty.call(payload, 'p5FrameDelayMs')
        ) {
            const extraUi = uiOptions && typeof uiOptions === 'object' ? { ...uiOptions } : {};
            if (typeof payload.p5ModeEnabled === 'boolean') extraUi.p5ModeEnabled = payload.p5ModeEnabled;
            else if (typeof payload.p5Enabled === 'boolean') extraUi.p5ModeEnabled = payload.p5Enabled;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5FrameRate')) extraUi.p5FrameRate = payload.p5FrameRate;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5Fps')) extraUi.p5FrameRate = payload.p5Fps;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5DeltaTime')) extraUi.p5DeltaTime = payload.p5DeltaTime;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5DeltaTimeMs')) extraUi.p5DeltaTimeMs = payload.p5DeltaTimeMs;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5FrameDelay')) extraUi.p5FrameDelayMs = payload.p5FrameDelay;
            if (Object.prototype.hasOwnProperty.call(payload, 'p5FrameDelayMs')) extraUi.p5FrameDelayMs = payload.p5FrameDelayMs;
            uiOptions = extraUi;
        }

        const editorCandidate = (typeof payload.editor === 'string')
            ? payload.editor
            : ((typeof payload.editorMode === 'string') ? payload.editorMode : ((typeof payload.startEditor === 'string') ? payload.startEditor : null));
        if (editorCandidate) {
            const normalizedEditor = String(editorCandidate).trim().toLowerCase();
            if (isEditorMode(normalizedEditor)) initialEditorMode = normalizedEditor;
        }

        const tabCandidate = (typeof payload.tab === 'string')
            ? payload.tab
            : ((typeof payload.drawerTab === 'string')
                ? payload.drawerTab
                : ((typeof payload.startTab === 'string')
                    ? payload.startTab
                    : ((typeof payload.panel === 'string')
                        ? payload.panel
                        : ((typeof payload.view === 'string') ? payload.view : null))));
        if (tabCandidate) initialDrawerTab = normalizeDrawerTab(tabCandidate);

        if (uiOptions && typeof uiOptions === 'object') {
            if (!initialEditorMode) {
                const uiEditorCandidate = (typeof uiOptions.editor === 'string')
                    ? uiOptions.editor
                    : ((typeof uiOptions.editorMode === 'string')
                        ? uiOptions.editorMode
                        : ((typeof uiOptions.startEditor === 'string') ? uiOptions.startEditor : null));
                if (uiEditorCandidate) {
                    const normalizedEditor = String(uiEditorCandidate).trim().toLowerCase();
                    if (isEditorMode(normalizedEditor)) initialEditorMode = normalizedEditor;
                }
            }
            if (!initialDrawerTab) {
                const uiTabCandidate = (typeof uiOptions.tab === 'string')
                    ? uiOptions.tab
                    : ((typeof uiOptions.drawerTab === 'string')
                        ? uiOptions.drawerTab
                        : ((typeof uiOptions.startTab === 'string')
                            ? uiOptions.startTab
                            : ((typeof uiOptions.view === 'string') ? uiOptions.view : null)));
                if (uiTabCandidate) initialDrawerTab = normalizeDrawerTab(uiTabCandidate);
            }
        }
    }

    const finalCss = cssChunks.length > 0 ? formatLoadedText(cssChunks.join('\n\n'), 'css') : css;
    return {
        code,
        domHtml,
        css: finalCss,
        label,
        clearConsole,
        run,
        initialEditorMode,
        initialDrawerTab,
        uiOptions,
        hasContent: code !== null || domHtml !== null || finalCss !== null
    };
};
