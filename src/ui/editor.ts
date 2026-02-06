// @ts-nocheck
import { DEFAULT_CODE } from '../core/config';
import { Lexer } from '../core/language';
import { ui } from './ui';

export const editor = {
    history: [DEFAULT_CODE], historyIdx: 0, timeout: null,
    refresh: () => { const text = document.getElementById('code-input').value; ui.renderCode(new Lexer(text).tokenize()); ui.updateLineNumbers(text); },
    handleInput: () => { 
        // Auto-grow logic to fix cursor issues
        editor.adjustHeight();
        editor.refresh(); 
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
