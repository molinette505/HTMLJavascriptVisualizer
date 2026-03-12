// @ts-nocheck
// File purpose: template-literal parsing and incremental interpolation rendering logic.
import { Lexer, Parser, TokenType } from './language';

function templateTokenClass(type) {
    switch (type) {
        case TokenType.KEYWORD: return 'tok-keyword';
        case TokenType.STRING: return 'tok-string';
        case TokenType.NUMBER: return 'tok-number';
        case TokenType.BOOLEAN: return 'tok-boolean';
        case TokenType.COMMENT: return 'tok-comment';
        case TokenType.OPERATOR: return 'tok-operator';
        case TokenType.PUNCTUATION: return 'tok-punctuation';
        default: return 'tok-ident';
    }
}

function escapeTemplateHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseTemplateSegments(templateSource) {
    const segments = [];
    let index = 0;
    let textStart = 0;
    while (index < templateSource.length) {
        const current = templateSource[index];
        if (current === '\\' && index + 1 < templateSource.length) {
            index += 2;
            continue;
        }
        if (current === '$' && templateSource[index + 1] === '{') {
            if (textStart < index) {
                segments.push({ type: 'text', value: templateSource.slice(textStart, index) });
            }
            index += 2;
            const exprStart = index;
            let depth = 1;
            while (index < templateSource.length && depth > 0) {
                const char = templateSource[index];
                if (char === "'" || char === '"' || char === '`') {
                    const quote = char;
                    index++;
                    while (index < templateSource.length) {
                        if (templateSource[index] === '\\') { index += 2; continue; }
                        if (templateSource[index] === quote) { index++; break; }
                        index++;
                    }
                    continue;
                }
                if (char === '{') depth++;
                else if (char === '}') depth--;
                index++;
            }
            if (depth !== 0) throw new Error('Template literal invalide: ${...} non ferme');
            segments.push({ type: 'expr', source: templateSource.slice(exprStart, index - 1), value: '' });
            textStart = index;
            continue;
        }
        index++;
    }
    if (textStart < templateSource.length) {
        segments.push({ type: 'text', value: templateSource.slice(textStart) });
    }
    return segments;
}

function decodeTemplateText(text) {
    let value = '';
    for (let index = 0; index < text.length; index++) {
        const current = text[index];
        if (current === '\\' && index + 1 < text.length) {
            const escaped = text[index + 1];
            if (escaped === 'n') { value += '\n'; index++; continue; }
            if (escaped === 't') { value += '\t'; index++; continue; }
            value += escaped;
            index++;
            continue;
        }
        value += current;
    }
    return value;
}

function renderTemplateSegments(segments, includeUnresolvedExpr = false, decodeText = false) {
    return segments.map((segment) => {
        if (segment.type === 'text') return decodeText ? decodeTemplateText(segment.value) : segment.value;
        if (includeUnresolvedExpr && !segment.resolved) return `\${${segment.source}}`;
        return String(segment.value);
    }).join('');
}

function renderTemplateTokenMarkup(segments) {
    let html = '`';
    for (const segment of segments) {
        if (segment.type === 'text') {
            html += escapeTemplateHtml(segment.value);
            continue;
        }
        if (segment.resolved) {
            html += escapeTemplateHtml(String(segment.value));
            continue;
        }
        html += '<span class="tok-punctuation">${</span>';
        const exprTokens = segment.tokens || [];
        exprTokens.forEach((exprToken) => {
            if (exprToken.type === 'WHITESPACE') {
                html += escapeTemplateHtml(exprToken.value);
                return;
            }
            html += `<span id="${exprToken.id}" class="${templateTokenClass(exprToken.type)}">${escapeTemplateHtml(exprToken.value)}</span>`;
        });
        html += '<span class="tok-punctuation">}</span>';
    }
    html += '`';
    return html;
}

function setTemplateTokenContent(interpreter, tokenId, segments) {
    if (!tokenId) return;
    const markup = renderTemplateTokenMarkup(segments);
    if (typeof interpreter.ui.setTokenMarkup === 'function') {
        interpreter.ui.setTokenMarkup(tokenId, markup, true);
        return;
    }
    const plain = `\`${renderTemplateSegments(segments, true)}\``;
    interpreter.ui.setRawTokenText(tokenId, plain, true);
}

export async function evaluateTemplateExpression(interpreter, exprSource) {
    if (!exprSource.trim()) return '';
    const lexer = new Lexer(exprSource);
    const rawTokens = lexer.tokenize();
    const parser = new Parser(rawTokens);
    const ast = parser.parse();
    if (!ast.body || ast.body.length !== 1) throw new Error('Expression template invalide');
    return await interpreter.evaluate(ast.body[0]);
}

export async function evaluateTemplateLiteral(interpreter, templateSource, tokenId = null) {
    const segments = parseTemplateSegments(templateSource);
    segments.forEach((segment) => {
        if (segment.type !== 'expr') return;
        const exprLexer = new Lexer(segment.source);
        const exprRawTokens = exprLexer.tokenize();
        const exprParser = new Parser(exprRawTokens);
        const exprAst = exprParser.parse();
        if (!exprAst.body || exprAst.body.length !== 1) throw new Error('Expression template invalide');
        segment.tokens = exprRawTokens;
        segment.ast = exprAst.body[0];
        segment.resolved = false;
    });
    if (tokenId) {
        setTemplateTokenContent(interpreter, tokenId, segments);
    }
    for (const segment of segments) {
        if (segment.type !== 'expr') continue;
        const exprValue = await interpreter.evaluate(segment.ast);
        segment.value = exprValue;
        segment.resolved = true;
        if (tokenId) {
            setTemplateTokenContent(interpreter, tokenId, segments);
            await interpreter.ui.wait(400);
        }
    }
    return renderTemplateSegments(segments, false, true);
}
