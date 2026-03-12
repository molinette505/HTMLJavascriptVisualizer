// @ts-nocheck
// File purpose: modular textarea autocomplete (keywords/APIs/symbols) and bracket auto-close behavior.

/**
 * JS reserved words used to avoid polluting symbol suggestions.
 * This list intentionally keeps language + common runtime globals.
 */
const JS_RESERVED_WORDS = new Set([
    'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger', 'default', 'delete',
    'do', 'else', 'enum', 'export', 'extends', 'false', 'finally', 'for', 'function', 'if', 'import',
    'in', 'instanceof', 'let', 'new', 'null', 'return', 'super', 'switch', 'this', 'throw', 'true',
    'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
    'console', 'document', 'window', 'Math', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Date'
]);

const AUTO_CLOSE_PAIRS = {
    '(': ')',
    '[': ']',
    '{': '}'
};

const CLOSING_CHARS = new Set(Object.values(AUTO_CLOSE_PAIRS));
const MAX_VISIBLE_SUGGESTIONS = 10;

/**
 * Minimum typed prefix length before showing non-symbol suggestions.
 * Set to 1 so suggestions appear quickly, while still requiring strict prefix matching.
 */
const MIN_PREFIX_NON_SYMBOL = 1;

const inferCursorOffset = (insertText) => {
    if (insertText === '${}') return 2;
    if (/\(\)$/.test(insertText)) return insertText.length - 1;
    return insertText.length;
};

const createSuggestion = ({ label, insertText = label, cursorOffset, kind }) => ({
    label,
    insertText,
    cursorOffset: Number.isInteger(cursorOffset) ? cursorOffset : inferCursorOffset(insertText),
    kind
});

// Core syntax snippets requested by the user.
const JS_KEYWORD_SUGGESTIONS = [
    createSuggestion({ label: 'function', insertText: 'function ', kind: 'keyword' }),
    createSuggestion({ label: 'for ()', kind: 'keyword' }),
    createSuggestion({ label: 'while ()', kind: 'keyword' }),
    createSuggestion({ label: 'switch ()', kind: 'keyword' }),
    createSuggestion({ label: 'case :', kind: 'keyword' }),
    createSuggestion({ label: 'if ()', kind: 'keyword' }),
    createSuggestion({ label: 'else', kind: 'keyword' }),
    createSuggestion({ label: 'break', kind: 'keyword' }),
    createSuggestion({ label: 'return', insertText: 'return ', kind: 'keyword' }),
    createSuggestion({ label: 'let', insertText: 'let ', kind: 'keyword' })
];

// Global/browser helpers (includes DOM-focused APIs requested by the user).
const JS_GLOBAL_SUGGESTIONS = [
    'const', 'let', 'var', 'function', 'return', 'if', 'else', 'switch', 'case', 'break', 'default',
    'for', 'while', 'do', 'try', 'catch', 'finally', 'new', 'class', 'async', 'await',
    'document', 'window', 'console.log()', 'console.warn()', 'console.error()',
    'setTimeout()', 'setInterval()', 'clearTimeout()', 'clearInterval()',
    'document.getElementById()', 'document.querySelector()', 'document.querySelectorAll()',
    'document.getElementsByClassName()', 'document.getElementsByTagName()',
    'document.createElement()', 'document.createTextNode()', 'document.addEventListener()',
    'querySelector()', 'querySelectorAll()', 'getElementById()', 'addEventListener()',
    'setAttribute()', 'removeAttribute()', 'getAttribute()',
    'appendChild()', 'append()', 'prepend()', 'remove()', 'replaceChildren()',
    'classList.add()', 'classList.remove()', 'classList.toggle()', 'classList.contains()',
    'style.setProperty()', 'style.removeProperty()',
    'fetch()', 'localStorage.getItem()', 'localStorage.setItem()', 'JSON.parse()', 'JSON.stringify()'
].map((label) => createSuggestion({ label, kind: 'global' }));

const JS_MEMBER_SUGGESTIONS = [
    'length', 'push()', 'pop()', 'shift()', 'unshift()', 'slice()', 'splice()', 'includes()', 'indexOf()',
    'join()', 'forEach()', 'map()', 'filter()', 'find()', 'some()', 'every()',
    'trim()', 'toUpperCase()', 'toLowerCase()',
    'value', 'innerText', 'innerHTML', 'textContent',
    'classList', 'style',
    'querySelector()', 'querySelectorAll()', 'getElementById()', 'createElement()',
    'appendChild()', 'append()', 'prepend()', 'remove()',
    'setAttribute()', 'removeAttribute()', 'getAttribute()', 'addEventListener()'
].map((label) => createSuggestion({ label, kind: 'member' }));

const CLASSLIST_MEMBER_SUGGESTIONS = [
    'add()', 'remove()', 'toggle()', 'contains()'
].map((label) => createSuggestion({ label, kind: 'member' }));

const STYLE_MEMBER_SUGGESTIONS = [
    'display', 'width', 'height', 'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
    'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
    'border', 'borderWidth', 'borderColor', 'borderStyle', 'borderRadius',
    'color', 'backgroundColor', 'backgroundImage', 'opacity', 'visibility', 'cursor', 'boxShadow',
    'fontSize', 'fontWeight', 'fontFamily', 'textAlign', 'lineHeight', 'textDecoration', 'textTransform',
    'letterSpacing', 'position', 'top', 'bottom', 'left', 'right', 'zIndex', 'overflow', 'float',
    'flex', 'flexDirection', 'justifyContent', 'alignItems', 'gridTemplateColumns', 'gap',
    'transform', 'transition', 'animation'
].map((label) => createSuggestion({ label, kind: 'member' }));

const STYLE_METHOD_SUGGESTIONS = [
    'setProperty()', 'removeProperty()'
].map((label) => createSuggestion({ label, kind: 'member' }));

// Dedicated delimiter completion requested for "$" -> "${}".
const DELIMITER_SUGGESTION = createSuggestion({
    label: '${}',
    insertText: '${}',
    kind: 'snippet'
});

const STATIC_JS_SUGGESTIONS = [...JS_KEYWORD_SUGGESTIONS, ...JS_GLOBAL_SUGGESTIONS];

const state = {
    initialized: false,
    popup: null,
    list: null,
    items: [],
    selectedIndex: 0,
    replaceStart: 0,
    replaceEnd: 0,
    suppressNextInputRefresh: false
};

const getCodeInput = () => document.getElementById('code-input');
const getCodeWrapper = () => document.getElementById('code-wrapper');

const isJavaScriptMode = () => {
    if (!window.app || typeof window.app.getCurrentEditorMode !== 'function') return true;
    return window.app.getCurrentEditorMode() === 'js';
};

/**
 * Keeps editor rendering/history in sync after programmatic text inserts.
 * We dispatch `input` so existing editor wiring updates highlighting/buffers.
 */
const notifyEditorChanged = (input, saveImmediately = false) => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    if (!saveImmediately) return;
    if (window.editor && typeof window.editor.saveHistory === 'function') {
        window.editor.saveHistory();
    }
};

const normalizeForSearch = (text) => String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_$]/g, '');

const escapeHtml = (text) => String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/**
 * Simple sanitization pass so symbol extraction does not read inside comments/strings.
 */
const stripStringsAndComments = (source) => String(source || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/`(?:\\.|[^`])*`/g, ' ')
    .replace(/"(?:\\.|[^"])*"/g, ' ')
    .replace(/'(?:\\.|[^'])*'/g, ' ');

const extractLetNames = (source, outSet) => {
    const letBlockPattern = /\blet\s+([^;\n]+)/g;
    let match;
    while ((match = letBlockPattern.exec(source))) {
        const declarations = String(match[1] || '').split(',');
        declarations.forEach((entry) => {
            const identifierMatch = entry.trim().match(/^([A-Za-z_$][\w$]*)/);
            if (!identifierMatch) return;
            outSet.add(identifierMatch[1]);
        });
    }
};

const extractFunctionNames = (source, outSet) => {
    const functionPattern = /\bfunction\s+([A-Za-z_$][\w$]*)/g;
    let match;
    while ((match = functionPattern.exec(source))) {
        outSet.add(match[1]);
    }
};

/**
 * Collects user-defined symbols requested by the user:
 * - variables declared with `let`
 * - named function declarations
 */
const collectDeclaredSymbols = (source) => {
    const cleaned = stripStringsAndComments(source);
    const symbolSet = new Set();
    extractLetNames(cleaned, symbolSet);
    extractFunctionNames(cleaned, symbolSet);
    return [...symbolSet]
        .filter((name) => !JS_RESERVED_WORDS.has(name))
        .sort((a, b) => a.localeCompare(b, 'en'));
};

const mergeUniqueSuggestions = (suggestions) => {
    const map = new Map();
    suggestions.forEach((entry) => {
        const key = `${entry.kind}:${entry.insertText}`;
        if (!map.has(key)) map.set(key, entry);
    });
    return [...map.values()];
};

/**
 * Shared ranking utility.
 * - symbols can show quickly
 * - non-symbol suggestions obey configurable min prefix threshold
 */
const rankSuggestions = (prefix, suggestions, options = {}) => {
    const normalizedPrefix = normalizeForSearch(prefix);
    const {
        minPrefixNonSymbol = 0,
        allowEmptyPrefix = false,
        symbolPriority = true
    } = options;

    if (!allowEmptyPrefix && !normalizedPrefix) return [];

    return suggestions
        .map((entry) => {
            const normalizedLabel = normalizeForSearch(entry.label || entry.insertText);
            if (!normalizedLabel) return null;

            const isSymbol = entry.kind === 'symbol';
            if (!isSymbol && normalizedPrefix.length < minPrefixNonSymbol) return null;

            if (normalizedPrefix) {
                if (!normalizedLabel.startsWith(normalizedPrefix)) return null;
            } else if (!allowEmptyPrefix) {
                return null;
            }

            const kindRank = symbolPriority
                ? (isSymbol ? 0 : 1)
                : 0;

            return { ...entry, kindRank };
        })
        .filter(Boolean)
        .sort((a, b) => {
            if (a.kindRank !== b.kindRank) return a.kindRank - b.kindRank;
            return String(a.label).localeCompare(String(b.label), 'en');
        })
        .slice(0, MAX_VISIBLE_SUGGESTIONS);
};

const buildWordSuggestions = (source, prefix) => {
    const symbolSuggestions = collectDeclaredSymbols(source).map((name) => createSuggestion({
        label: name,
        insertText: name,
        kind: 'symbol'
    }));

    const symbolMatches = rankSuggestions(prefix, symbolSuggestions, {
        minPrefixNonSymbol: 0,
        allowEmptyPrefix: false,
        symbolPriority: true
    });

    const staticMatches = rankSuggestions(prefix, STATIC_JS_SUGGESTIONS, {
        minPrefixNonSymbol: MIN_PREFIX_NON_SYMBOL,
        allowEmptyPrefix: false,
        symbolPriority: true
    });

    return mergeUniqueSuggestions([...symbolMatches, ...staticMatches]).slice(0, MAX_VISIBLE_SUGGESTIONS);
};

const parseQualifierBeforeDot = (beforeDotText) => {
    const qualifierMatch = String(beforeDotText || '').match(/([A-Za-z_$][\w$]*)$/);
    return qualifierMatch ? qualifierMatch[1] : null;
};

const buildMemberSuggestions = (prefix, qualifier) => {
    let pool = JS_MEMBER_SUGGESTIONS;
    if (qualifier === 'style') pool = [...STYLE_MEMBER_SUGGESTIONS, ...STYLE_METHOD_SUGGESTIONS];
    if (qualifier === 'classList') pool = CLASSLIST_MEMBER_SUGGESTIONS;

    return rankSuggestions(prefix, pool, {
        // Non-symbol member completions follow the same 3-char threshold.
        minPrefixNonSymbol: MIN_PREFIX_NON_SYMBOL,
        allowEmptyPrefix: false,
        symbolPriority: false
    });
};

const buildContextFromInput = (input) => {
    if (!input) return null;
    if (input.selectionStart !== input.selectionEnd) return null;

    const cursor = input.selectionStart;
    const value = String(input.value || '');
    const beforeCursor = value.slice(0, cursor);
    const nextChar = value.charAt(cursor);

    // Dedicated "$" completion context for `${}`.
    if (beforeCursor.endsWith('$') && nextChar !== '{') {
        return {
            replaceStart: Math.max(0, cursor - 1),
            replaceEnd: cursor,
            prefix: '$',
            kind: 'delimiter',
            qualifier: null
        };
    }

    const wordMatch = beforeCursor.match(/[A-Za-z_$][\w$]*$/);
    if (wordMatch) {
        const replaceStart = cursor - wordMatch[0].length;
        const charBeforeWord = beforeCursor.charAt(replaceStart - 1);

        if (charBeforeWord === '.') {
            const beforeDot = beforeCursor.slice(0, replaceStart - 1).replace(/\s+$/, '');
            return {
                replaceStart,
                replaceEnd: cursor,
                prefix: wordMatch[0],
                kind: 'member',
                qualifier: parseQualifierBeforeDot(beforeDot)
            };
        }

        return {
            replaceStart,
            replaceEnd: cursor,
            prefix: wordMatch[0],
            kind: 'word',
            qualifier: null
        };
    }

    // Support immediate suggestion list right after typing '.'
    if (beforeCursor.endsWith('.')) {
        const beforeDot = beforeCursor.slice(0, -1).replace(/\s+$/, '');
        return {
            replaceStart: cursor,
            replaceEnd: cursor,
            prefix: '',
            kind: 'member',
            qualifier: parseQualifierBeforeDot(beforeDot)
        };
    }

    return null;
};

/**
 * Mirrors textarea styling in an off-screen element to compute caret coordinates.
 * Textareas do not expose caret pixels directly, so this is the most reliable fallback.
 */
const getCaretCoordinates = (input, position) => {
    const style = window.getComputedStyle(input);
    const mirror = document.createElement('div');
    const span = document.createElement('span');
    const copiedProps = [
        'boxSizing',
        'width',
        'height',
        'overflowX',
        'overflowY',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'fontStyle',
        'fontVariant',
        'fontWeight',
        'fontStretch',
        'fontSize',
        'fontFamily',
        'lineHeight',
        'letterSpacing',
        'textTransform',
        'textIndent',
        'whiteSpace',
        'wordSpacing'
    ];

    copiedProps.forEach((prop) => {
        mirror.style[prop] = style[prop];
    });
    mirror.style.position = 'absolute';
    mirror.style.visibility = 'hidden';
    mirror.style.left = '-9999px';
    mirror.style.top = '0';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.wordWrap = 'break-word';
    mirror.style.overflow = 'hidden';

    mirror.textContent = input.value.substring(0, position);
    span.textContent = input.value.substring(position, position + 1) || '.';
    mirror.appendChild(span);
    document.body.appendChild(mirror);

    const top = span.offsetTop + parseFloat(style.borderTopWidth || '0');
    const left = span.offsetLeft + parseFloat(style.borderLeftWidth || '0');
    document.body.removeChild(mirror);
    return { top, left };
};

const ensurePopup = () => {
    if (state.popup && state.list) return;
    const wrapper = getCodeWrapper();
    if (!wrapper) return;

    const popup = document.createElement('div');
    popup.id = 'editor-autocomplete';
    popup.className = 'editor-autocomplete hidden';

    const list = document.createElement('div');
    list.className = 'editor-autocomplete-list';
    popup.appendChild(list);
    wrapper.appendChild(popup);

    state.popup = popup;
    state.list = list;
};

const hideAutocomplete = () => {
    if (!state.popup) return;
    state.popup.classList.add('hidden');
    state.items = [];
    state.selectedIndex = 0;
};

const positionPopup = (input, replaceEnd) => {
    if (!state.popup) return;
    const wrapper = getCodeWrapper();
    if (!wrapper) return;

    const caret = getCaretCoordinates(input, replaceEnd);
    const lineHeight = parseFloat(window.getComputedStyle(input).lineHeight || '20');
    const inputRect = input.getBoundingClientRect();
    const wrapperRect = wrapper.getBoundingClientRect();

    let left = inputRect.left - wrapperRect.left + caret.left;
    let top = inputRect.top - wrapperRect.top + caret.top + lineHeight + 4;

    const popupRect = state.popup.getBoundingClientRect();
    const maxLeft = Math.max(8, wrapper.clientWidth - popupRect.width - 8);
    left = Math.min(Math.max(8, left), maxLeft);

    if (top + popupRect.height > wrapper.clientHeight - 8) {
        top = Math.max(8, top - popupRect.height - lineHeight - 8);
    }

    state.popup.style.left = `${Math.round(left)}px`;
    state.popup.style.top = `${Math.round(top)}px`;
};

const updateSelectedItem = () => {
    state.items.forEach((item, index) => {
        item.classList.toggle('is-selected', index === state.selectedIndex);
    });
};

const applySuggestion = (suggestionIndex) => {
    const input = getCodeInput();
    if (!input || !state.items[suggestionIndex]) return false;

    const item = state.items[suggestionIndex];
    const insertText = item.dataset.insertText || '';
    const cursorOffset = Number(item.dataset.cursorOffset || insertText.length);
    const value = String(input.value || '');

    input.value = `${value.slice(0, state.replaceStart)}${insertText}${value.slice(state.replaceEnd)}`;
    const caretPosition = state.replaceStart + cursorOffset;
    input.selectionStart = caretPosition;
    input.selectionEnd = caretPosition;
    input.focus();

    // Prevent immediate reopen from the synthetic input dispatch used for refresh.
    state.suppressNextInputRefresh = true;
    notifyEditorChanged(input, true);
    hideAutocomplete();
    return true;
};

const renderSuggestions = (suggestions, context, input) => {
    ensurePopup();
    if (!state.popup || !state.list) return;

    state.replaceStart = context.replaceStart;
    state.replaceEnd = context.replaceEnd;
    state.selectedIndex = 0;
    state.items = [];
    state.list.innerHTML = '';

    suggestions.forEach((entry, index) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'editor-autocomplete-item';
        button.dataset.insertText = entry.insertText;
        button.dataset.cursorOffset = String(entry.cursorOffset ?? entry.insertText.length);
        button.dataset.index = String(index);
        button.innerHTML = `
            <span class="editor-autocomplete-label">${escapeHtml(entry.label)}</span>
            <span class="editor-autocomplete-kind">${escapeHtml(entry.kind)}</span>
        `;

        button.addEventListener('mousedown', (event) => {
            // Keep textarea focus so cursor state remains stable while picking a suggestion.
            event.preventDefault();
        });
        button.addEventListener('click', () => {
            applySuggestion(index);
        });

        state.list.appendChild(button);
        state.items.push(button);
    });

    updateSelectedItem();
    state.popup.classList.remove('hidden');
    positionPopup(input, context.replaceEnd);
};

const moveSelection = (direction) => {
    if (!state.items.length) return;
    const lastIndex = state.items.length - 1;
    if (direction > 0) state.selectedIndex = state.selectedIndex >= lastIndex ? 0 : state.selectedIndex + 1;
    if (direction < 0) state.selectedIndex = state.selectedIndex <= 0 ? lastIndex : state.selectedIndex - 1;
    updateSelectedItem();
};

const wrapSelectionWithPair = (input, openChar, closeChar) => {
    const value = String(input.value || '');
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const selectedText = value.slice(start, end);
    input.value = `${value.slice(0, start)}${openChar}${selectedText}${closeChar}${value.slice(end)}`;

    if (start === end) {
        const caret = start + 1;
        input.selectionStart = caret;
        input.selectionEnd = caret;
    } else {
        input.selectionStart = start + 1;
        input.selectionEnd = end + 1;
    }

    notifyEditorChanged(input, true);
};

const shouldIgnoreAutocompleteKey = (event) => event.ctrlKey || event.metaKey || event.altKey;

const ensureInitialized = () => {
    if (state.initialized) return;
    ensurePopup();

    const input = getCodeInput();
    if (!input) return;
    const wrapper = getCodeWrapper();

    input.addEventListener('blur', () => {
        // Delayed hide lets click handlers on suggestion rows run before closing.
        window.setTimeout(() => hideAutocomplete(), 100);
    });

    wrapper?.addEventListener('scroll', () => hideAutocomplete());

    document.addEventListener('pointerdown', (event) => {
        if (!state.popup || state.popup.classList.contains('hidden')) return;
        const target = event.target;
        if (!(target instanceof Node)) {
            hideAutocomplete();
            return;
        }
        if (state.popup.contains(target)) return;
        if (input.contains(target)) return;
        hideAutocomplete();
    });

    state.initialized = true;
};

const handleInput = () => {
    ensureInitialized();
    const input = getCodeInput();
    if (!input) return;

    if (!isJavaScriptMode() || input.readOnly) {
        hideAutocomplete();
        return;
    }

    if (state.suppressNextInputRefresh) {
        state.suppressNextInputRefresh = false;
        return;
    }

    const context = buildContextFromInput(input);
    if (!context) {
        hideAutocomplete();
        return;
    }

    let suggestions = [];
    if (context.kind === 'delimiter') {
        suggestions = [DELIMITER_SUGGESTION];
    } else if (context.kind === 'member') {
        suggestions = buildMemberSuggestions(context.prefix, context.qualifier);
    } else {
        suggestions = buildWordSuggestions(input.value, context.prefix);
    }

    if (!suggestions.length) {
        hideAutocomplete();
        return;
    }

    renderSuggestions(suggestions, context, input);
};

const handleKeydown = (event) => {
    ensureInitialized();
    const input = getCodeInput();
    if (!input || input.readOnly) return false;

    const popupIsVisible = !!(state.popup && !state.popup.classList.contains('hidden'));
    if (popupIsVisible) {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveSelection(1);
            return true;
        }
        if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(-1);
            return true;
        }
        if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)) {
            event.preventDefault();
            return applySuggestion(state.selectedIndex);
        }
        if (event.key === 'Escape') {
            event.preventDefault();
            hideAutocomplete();
            return true;
        }
    }

    if (shouldIgnoreAutocompleteKey(event)) return false;

    const openChar = event.key;
    if (AUTO_CLOSE_PAIRS[openChar]) {
        event.preventDefault();
        wrapSelectionWithPair(input, openChar, AUTO_CLOSE_PAIRS[openChar]);
        return true;
    }

    // If a closing bracket already exists at cursor, jump over it instead of duplicating.
    if (CLOSING_CHARS.has(event.key) && input.selectionStart === input.selectionEnd) {
        const cursor = input.selectionStart;
        const nextChar = String(input.value || '').charAt(cursor);
        if (nextChar === event.key) {
            event.preventDefault();
            input.selectionStart = cursor + 1;
            input.selectionEnd = cursor + 1;
            return true;
        }
    }

    return false;
};

export const editorAutocomplete = {
    init: ensureInitialized,
    handleInput,
    handleKeydown,
    hide: hideAutocomplete
};
