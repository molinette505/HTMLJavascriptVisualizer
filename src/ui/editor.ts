// @ts-nocheck
// File purpose: editor interactions (history, shortcuts, token rendering triggers).
import { DEFAULT_CODE } from '../core/config';
import { Lexer } from '../core/language';
import { ui } from './ui';
import { editorAutocomplete } from './editorAutocomplete';

export const editor = {
    history: [DEFAULT_CODE], historyIdx: 0, timeout: null,
    tabString: '    ',
    refresh: () => {
        const text = document.getElementById('code-input').value;
        const mode = (window.app && typeof window.app.getCurrentEditorMode === 'function')
            ? window.app.getCurrentEditorMode()
            : 'js';
        if (mode === 'js') ui.renderCode(new Lexer(text).tokenize());
        else {
            ui.renderPlainCode(text, mode);
            editorAutocomplete.hide();
        }
        ui.updateLineNumbers(text);
    },
    handleInput: () => { 
        // Auto-grow logic to fix cursor issues
        editor.adjustHeight();
        if (window.app && typeof window.app.onEditorInput === 'function') {
            window.app.onEditorInput(document.getElementById('code-input').value);
        }
        editor.refresh(); 
        // Keep autocomplete synchronized with latest text/caret after every input update.
        editorAutocomplete.handleInput();
        if (editor.timeout) clearTimeout(editor.timeout); 
        editor.timeout = setTimeout(() => editor.saveHistory(), 500); 
    },
    adjustHeight: () => {
        const input = document.getElementById('code-input');
        const display = document.getElementById('code-display');
        const highlight = document.getElementById('highlight-layer');
        
        // Reset height to shrink if needed
        input.style.height = 'auto'; 
        
        // Set new height based on scrollHeight
        const newHeight = input.scrollHeight + 'px';
        input.style.height = newHeight;
        display.style.height = newHeight;
        highlight.style.height = newHeight;
    },
    handleScroll: () => { ui.syncScroll(); },
    saveHistory: () => { const val = document.getElementById('code-input').value; if (editor.history[editor.historyIdx] !== val) { editor.history = editor.history.slice(0, editor.historyIdx + 1); editor.history.push(val); editor.historyIdx++; } },
    undo: (e) => { if(e) {e.preventDefault(); e.stopPropagation();} if (editor.historyIdx > 0) { editor.historyIdx--; document.getElementById('code-input').value = editor.history[editor.historyIdx]; editor.handleInput(); } },
    redo: (e) => { if(e) {e.preventDefault(); e.stopPropagation();} if (editor.historyIdx < editor.history.length - 1) { editor.historyIdx++; document.getElementById('code-input').value = editor.history[editor.historyIdx]; editor.handleInput(); } },
    hasMultilineSelection: () => {
        const input = document.getElementById('code-input');
        if (!input) return false;
        const start = input.selectionStart;
        const end = input.selectionEnd;
        if (start === end) return false;
        const value = input.value || '';
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        const lineEndCandidate = value.indexOf('\n', end);
        const lineEnd = lineEndCandidate === -1 ? value.length : lineEndCandidate;
        const selectedBlock = value.slice(lineStart, lineEnd);
        return selectedBlock.includes('\n');
    },
    indentSelection: () => {
        const input = document.getElementById('code-input');
        if (!input) return;
        const value = input.value || '';
        const selectionStart = input.selectionStart;
        const selectionEnd = input.selectionEnd;
        if (selectionStart === selectionEnd) {
            editor.insertText(editor.tabString);
            return;
        }
        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const lineEndCandidate = value.indexOf('\n', selectionEnd);
        const lineEnd = lineEndCandidate === -1 ? value.length : lineEndCandidate;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split('\n');
        const indented = lines.map((line) => `${editor.tabString}${line}`).join('\n');
        input.value = `${value.slice(0, lineStart)}${indented}${value.slice(lineEnd)}`;
        input.selectionStart = selectionStart + editor.tabString.length;
        input.selectionEnd = selectionEnd + (lines.length * editor.tabString.length);
        editor.handleInput();
        editor.saveHistory();
    },
    outdentSelection: () => {
        const input = document.getElementById('code-input');
        if (!input) return;
        const value = input.value || '';
        const selectionStart = input.selectionStart;
        const selectionEnd = input.selectionEnd;
        const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
        const lineEndCandidate = value.indexOf('\n', selectionEnd);
        const lineEnd = lineEndCandidate === -1 ? value.length : lineEndCandidate;
        const block = value.slice(lineStart, lineEnd);
        const lines = block.split('\n');
        const removedPerLine = [];
        const outdentedLines = lines.map((line) => {
            if (line.startsWith('\t')) {
                removedPerLine.push(1);
                return line.slice(1);
            }
            const spacesMatch = line.match(/^ {1,4}/);
            const removed = spacesMatch ? spacesMatch[0].length : 0;
            removedPerLine.push(removed);
            return line.slice(removed);
        });
        input.value = `${value.slice(0, lineStart)}${outdentedLines.join('\n')}${value.slice(lineEnd)}`;
        const removedBeforeSelection = Math.min(removedPerLine[0] || 0, selectionStart - lineStart);
        const totalRemoved = removedPerLine.reduce((sum, amount) => sum + amount, 0);
        input.selectionStart = Math.max(lineStart, selectionStart - removedBeforeSelection);
        input.selectionEnd = Math.max(input.selectionStart, selectionEnd - totalRemoved);
        editor.handleInput();
        editor.saveHistory();
    },
    
    // Insert text helper
    insertText: (text, cursorOffset = false, stopProp = false, evt = null) => {
        const activeEvent = evt || window.event;
        if(stopProp && activeEvent) {
            activeEvent.preventDefault();
            activeEvent.stopPropagation();
        }
        
        const input = document.getElementById('code-input');
        input.focus();
        
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const val = input.value;
        
        input.value = val.substring(0, start) + text + val.substring(end);
        
        // Move cursor inside braces/parens if requested
        let newPos = start + text.length;
        if(cursorOffset && text.length > 1) {
            newPos = start + (text.length / 2); // Assume symmetric like {} or []
        }
        
        input.selectionStart = input.selectionEnd = newPos;
        editor.handleInput();
        editor.saveHistory();
    }
};
