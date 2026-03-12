// @ts-nocheck
import { TokenType, Lexer } from '../core/language';

export const escapeHtml = (value) => String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export const classNameForTokenType = (type) => {
    switch(type) {
        case TokenType.KEYWORD: return 'tok-keyword';
        case TokenType.STRING: return 'tok-string';
        case TokenType.NUMBER: return 'tok-number';
        case TokenType.BOOLEAN: return 'tok-boolean';
        case TokenType.COMMENT: return 'tok-comment';
        case TokenType.OPERATOR: return 'tok-operator';
        case TokenType.PUNCTUATION: return 'tok-punctuation';
        default: return 'tok-ident';
    }
};

export const renderTemplateStringValue = (rawTemplateTokenValue) => {
    if (!(rawTemplateTokenValue.startsWith('`') && rawTemplateTokenValue.endsWith('`'))) {
        return escapeHtml(rawTemplateTokenValue);
    }
    const content = rawTemplateTokenValue.slice(1, -1);
    let html = '`';
    let index = 0;
    let textStart = 0;
    const appendRawText = (text) => { html += escapeHtml(text); };
    const appendExprHtml = (exprSource) => {
        html += '<span class="tok-punctuation">${</span>';
        const exprTokens = new Lexer(exprSource).tokenize();
        exprTokens.forEach((exprToken) => {
            if (exprToken.type === 'WHITESPACE') {
                html += escapeHtml(exprToken.value);
            } else {
                html += `<span class="${classNameForTokenType(exprToken.type)}">${escapeHtml(exprToken.value)}</span>`;
            }
        });
        html += '<span class="tok-punctuation">}</span>';
    };
    while (index < content.length) {
        if (content[index] === '$' && content[index + 1] === '{') {
            appendRawText(content.slice(textStart, index));
            index += 2;
            const exprStart = index;
            let depth = 1;
            while (index < content.length && depth > 0) {
                const char = content[index];
                if (char === "'" || char === '"' || char === '`') {
                    const quote = char;
                    index++;
                    while (index < content.length) {
                        if (content[index] === '\\') { index += 2; continue; }
                        if (content[index] === quote) { index++; break; }
                        index++;
                    }
                    continue;
                }
                if (char === '{') depth++;
                else if (char === '}') depth--;
                index++;
            }
            const exprSource = content.slice(exprStart, Math.max(exprStart, index - 1));
            appendExprHtml(exprSource);
            textStart = index;
            continue;
        }
        if (content[index] === '\\' && index + 1 < content.length) {
            index += 2;
            continue;
        }
        index++;
    }
    appendRawText(content.slice(textStart));
    html += '`';
    return html;
};

export const renderHtmlCode = (source) => {
    const text = String(source || '');
    let result = '';
    let index = 0;
    const len = text.length;
    const isNameStart = (char) => /[A-Za-z]/.test(char);
    const isNameChar = (char) => /[A-Za-z0-9:_-]/.test(char);
    const isWhitespace = (char) => /\s/.test(char);

    while (index < len) {
        if (text.startsWith('<!--', index)) {
            const end = text.indexOf('-->', index + 4);
            const next = end === -1 ? len : end + 3;
            result += `<span class="tok-comment">${escapeHtml(text.slice(index, next))}</span>`;
            index = next;
            continue;
        }
        if (text[index] !== '<') {
            const next = text.indexOf('<', index);
            const end = next === -1 ? len : next;
            result += `<span class="tok-html-text">${escapeHtml(text.slice(index, end))}</span>`;
            index = end;
            continue;
        }

        let close = index + 1;
        let quote = '';
        while (close < len) {
            const char = text[close];
            if (quote) {
                if (char === '\\') {
                    close += 2;
                    continue;
                }
                if (char === quote) quote = '';
                close++;
                continue;
            }
            if (char === '"' || char === '\'') {
                quote = char;
                close++;
                continue;
            }
            if (char === '>') break;
            close++;
        }
        if (close >= len) {
            result += `<span class="tok-html-text">${escapeHtml(text.slice(index))}</span>`;
            break;
        }

        const inside = text.slice(index + 1, close);
        let cursor = 0;
        result += '<span class="tok-html-punc">&lt;</span>';
        while (cursor < inside.length && isWhitespace(inside[cursor])) {
            result += escapeHtml(inside[cursor]);
            cursor++;
        }
        if (inside[cursor] === '/') {
            result += '<span class="tok-html-punc">/</span>';
            cursor++;
        }
        while (cursor < inside.length && isWhitespace(inside[cursor])) {
            result += escapeHtml(inside[cursor]);
            cursor++;
        }

        if (cursor < inside.length && isNameStart(inside[cursor])) {
            const start = cursor;
            cursor++;
            while (cursor < inside.length && isNameChar(inside[cursor])) cursor++;
            result += `<span class="tok-html-tag">${escapeHtml(inside.slice(start, cursor))}</span>`;
        }

        while (cursor < inside.length) {
            const char = inside[cursor];
            if (isWhitespace(char)) {
                result += escapeHtml(char);
                cursor++;
                continue;
            }
            if (char === '/') {
                result += '<span class="tok-html-punc">/</span>';
                cursor++;
                continue;
            }
            if (char === '=') {
                result += '<span class="tok-html-punc">=</span>';
                cursor++;
                continue;
            }
            if (char === '"' || char === '\'') {
                const q = char;
                let end = cursor + 1;
                while (end < inside.length) {
                    if (inside[end] === '\\') {
                        end += 2;
                        continue;
                    }
                    if (inside[end] === q) {
                        end++;
                        break;
                    }
                    end++;
                }
                result += `<span class="tok-html-string">${escapeHtml(inside.slice(cursor, end))}</span>`;
                cursor = end;
                continue;
            }
            const start = cursor;
            while (cursor < inside.length && !isWhitespace(inside[cursor]) && !['/', '=', '"', '\''].includes(inside[cursor])) cursor++;
            result += `<span class="tok-html-attr">${escapeHtml(inside.slice(start, cursor))}</span>`;
        }
        result += '<span class="tok-html-punc">&gt;</span>';
        index = close + 1;
    }
    return result;
};

export const renderCssCode = (source) => {
    const text = String(source || '');
    let result = '';
    let index = 0;
    let depth = 0;
    let mode = 'selector';
    const punct = new Set(['{', '}', ':', ';', ',', '(', ')']);
    const isWhitespace = (char) => /\s/.test(char);

    while (index < text.length) {
        if (text.startsWith('/*', index)) {
            const end = text.indexOf('*/', index + 2);
            const next = end === -1 ? text.length : end + 2;
            result += `<span class="tok-comment">${escapeHtml(text.slice(index, next))}</span>`;
            index = next;
            continue;
        }
        const char = text[index];
        if (char === '"' || char === '\'') {
            const q = char;
            let end = index + 1;
            while (end < text.length) {
                if (text[end] === '\\') {
                    end += 2;
                    continue;
                }
                if (text[end] === q) {
                    end++;
                    break;
                }
                end++;
            }
            result += `<span class="tok-css-string">${escapeHtml(text.slice(index, end))}</span>`;
            index = end;
            continue;
        }
        if (punct.has(char)) {
            result += `<span class="tok-css-punc">${escapeHtml(char)}</span>`;
            if (char === '{') {
                depth++;
                mode = 'property';
            } else if (char === '}') {
                depth = Math.max(0, depth - 1);
                mode = depth > 0 ? 'property' : 'selector';
            } else if (char === ':') {
                mode = 'value';
            } else if (char === ';') {
                mode = depth > 0 ? 'property' : 'selector';
            }
            index++;
            continue;
        }
        if (isWhitespace(char)) {
            result += escapeHtml(char);
            index++;
            continue;
        }
        let end = index;
        while (end < text.length) {
            const next = text[end];
            if (isWhitespace(next) || punct.has(next) || next === '"' || next === '\'' || text.startsWith('/*', end)) break;
            end++;
        }
        const token = text.slice(index, end);
        let cls = 'tok-css-value';
        if (mode === 'selector') cls = token.startsWith('@') ? 'tok-keyword' : 'tok-css-selector';
        else if (mode === 'property') cls = 'tok-css-property';
        else if (/^-?\d+(\.\d+)?(px|em|rem|vh|vw|%)?$/i.test(token)) cls = 'tok-number';
        result += `<span class="${cls}">${escapeHtml(token)}</span>`;
        index = end;
    }
    return result;
};
