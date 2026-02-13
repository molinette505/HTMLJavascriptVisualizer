import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  Lexer,
  Parser,
  VarDecl,
  MultiVarDecl,
  FunctionDecl,
  IfStmt,
  WhileStmt,
  DoWhileStmt,
  ForStmt,
  SwitchStmt,
  BreakStmt,
  BlockStmt,
  ReturnStmt,
  Assignment,
  BinaryExpr,
  CallExpr,
  UpdateExpr,
  MemberExpr,
  ArrayLiteral,
  NewExpr,
  ArrowFunctionExpr,
  FunctionExpression,
  ArgumentsNode,
  UnaryExpr,
  Identifier,
  Literal,
} from '../src/core/language';
import { Interpreter } from '../src/core/interpreter';

class TestInterpreter extends Interpreter {
  async pause() {
    return;
  }
}

const createMockUi = () => ({
  modifiedTokens: new Map(),
  lockedTokens: new Set(),
  skipMode: false,
  isStopping: false,
  speedMultiplier: 1,
  baseDelay: 0,
  currentWaitResolver: null,
  updateMemory: async () => {},
  renderCode: () => {},
  wait: async () => {},
  highlightLines: () => {},
  resetVisuals: () => {},
  log: () => {},
  setEventMode: () => {},
  setRunningState: () => {},
  resetDisplay: () => {},
  setStepButtonState: () => {},
  lockTokens: () => {},
  unlockTokens: () => {},
  animateAssignment: async () => {},
  animateRead: async () => {},
  animateReadHeader: async () => {},
  animateReturnHeader: async () => {},
  animateSpliceRead: async () => {},
  animateOperationCollapse: async () => {},
  animateReturnToCall: async () => {},
  animateParamPass: async () => {},
  animateArrayPop: async () => {},
  highlightArrayElements: async () => {},
  ensureDrawerOpen: async () => {},
  ensureVisible: () => {},
  replaceTokenText: () => {},
  setRawTokenText: () => {},
  setTokenMarkup: () => {},
  resetTokenText: () => {},
  consoleLog: async () => {},
  stopAnimations: () => {},
  toggleDrawer: () => {},
  switchTab: () => {},
  showMobileTools: () => {},
  hideMobileTools: () => {},
  toggleSubTool: () => {},
  renderSubToolbar: () => {},
  updateLineNumbers: () => {},
  syncScroll: () => {},
  scrollToLine: () => {},
  flyHelper: async () => {},
  visualizeIdentifier: async () => {},
});

const parseFirstNode = (code: string) => {
  const tokens = new Lexer(code).tokenize();
  return new Parser(tokens).parse().body[0];
};

const runProgram = async (code: string) => {
  const interpreter = new TestInterpreter(createMockUi() as any);
  await interpreter.start(code);
  return interpreter;
};

const getGlobalValue = (interpreter: TestInterpreter, variableName: string) => {
  return interpreter.globalScope.get(variableName).value;
};

describe('lexer/parser - coverage des noeuds', () => {
  it('tokenize puis parse une declaration simple', () => {
    const code = 'let a = 3;';
    const tokens = new Lexer(code).tokenize();
    expect(tokens.length).toBeGreaterThan(0);
    expect(new Parser(tokens).parse().body[0]).toBeInstanceOf(VarDecl);
  });

  it('parse les noeuds de declaration et controle', () => {
    expect(parseFirstNode('let a = 1;')).toBeInstanceOf(VarDecl);
    expect(parseFirstNode('let a = 1, b = 2;')).toBeInstanceOf(MultiVarDecl);
    expect(parseFirstNode('function f() { return 1; }')).toBeInstanceOf(FunctionDecl);
    expect(parseFirstNode('if (true) { let a = 1; } else { let a = 2; }')).toBeInstanceOf(IfStmt);
    expect(parseFirstNode('while (false) { break; }')).toBeInstanceOf(WhileStmt);
    expect(parseFirstNode('do { let a = 1; } while (false);')).toBeInstanceOf(DoWhileStmt);
    expect(parseFirstNode('for (let i = 0; i < 2; i++) { let a = i; }')).toBeInstanceOf(ForStmt);
    expect(parseFirstNode('switch (1) { case 1: break; default: break; }')).toBeInstanceOf(SwitchStmt);
    expect(parseFirstNode('break;')).toBeInstanceOf(BreakStmt);
    expect(parseFirstNode('{ let x = 1; }')).toBeInstanceOf(BlockStmt);
    expect(parseFirstNode('return 1;')).toBeInstanceOf(ReturnStmt);
  });

  it('parse les noeuds d expression', () => {
    expect(parseFirstNode('a = 1;')).toBeInstanceOf(Assignment);
    expect(parseFirstNode('1 + 2;')).toBeInstanceOf(BinaryExpr);
    expect(parseFirstNode('fn(1, 2);')).toBeInstanceOf(CallExpr);
    expect(parseFirstNode('counter++;')).toBeInstanceOf(UpdateExpr);
    expect(parseFirstNode('arr[0];')).toBeInstanceOf(MemberExpr);
    expect(parseFirstNode('[1, 2, 3];')).toBeInstanceOf(ArrayLiteral);
    expect(parseFirstNode('new Array(3);')).toBeInstanceOf(NewExpr);
    expect(parseFirstNode('a => a + 1;')).toBeInstanceOf(ArrowFunctionExpr);
    const functionExpressionDecl = parseFirstNode('let fn = function(a) { return a; };') as any;
    expect(functionExpressionDecl).toBeInstanceOf(VarDecl);
    expect(functionExpressionDecl.init).toBeInstanceOf(FunctionExpression);
    expect(parseFirstNode('(a, b);')).toBeInstanceOf(ArgumentsNode);
    expect(parseFirstNode('!true;')).toBeInstanceOf(UnaryExpr);
    expect(parseFirstNode('identifier;')).toBeInstanceOf(Identifier);
    expect(parseFirstNode('true;')).toBeInstanceOf(Literal);
  });
});

describe('interpreter - coverage des noeuds', () => {
  beforeEach(() => {
    (globalThis as any).document = {
      getElementById: () => null,
      querySelectorAll: () => [],
      createElement: () => ({
        classList: { add: () => {}, remove: () => {} },
        style: {},
        appendChild: () => {},
      }),
      body: { appendChild: () => {} },
      documentElement: { style: { setProperty: () => {} } },
    };
  });

  it('execute une initialisation arithmetique', async () => {
    const interpreter = await runProgram('let total = 1 + 2;');
    expect(getGlobalValue(interpreter, 'total')).toBe(3);
  });

  it('enregistre une fonction globale', async () => {
    const interpreter = await runProgram('function add() { return 1; }');
    expect(Boolean(interpreter.functions.add)).toBe(true);
  });

  it('execute if / while / break', async () => {
    const interpreter = await runProgram(`
      let n = 0;
      if (true) { n = 1; } else { n = 99; }
      while (true) {
        n++;
        if (n === 3) { break; }
      }
    `);
    expect(getGlobalValue(interpreter, 'n')).toBe(3);
  });

  it('execute do while et for', async () => {
    const interpreter = await runProgram(`
      let a = 0;
      do { a = a + 2; } while (a < 5);
      let sum = 0;
      for (let i = 0; i < 4; i++) { sum += i; }
    `);
    expect(getGlobalValue(interpreter, 'a')).toBe(6);
    expect(getGlobalValue(interpreter, 'sum')).toBe(6);
  });

  it('execute switch case et default', async () => {
    const interpreter = await runProgram(`
      let key = 9;
      let output = 0;
      switch (key) {
        case 1:
          output = 10;
          break;
        case 2:
          output = 20;
          break;
        default:
          output = 30;
      }
    `);
    expect(getGlobalValue(interpreter, 'output')).toBe(30);
  });

  it('execute arrow function et function expression', async () => {
    const interpreter = await runProgram(`
      let add = (x, y) => x + y;
      let total = add(2, 3);
      let mul = function(x, y) { return x * y; };
      let result = mul(3, 4);
    `);
    expect(getGlobalValue(interpreter, 'total')).toBe(5);
    expect(getGlobalValue(interpreter, 'result')).toBe(12);
  });

  it('execute arrays, member access et methodes', async () => {
    const interpreter = await runProgram(`
      let arr = [1, 2];
      arr.push(3);
      let popped = arr.pop();
      let firstRemoved = arr.shift();
      let newLength = arr.unshift(7, 8);
      arr[0] = 9;
      let first = arr[0];
      let len = arr.length;
    `);
    expect(getGlobalValue(interpreter, 'popped')).toBe(3);
    expect(getGlobalValue(interpreter, 'firstRemoved')).toBe(1);
    expect(getGlobalValue(interpreter, 'newLength')).toBe(3);
    expect(getGlobalValue(interpreter, 'first')).toBe(9);
    expect(getGlobalValue(interpreter, 'len')).toBe(3);
    expect(getGlobalValue(interpreter, 'arr')).toEqual([9, 8, 2]);
  });

  it('partage la meme reference entre deux variables array', async () => {
    const interpreter = await runProgram(`
      let a = [10, 20];
      let b = a;
      b[0] = 99;
      b.push(30);
      let fromA = a[0];
      let lenA = a.length;
    `);
    const aValue = getGlobalValue(interpreter, 'a');
    const bValue = getGlobalValue(interpreter, 'b');
    expect(aValue).toBe(bValue);
    expect(getGlobalValue(interpreter, 'fromA')).toBe(99);
    expect(getGlobalValue(interpreter, 'lenA')).toBe(3);
    expect(aValue).toEqual([99, 20, 30]);
  });

  it('gere les tableaux multi dimensionnels', async () => {
    const interpreter = await runProgram(`
      let matrix = [[1, 2], [3, 4]];
      matrix[1][0] = 30;
      let alias = matrix;
      alias[0] = [0, 1, 2];
      let read = matrix[0][1];
    `);
    expect(getGlobalValue(interpreter, 'read')).toBe(1);
    expect(getGlobalValue(interpreter, 'matrix')).toEqual([[0, 1, 2], [30, 4]]);
    expect(getGlobalValue(interpreter, 'alias')).toBe(getGlobalValue(interpreter, 'matrix'));
  });

  it('gere les trous de tableau quand un index depasse la taille', async () => {
    const interpreter = await runProgram(`
      let arr = [1];
      arr[4] = 9;
      let len = arr.length;
      let hole = arr[2];
    `);
    const arrValue = getGlobalValue(interpreter, 'arr');
    expect(getGlobalValue(interpreter, 'len')).toBe(5);
    expect(getGlobalValue(interpreter, 'hole')).toBeUndefined();
    expect(arrValue[4]).toBe(9);
    expect(Object.prototype.hasOwnProperty.call(arrValue, 1)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(arrValue, 2)).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(arrValue, 3)).toBe(false);
  });

  it('execute les methodes de strings enseignees', async () => {
    const interpreter = await runProgram(`
      let brut = "  bonjour victor  ";
      let trimmed = brut.trim();
      let upper = trimmed.toUpperCase();
      let replaced = upper.replace("VICTOR", "CLASSE");
      let hasBonjour = replaced.includes("BONJOUR");
      let part = replaced.slice(0, 7);
      let len = replaced.length;
    `);
    expect(getGlobalValue(interpreter, 'trimmed')).toBe('bonjour victor');
    expect(getGlobalValue(interpreter, 'upper')).toBe('BONJOUR VICTOR');
    expect(getGlobalValue(interpreter, 'replaced')).toBe('BONJOUR CLASSE');
    expect(getGlobalValue(interpreter, 'hasBonjour')).toBe(true);
    expect(getGlobalValue(interpreter, 'part')).toBe('BONJOUR');
    expect(getGlobalValue(interpreter, 'len')).toBe(14);
  });

  it('execute array.slice sans modifier le tableau original', async () => {
    const interpreter = await runProgram(`
      let arr = [1, 2, 3, 4];
      let sub = arr.slice(1, 3);
      let first = arr[0];
      let len = arr.length;
    `);
    expect(getGlobalValue(interpreter, 'sub')).toEqual([2, 3]);
    expect(getGlobalValue(interpreter, 'arr')).toEqual([1, 2, 3, 4]);
    expect(getGlobalValue(interpreter, 'first')).toBe(1);
    expect(getGlobalValue(interpreter, 'len')).toBe(4);
  });

  it('execute les template literals avec interpolation ${}', async () => {
    const interpreter = await runProgram(`
      let prenom = "Julien";
      let texte = "JS";
      let msg = \`Bonjour \${prenom}, cours de \${texte.toUpperCase()}!\`;
      let count = \`Longueur: \${msg.length}\`;
    `);
    expect(getGlobalValue(interpreter, 'msg')).toBe('Bonjour Julien, cours de JS!');
    expect(getGlobalValue(interpreter, 'count')).toBe('Longueur: 28');
  });

  it('visualise le remplacement progressif des ${} dans un template literal', async () => {
    const ui = createMockUi() as any;
    ui.setTokenMarkup = vi.fn();
    const interpreter = new TestInterpreter(ui);
    await interpreter.start(`
      let prenom = "Julien";
      let msg = \`Bonjour \${prenom}\`;
    `);
    const markupValues = ui.setTokenMarkup.mock.calls.map((call: any[]) => call[1]);
    expect(markupValues.some((markup: string) => markup.includes('${') && markup.includes('prenom'))).toBe(true);
    expect(markupValues.some((markup: string) => markup.includes('Julien'))).toBe(true);
  });

  it('execute new Array, unary, update et operateurs logiques', async () => {
    const interpreter = await runProgram(`
      let arr = new Array(3);
      let arrLen = arr.length;
      let value = 1;
      let pre = ++value;
      let post = value++;
      let neg = -5;
      let pos = +7;
      let boolNot = !false;
      let andExpr = true && false;
      let orExpr = false || true;
    `);
    expect(getGlobalValue(interpreter, 'arrLen')).toBe(3);
    expect(getGlobalValue(interpreter, 'pre')).toBe(2);
    expect(getGlobalValue(interpreter, 'post')).toBe(2);
    expect(getGlobalValue(interpreter, 'value')).toBe(3);
    expect(getGlobalValue(interpreter, 'neg')).toBe(-5);
    expect(getGlobalValue(interpreter, 'pos')).toBe(7);
    expect(getGlobalValue(interpreter, 'boolNot')).toBe(true);
    expect(getGlobalValue(interpreter, 'andExpr')).toBe(false);
    expect(getGlobalValue(interpreter, 'orExpr')).toBe(true);
  });

  it('execute parseInt et Math.*', async () => {
    const interpreter = await runProgram(`
      let parsed = parseInt("12.9");
      let rounded = Math.floor(3.8);
    `);
    expect(getGlobalValue(interpreter, 'parsed')).toBe(12);
    expect(getGlobalValue(interpreter, 'rounded')).toBe(3);
  });
});
