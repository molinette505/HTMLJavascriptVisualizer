const DEFAULT_CODE = `// Démo Événements
function onClick() {
  console.log("Clic détecté !");
  counter = counter + 1;
}

let counter = 0;
console.log("Programme prêt.");
// Cliquez sur le bouton "souris" 
// une fois le code terminé.`;

const formatValue = (val) => {
    if (typeof val === 'number') return Number.isInteger(val) ? val : parseFloat(val.toFixed(4));
    if (Array.isArray(val)) return `[${val.map(v => JSON.stringify(v)).join(', ')}]`;
    if (typeof val === 'object' && val !== null && (val.type === 'arrow_func' || val.type === 'function_expr')) return `f (${val.params.join(',')})`;
    return val;
};

const TokenType={KEYWORD:'KEYWORD',IDENTIFIER:'IDENTIFIER',NUMBER:'NUMBER',STRING:'STRING',OPERATOR:'OPERATOR',PUNCTUATION:'PUNCTUATION',COMMENT:'COMMENT',EOF:'EOF',BOOLEAN:'BOOLEAN'};
const KEYWORDS=['let','const','var','if','else','while','for','do','function','return','switch','case','break','default','new'];
class Token{constructor(type,value,line,id=null){this.type=type;this.value=value;this.line=line;this.id=id||`tok-${Math.random().toString(36).substr(2,9)}`;}}
class Lexer{constructor(input){this.input=input;this.pos=0;this.line=1;this.tokens=[];}tokenize(){while(this.pos<this.input.length){const char=this.input[this.pos];const next=this.input[this.pos+1]||'';if(/\s/.test(char)){if(char==='\n')this.line++;this.tokens.push(new Token('WHITESPACE',char,this.line));this.pos++;continue;}if(char==='/'&&next==='/'){let val='//';this.pos+=2;while(this.pos<this.input.length&&this.input[this.pos]!=='\n'){val+=this.input[this.pos++];}this.tokens.push(new Token(TokenType.COMMENT,val,this.line));continue;}if(char==='/'&&next==='*'){let val='/*';this.pos+=2;while(this.pos<this.input.length-1&&!(this.input[this.pos]==='*'&&this.input[this.pos+1]==='/')){if(this.input[this.pos]==='\n')this.line++;val+=this.input[this.pos++];}if(this.pos<this.input.length-1){val+='*/';this.pos+=2;}this.tokens.push(new Token(TokenType.COMMENT,val,this.line));continue;}if(/[0-9]/.test(char)){let val='';while(this.pos<this.input.length&&/[0-9.]/.test(this.input[this.pos])){val+=this.input[this.pos++];}this.tokens.push(new Token(TokenType.NUMBER,parseFloat(val),this.line));continue;}if(/[a-zA-Z_$]/.test(char)){let val='';while(this.pos<this.input.length&&/[a-zA-Z0-9_$]/.test(this.input[this.pos])){val+=this.input[this.pos++];}if(KEYWORDS.includes(val))this.tokens.push(new Token(TokenType.KEYWORD,val,this.line));else if(['true','false'].includes(val))this.tokens.push(new Token(TokenType.BOOLEAN,val==='true',this.line));else this.tokens.push(new Token(TokenType.IDENTIFIER,val,this.line));continue;}if(char==='"'||char==="'"){let val=char;const quote=char;this.pos++;while(this.pos<this.input.length&&this.input[this.pos]!==quote){val+=this.input[this.pos++];}if(this.pos<this.input.length){val+=this.input[this.pos];this.pos++;}this.tokens.push(new Token(TokenType.STRING,val,this.line));continue;}if(['=','+','-','*','/','>','<','!','&','|','%'].includes(char)){const nextNext=this.input[this.pos+2]||'';if(['===','!=='].includes(char+next+nextNext)){this.tokens.push(new Token(TokenType.OPERATOR,char+next+nextNext,this.line));this.pos+=3;continue;}if(['==','!=','<=','>=','&&','||','++','--','+=','-=','*=','/=','=>'].includes(char+next)){this.tokens.push(new Token(TokenType.OPERATOR,char+next,this.line));this.pos+=2;}else{this.tokens.push(new Token(TokenType.OPERATOR,char,this.line));this.pos++;}continue;}if(['(',')','{','}','[',']',';',',',':','.'].includes(char)){this.tokens.push(new Token(TokenType.PUNCTUATION,char,this.line));this.pos++;continue;}this.tokens.push(new Token('UNKNOWN',char,this.line));this.pos++;}return this.tokens;}}
class ASTNode{constructor(line){this.line=line;this.domIds=[];}}
class Program extends ASTNode{constructor(){super(0);this.body=[];}}
class VarDecl extends ASTNode{constructor(kind,name,init,line){super(line);this.kind=kind;this.name=name;this.init=init;}}
class MultiVarDecl extends ASTNode{constructor(decls,line){super(line);this.decls=decls;}}
class FunctionDecl extends ASTNode{constructor(name,params,body,line){super(line);this.name=name;this.params=params;this.body=body;}}
class Assignment extends ASTNode{constructor(left,value,line){super(line);this.left=left;this.value=value;}}
class BinaryExpr extends ASTNode{constructor(left,op,right,line){super(line);this.left=left;this.op=op;this.right=right;}}
class CallExpr extends ASTNode{constructor(callee,args,line){super(line);this.callee=callee;this.args=args;}}
class IfStmt extends ASTNode{constructor(test,consequent,alternate,line){super(line);this.test=test;this.consequent=consequent;this.alternate=alternate;}}
class WhileStmt extends ASTNode{constructor(test,body,line){super(line);this.test=test;this.body=body;}}
class DoWhileStmt extends ASTNode{constructor(body,test,line){super(line);this.body=body;this.test=test;}}
class ForStmt extends ASTNode{constructor(init,test,update,body,line){super(line);this.init=init;this.test=test;this.update=update;this.body=body;}}
class SwitchStmt extends ASTNode{constructor(discriminant,cases,line){super(line);this.discriminant=discriminant;this.cases=cases;}}
class SwitchCase extends ASTNode{constructor(test,consequent,line){super(line);this.test=test;this.consequent=consequent;}}
class BreakStmt extends ASTNode{constructor(line){super(line);}}
class BlockStmt extends ASTNode{constructor(body,line){super(line);this.body=body;}}
class ReturnStmt extends ASTNode{constructor(arg,line){super(line);this.argument=arg;}}
class Literal extends ASTNode{constructor(value,line){super(line);this.value=value;}}
class Identifier extends ASTNode{constructor(name,line){super(line);this.name=name;}}
class UpdateExpr extends ASTNode{constructor(op,arg,prefix,line){super(line);this.op=op;this.arg=arg;this.prefix=prefix;}}
class MemberExpr extends ASTNode{constructor(object,property,computed,line){super(line);this.object=object;this.property=property;this.computed=computed;}}
class ArrayLiteral extends ASTNode{constructor(elements,line){super(line);this.elements=elements;}}
class NewExpr extends ASTNode{constructor(callee,args,line){super(line);this.callee=callee;this.args=args;}}
class ArrowFunctionExpr extends ASTNode{constructor(params,body,line){super(line);this.params=params;this.body=body;}}
class FunctionExpression extends ASTNode{constructor(name,params,body,line){super(line);this.name=name;this.params=params;this.body=body;}}
class ArgumentsNode extends ASTNode{constructor(args,line){super(line);this.args=args;}}
class UnaryExpr extends ASTNode{constructor(op,arg,line){super(line);this.op=op;this.arg=arg;}}

class Parser{constructor(tokens){this.tokens=tokens.filter(t=>t.type!=='WHITESPACE'&&t.type!=='COMMENT');this.current=0;}parse(){const program=new Program();while(!this.isAtEnd()){program.body.push(this.statement());}return program;}statement(){if(this.match(TokenType.KEYWORD)){const val=this.previous().value;if(['let','const','var'].includes(val))return this.varDecl();if(val==='function')return this.funcDecl();if(val==='if')return this.ifStmt();if(val==='while')return this.whileStmt();if(val==='do')return this.doWhileStmt();if(val==='for')return this.forStmt();if(val==='switch')return this.switchStmt();if(val==='break')return this.breakStmt();if(val==='return')return this.returnStmt();this.current--;}if(this.match(TokenType.PUNCTUATION,'{'))return this.block();return this.exprStmt();}block(){const line=this.previous().line;const stmts=[];while(!this.check(TokenType.PUNCTUATION,'}')&&!this.isAtEnd())stmts.push(this.statement());this.consume(TokenType.PUNCTUATION,'}');return new BlockStmt(stmts,line);}varDecl(){const kind=this.previous().value;const decls=[];do{const nameToken=this.consume(TokenType.IDENTIFIER);let init=null;if(this.match(TokenType.OPERATOR,'=')){init=this.expression();}const node=new VarDecl(kind,nameToken.value,init,nameToken.line);node.nameTokenId=nameToken.id;decls.push(node);}while(this.match(TokenType.PUNCTUATION,','));if(this.check(TokenType.PUNCTUATION,';')){this.consume(TokenType.PUNCTUATION,';');}if(decls.length===1)return decls[0];return new MultiVarDecl(decls,decls[0].line);}funcDecl(){const nameToken=this.consume(TokenType.IDENTIFIER);this.consume(TokenType.PUNCTUATION,'(');const params=[];if(!this.check(TokenType.PUNCTUATION,')')){do{params.push({name:this.consume(TokenType.IDENTIFIER).value,id:this.previous().id});}while(this.match(TokenType.PUNCTUATION,','));}this.consume(TokenType.PUNCTUATION,')');this.consume(TokenType.PUNCTUATION,'{');const body=this.block();return new FunctionDecl(nameToken.value,params,body,nameToken.line);}ifStmt(){const line=this.previous().line;this.consume(TokenType.PUNCTUATION,'(');const test=this.expression();this.consume(TokenType.PUNCTUATION,')');const cons=this.statement();let alt=null;if(this.match(TokenType.KEYWORD,'else'))alt=this.statement();return new IfStmt(test,cons,alt,line);}whileStmt(){const line=this.previous().line;this.consume(TokenType.PUNCTUATION,'(');const test=this.expression();this.consume(TokenType.PUNCTUATION,')');const body=this.statement();return new WhileStmt(test,body,line);}doWhileStmt(){const line=this.previous().line;const body=this.statement();this.consume(TokenType.KEYWORD,'while');this.consume(TokenType.PUNCTUATION,'(');const test=this.expression();this.consume(TokenType.PUNCTUATION,')');if(this.check(TokenType.PUNCTUATION,';')){this.consume(TokenType.PUNCTUATION,';');}return new DoWhileStmt(body,test,line);}forStmt(){const line=this.previous().line;this.consume(TokenType.PUNCTUATION,'(');let init=null;if(!this.check(TokenType.PUNCTUATION,';')){if(this.match(TokenType.KEYWORD,['let','const','var'])){init=this.varDecl();}else{init=this.exprStmt();}}else{this.consume(TokenType.PUNCTUATION,';');}let test=null;if(!this.check(TokenType.PUNCTUATION,';'))test=this.expression();this.consume(TokenType.PUNCTUATION,';');let update=null;if(!this.check(TokenType.PUNCTUATION,')'))update=this.expression();this.consume(TokenType.PUNCTUATION,')');const body=this.statement();return new ForStmt(init,test,update,body,line);}breakStmt(){const line=this.previous().line;if(this.check(TokenType.PUNCTUATION,';')){this.consume(TokenType.PUNCTUATION,';');}return new BreakStmt(line);}switchStmt(){const line=this.previous().line;this.consume(TokenType.PUNCTUATION,'(');const disc=this.expression();this.consume(TokenType.PUNCTUATION,')');this.consume(TokenType.PUNCTUATION,'{');const cases=[];while(!this.check(TokenType.PUNCTUATION,'}')&&!this.isAtEnd()){if(this.match(TokenType.KEYWORD,'case')){const cLine=this.previous().line;const test=this.expression();this.consume(TokenType.PUNCTUATION,':');const cons=[];while(!this.check(TokenType.KEYWORD,['case','default'])&&!this.check(TokenType.PUNCTUATION,'}')&&!this.isAtEnd())cons.push(this.statement());cases.push(new SwitchCase(test,cons,cLine));}else if(this.match(TokenType.KEYWORD,'default')){const cLine=this.previous().line;this.consume(TokenType.PUNCTUATION,':');const cons=[];while(!this.check(TokenType.KEYWORD,['case','default'])&&!this.check(TokenType.PUNCTUATION,'}')&&!this.isAtEnd())cons.push(this.statement());cases.push(new SwitchCase(null,cons,cLine));}}this.consume(TokenType.PUNCTUATION,'}');return new SwitchStmt(disc,cases,line);}returnStmt(){const keyword=this.previous();const line=keyword.line;let val=null;let domIds=[keyword.id];if(!this.check(TokenType.PUNCTUATION,';')&&!this.check(TokenType.PUNCTUATION,'}')){val=this.expression();domIds.push(...val.domIds);}if(this.check(TokenType.PUNCTUATION,';')){const semi=this.consume(TokenType.PUNCTUATION,';');domIds.push(semi.id);}const node=new ReturnStmt(val,line);node.domIds=domIds;return node;}exprStmt(){const expr=this.expression();if(this.check(TokenType.PUNCTUATION,';')){this.consume(TokenType.PUNCTUATION,';');}return expr;}expression(){return this.assignment();}assignment(){const expr=this.arrow();if(this.match(TokenType.OPERATOR,['=','+=','-=','*=','/='])){const opToken=this.previous();const value=this.assignment();if(expr instanceof Identifier||expr instanceof MemberExpr){if(opToken.value==='='){const node=new Assignment(expr,value,expr.line);node.targetTokenId=(expr instanceof Identifier)?expr.domIds[0]:null;return node;}else{const binOp=opToken.value.charAt(0);const binExpr=new BinaryExpr(expr,binOp,value,expr.line);binExpr.domIds=[...expr.domIds,opToken.id,...value.domIds];const node=new Assignment(expr,binExpr,expr.line);node.targetTokenId=(expr instanceof Identifier)?expr.domIds[0]:null;return node;}}throw new Error("Invalid assignment target");}return expr;}arrow(){let expr=this.logicalOR();if(this.match(TokenType.OPERATOR,'=>')){const arrow=this.previous();const params=[];if(expr instanceof Identifier){params.push({name:expr.name,id:expr.tokenId||expr.domIds[0]});}else if(expr instanceof ArgumentsNode){expr.args.forEach(arg=>{if(arg instanceof Identifier){params.push({name:arg.name,id:arg.tokenId||arg.domIds[0]});}else throw new Error("Paramètre de fonction fléchée invalide");});}else if(expr instanceof Literal&&expr.value===undefined){}else{throw new Error("Syntaxe de fonction fléchée invalide");}let body;if(this.match(TokenType.PUNCTUATION,'{')){body=this.block();}else{body=this.expression();}const node=new ArrowFunctionExpr(params,body,expr.line);node.domIds=[...expr.domIds,arrow.id];return node;}return expr;}logicalOR(){return this.binary(['||'],this.logicalAND.bind(this));}logicalAND(){return this.binary(['&&'],this.equality.bind(this));}equality(){return this.binary(['==','!=','===','!=='],this.relational.bind(this));}relational(){return this.binary(['>','<','>=','<='],this.additive.bind(this));}additive(){return this.binary(['+','-'],this.multiplicative.bind(this));}multiplicative(){return this.binary(['*','/','%'],this.unary.bind(this));}unary(){if(this.match(TokenType.KEYWORD,'new')){const line=this.previous().line;const callee=this.primary();this.consume(TokenType.PUNCTUATION,'(');const args=[];if(!this.check(TokenType.PUNCTUATION,')')){do{args.push(this.expression());}while(this.match(TokenType.PUNCTUATION,','));}this.consume(TokenType.PUNCTUATION,')');return new NewExpr(callee,args,line);}if(this.match(TokenType.OPERATOR,['++','--'])){const op=this.previous();const right=this.unary();const node=new UpdateExpr(op.value,right,true,op.line);node.domIds=[op.id,...right.domIds];return node;}if(this.match(TokenType.OPERATOR,['!','-','+'])){const op=this.previous();const right=this.unary();const node=new UnaryExpr(op.value,right,op.line);node.domIds=[op.id,...right.domIds];return node;}return this.postfix();}postfix(){let expr=this.call();if(this.match(TokenType.OPERATOR,['++','--'])){const op=this.previous();const node=new UpdateExpr(op.value,expr,false,op.line);node.domIds=[...expr.domIds,op.id];expr=node;}return expr;}binary(ops,nextFn){let left=nextFn();while(this.match(TokenType.OPERATOR,ops)){const opToken=this.previous();const right=nextFn();const node=new BinaryExpr(left,opToken.value,right,left.line);node.domIds=[...left.domIds,opToken.id,...right.domIds];left=node;}return left;}call(){let expr=this.primary();while(true){if(this.match(TokenType.PUNCTUATION,'(')){const openParen=this.previous();const args=[];let domIds=[...expr.domIds,openParen.id];if(!this.check(TokenType.PUNCTUATION,')')){do{if(args.length>0){const comma=this.consume(TokenType.PUNCTUATION,',');domIds.push(comma.id);}const arg=this.expression();args.push(arg);domIds.push(...arg.domIds);}while(this.check(TokenType.PUNCTUATION,','));}const closeParen=this.consume(TokenType.PUNCTUATION,')');domIds.push(closeParen.id);const node=new CallExpr(expr,args,expr.line);node.domIds=domIds;expr=node;}else if(this.match(TokenType.PUNCTUATION,'.')){const dot=this.previous();const id=this.consume(TokenType.IDENTIFIER);if(expr instanceof Identifier&&(expr.name==='Math'||expr.name==='console')){const oldId=expr.domIds;expr=new Identifier(`${expr.name}.${id.value}`,expr.line);expr.domIds=[...oldId,dot.id,id.id];}else{const obj=expr;expr=new MemberExpr(obj,new Literal(id.value,id.line),false,id.line);expr.domIds=[...obj.domIds,dot.id,id.id];}}else if(this.match(TokenType.PUNCTUATION,'[')){const openBracket=this.previous();const prop=this.expression();const closeBracket=this.consume(TokenType.PUNCTUATION,']');expr=new MemberExpr(expr,prop,true,openBracket.line);expr.domIds=[...expr.object.domIds,openBracket.id,...prop.domIds,closeBracket.id];}else{break;}}return expr;}primary(){if(this.match(TokenType.KEYWORD,'function')){const line=this.previous().line;let name=null;if(this.check(TokenType.IDENTIFIER)){name=this.consume(TokenType.IDENTIFIER).value;}this.consume(TokenType.PUNCTUATION,'(');const params=[];if(!this.check(TokenType.PUNCTUATION,')')){do{params.push({name:this.consume(TokenType.IDENTIFIER).value,id:this.previous().id});}while(this.match(TokenType.PUNCTUATION,','));}this.consume(TokenType.PUNCTUATION,')');this.consume(TokenType.PUNCTUATION,'{');const body=this.block();return new FunctionExpression(name,params,body,line);}if(this.match(TokenType.PUNCTUATION,'[')){const openBracket=this.previous();const elements=[];const domIds=[openBracket.id];if(!this.check(TokenType.PUNCTUATION,']')){do{if(elements.length>0){const comma=this.consume(TokenType.PUNCTUATION,',');domIds.push(comma.id);}const el=this.expression();elements.push(el);domIds.push(...el.domIds);}while(this.check(TokenType.PUNCTUATION,','));}const closeBracket=this.consume(TokenType.PUNCTUATION,']');domIds.push(closeBracket.id);const node=new ArrayLiteral(elements,openBracket.line);node.domIds=domIds;return node;}if(this.match(TokenType.NUMBER)){const t=this.previous();const node=new Literal(t.value,t.line);node.domIds=[t.id];return node;}if(this.match(TokenType.STRING)){const t=this.previous();const cleanVal=t.value.substring(1,t.value.length-1);const node=new Literal(cleanVal,t.line);node.domIds=[t.id];return node;}if(this.match(TokenType.BOOLEAN)){const t=this.previous();const node=new Literal(t.value,t.line);node.domIds=[t.id];return node;}if(this.match(TokenType.IDENTIFIER)){const t=this.previous();const node=new Identifier(t.value,t.line);node.domIds=[t.id];node.tokenId=t.id;return node;}if(this.match(TokenType.PUNCTUATION,'(')){const openParen=this.previous();if(this.match(TokenType.PUNCTUATION,')')){const node=new Literal(undefined,openParen.line);node.domIds=[openParen.id,this.previous().id];return node;}const args=[];let domIds=[openParen.id];if(!this.check(TokenType.PUNCTUATION,')')){const expr=this.expression();args.push(expr);domIds.push(...expr.domIds);while(this.match(TokenType.PUNCTUATION,',')){const c=this.previous();domIds.push(c.id);const nextExpr=this.expression();args.push(nextExpr);domIds.push(...nextExpr.domIds);}}const closeParen=this.consume(TokenType.PUNCTUATION,')');domIds.push(closeParen.id);if(args.length>1){const node=new ArgumentsNode(args,openParen.line);node.domIds=domIds;return node;}else{const expr=args[0];expr.domIds=domIds;return expr;}}throw new Error("Unexpected token");}match(type,val){if(this.check(type,val)){this.advance();return true;}return false;}check(type,val){if(this.isAtEnd())return false;const t=this.peek();if(Array.isArray(val))return t.type===type&&val.includes(t.value);if(val)return t.type===type&&t.value===val;return t.type===type;}consume(type,val){if(this.check(type,val))return this.advance();const found=this.isAtEnd()?"EOF":`${this.peek().type}(${this.peek().value})`;throw new Error(`Attendu: ${type}${val?' '+val:''}, trouvé: ${found}`);}advance(){if(!this.isAtEnd())this.current++;return this.previous();}peek(){return this.tokens[this.current];}previous(){return this.tokens[this.current-1];}isAtEnd(){return this.current>=this.tokens.length;}}

class Scope {
    constructor(name, parent = null, visualParent = null) {
        this.name = name; this.parent = parent; this.visualParent = visualParent || parent; this.variables = {};
        this.id = `scope-${Math.random().toString(36).substr(2, 9)}`;
    }
    define(name, kind) { if (this.variables[name]) throw new Error(`Variable ${name} déjà déclarée`); const addr = "0x" + (Math.floor(Math.random()*0xFFFF)).toString(16).toUpperCase().padStart(3, '0'); this.variables[name] = { value: undefined, kind, addr }; return addr; }
    initialize(name, value) { if (this.variables[name]) { this.variables[name].value = value; return; } throw new Error(`Variable ${name} non définie`); }
    assign(name, value) { if (this.variables[name]) { if (this.variables[name].kind === 'const') throw new Error(`Assignation à une constante ${name}`); this.variables[name].value = value; return; } if (this.parent) return this.parent.assign(name, value); throw new Error(`Variable ${name} non définie`); }
    get(name) { if (this.variables[name]) return this.variables[name]; if (this.parent) return this.parent.get(name); throw new Error(`Variable ${name} non définie`); }
    getPath() { let path = []; let curr = this; while(curr) { if (Object.keys(curr.variables).length > 0 || curr.name === 'Global' || curr === this) { if (path.length === 0 || path[0] !== curr.name) { path.unshift(curr.name); } } curr = curr.visualParent; } return path; }
}

class Interpreter {
    constructor(ui) {
        this.ui = ui;
        this.globalScope = new Scope("Global");
        this.currentScope = this.globalScope;
        this.functions = {};
        this.callStack = []; 
        this.scopeStack = [this.globalScope];
        this.shouldStop = false;
        this.resolveNext = null;
    }

    async start(code) { 
        this.shouldStop = false; 
        this.callStack = []; 
        this.scopeStack = [this.globalScope]; 
        await this.ui.updateMemory(this.scopeStack); 
        try { 
            const lexer = new Lexer(code); 
            const rawTokens = lexer.tokenize(); 
            this.ui.renderCode(rawTokens); 
            const parser = new Parser(rawTokens); 
            const ast = parser.parse(); 
            await this.executeBlock(ast.body); 
            await this.ui.wait(500); 
            this.ui.highlightLines([]); 
            this.ui.resetVisuals(); // Reset tokens
            this.ui.log("--- Fin de l'exécution. En attente d'événements... ---", "info");
            // Mode écoute activé
            ui.setEventMode(true);
        } catch (e) { 
            if (e.message !== "STOP") { 
                this.ui.log("Erreur: " + e.message, "error"); 
                console.error(e); 
            } else { 
                this.ui.log("--- Arrêt ---", "info"); 
            } 
            this.ui.setRunningState(false); 
            this.ui.resetDisplay(); 
        }
    }
    
    async invokeEvent(funcName) {
        if (this.shouldStop) return;
        
        // Désactiver les contrôles
        document.getElementById('btn-trigger').disabled = true;
        document.getElementById('btn-set-event').disabled = true;

        // Simuler un noeud d'appel
        const dummyId = new Identifier(funcName, 0);
        dummyId.domIds = []; // Pas de DOM pour l'événement externe
        const callNode = new CallExpr(dummyId, [], 0);
        callNode.domIds = []; 
        
        try {
            this.ui.log(`> Événement: ${funcName}()`, "info");
            await this.evaluate(callNode);
        } catch (e) {
            this.ui.log(`Erreur événement: ${e.message}`, "error");
        } finally {
            this.ui.highlightLines([]); 
            this.ui.resetVisuals();
            // Réactiver les contrôles si on n'a pas stoppé
            if (!this.shouldStop) {
                document.getElementById('btn-trigger').disabled = false;
                document.getElementById('btn-set-event').disabled = false;
            }
        }
    }

    async nextStep() { if (this.resolveNext) { const r = this.resolveNext; this.resolveNext = null; r(); } }
    stop() { this.shouldStop = true; if (this.resolveNext) this.resolveNext(); }
    async pause(line) { if (this.shouldStop) throw new Error("STOP"); this.ui.skipMode = false; this.ui.setStepButtonState(false); this.ui.resetVisuals(); const activeLines = [...this.callStack, line]; this.ui.highlightLines(activeLines); await this.ui.updateMemory(this.scopeStack); this.ui.setStepButtonState(true); await new Promise(r => { this.resolveNext = r; }); this.ui.setStepButtonState(false); if (this.shouldStop) throw new Error("STOP"); }
    async executeBlock(stmts) { for (const s of stmts) { const res = await this.execute(s); if (res === 'BREAK') return 'BREAK'; if (res && res.__isReturn) return res; } }

    async execute(node) {
        if (this.shouldStop) return;
        if (node instanceof BlockStmt) { const blockScope = new Scope("Block", this.currentScope, this.currentScope); this.scopeStack.push(blockScope); const prevScope = this.currentScope; this.currentScope = blockScope; let result; try { result = await this.executeBlock(node.body); } finally { this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); } return result; }
        if (node instanceof MultiVarDecl) { for (const decl of node.decls) { await this.execute(decl); } return; }
        if (node instanceof VarDecl) { await this.pause(node.line); this.currentScope.define(node.name, node.kind); await this.ui.updateMemory(this.scopeStack, node.name, 'declare'); await this.ui.wait(600); if (node.init) { if (node.init instanceof ArrayLiteral) { const arr = new Array(node.init.elements.length).fill(undefined); this.currentScope.initialize(node.name, arr); await this.ui.updateMemory(this.scopeStack, node.name, 'write'); for(let i=0; i<node.init.elements.length; i++) { const val = await this.evaluate(node.init.elements[i]); arr[i] = val; await this.ui.animateAssignment(node.name, val, node.init.elements[i].domIds[0], i); await this.ui.updateMemory(this.scopeStack, node.name, 'write', i); } } else if (node.init instanceof ArrowFunctionExpr) { const func = { type: 'arrow_func', params: node.init.params.map(p=>p.name), body: node.init.body, scope: this.currentScope, paramIds: node.init.params.map(p=>p.id) }; this.currentScope.initialize(node.name, func); await this.ui.updateMemory(this.scopeStack, node.name, 'write'); } else if (node.init instanceof FunctionExpression) { const func = await this.evaluate(node.init); this.currentScope.initialize(node.name, func); await this.ui.updateMemory(this.scopeStack, node.name, 'write'); } else { const val = await this.evaluate(node.init); this.currentScope.initialize(node.name, val); await this.ui.animateAssignment(node.name, val, node.init.domIds[0]); await this.ui.updateMemory(this.scopeStack, node.name, 'write'); } } }
        else if (node instanceof Assignment) { await this.pause(node.line); let val; if (node.value instanceof ArrowFunctionExpr) { val = { type: 'arrow_func', params: node.value.params.map(p=>p.name), body: node.value.body, scope: this.currentScope, paramIds: node.value.params.map(p=>p.id) }; } else { val = await this.evaluate(node.value); } if (node.left instanceof Identifier) { this.currentScope.assign(node.left.name, val); if (typeof val !== 'object' || (val.type !== 'arrow_func' && val.type !== 'function_expr')) { await this.ui.animateAssignment(node.left.name, val, node.value.domIds[0]); } await this.ui.updateMemory(this.scopeStack, node.left.name, 'write'); } else if (node.left instanceof MemberExpr) { let obj; let targetName = null; if (node.left.object instanceof Identifier) { targetName = node.left.object.name; const scopedVar = this.currentScope.get(targetName); obj = scopedVar.value; } else { obj = await this.evaluate(node.left.object); } const prop = node.left.computed ? await this.evaluate(node.left.property) : node.left.property.value; if (Array.isArray(obj)) { obj[prop] = val; if (targetName) { await this.ui.animateAssignment(targetName, val, node.value.domIds[0], prop); await this.ui.updateMemory(this.scopeStack, targetName, 'write', prop); } } } }
        else if (node instanceof CallExpr) { await this.pause(node.line); await this.evaluate(node); }
        else if (node instanceof UpdateExpr) { await this.pause(node.line); await this.evaluate(node); }
        else if (node instanceof IfStmt) { await this.pause(node.line); const test = await this.evaluate(node.test); this.ui.lockTokens(node.test.domIds||[]); let res; try { if (test) { if (node.consequent instanceof BlockStmt) res = await this.executeBlock(node.consequent.body); else res = await this.execute(node.consequent); } else if (node.alternate) { if (node.alternate instanceof BlockStmt) res = await this.executeBlock(node.alternate.body); else res = await this.execute(node.alternate); } } finally { this.ui.unlockTokens(node.test.domIds||[]); } if (res) return res; }
        else if (node instanceof WhileStmt) { while(true) { await this.pause(node.line); const test = await this.evaluate(node.test); this.ui.lockTokens(node.test.domIds||[]); if(!test) { this.ui.unlockTokens(node.test.domIds||[]); break; } const loopScope = new Scope("Loop", this.currentScope, this.currentScope); this.scopeStack.push(loopScope); const prevScope = this.currentScope; this.currentScope = loopScope; try { const res = (node.body instanceof BlockStmt) ? await this.executeBlock(node.body.body) : await this.execute(node.body); if(res==='BREAK') { this.ui.unlockTokens(node.test.domIds||[]); break; } if(res&&res.__isReturn) return res; } finally { this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); } this.ui.unlockTokens(node.test.domIds||[]); } }
        else if (node instanceof DoWhileStmt) { do { const loopScope = new Scope("Loop", this.currentScope, this.currentScope); this.scopeStack.push(loopScope); const prevScope = this.currentScope; this.currentScope = loopScope; try { const res = (node.body instanceof BlockStmt) ? await this.executeBlock(node.body.body) : await this.execute(node.body); if(res==='BREAK') { this.ui.unlockTokens(node.test.domIds||[]); break; } if(res&&res.__isReturn) return res; } finally { this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); } await this.pause(node.line); const test = await this.evaluate(node.test); this.ui.lockTokens(node.test.domIds||[]); if(!test) { this.ui.unlockTokens(node.test.domIds||[]); break; } this.ui.unlockTokens(node.test.domIds||[]); } while(true); }
        else if (node instanceof ForStmt) { const loopScope = new Scope("Loop", this.currentScope, this.currentScope); this.scopeStack.push(loopScope); const prevScope = this.currentScope; this.currentScope = loopScope; try { if(node.init) { if(node.init instanceof VarDecl || node.init instanceof BlockStmt || node.init instanceof MultiVarDecl) await this.execute(node.init); else { await this.pause(node.init.line); await this.evaluate(node.init); } } while(true) { if(node.test) { await this.pause(node.line); const test = await this.evaluate(node.test); this.ui.lockTokens(node.test.domIds||[]); if(!test) { this.ui.unlockTokens(node.test.domIds||[]); break; } } if (node.body instanceof BlockStmt) { for (const stmt of node.body.body) { const res = await this.execute(stmt); if (res === 'BREAK') { if(node.test) this.ui.unlockTokens(node.test.domIds||[]); break; } if (res && res.__isReturn) return res; } } else { const res = await this.execute(node.body); if(res==='BREAK') { if(node.test) this.ui.unlockTokens(node.test.domIds||[]); break; } if(res&&res.__isReturn) return res; } if(node.update) { await this.pause(node.line); await this.evaluate(node.update); } if(node.test) this.ui.unlockTokens(node.test.domIds||[]); } } finally { this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); } }
        else if (node instanceof SwitchStmt) { await this.pause(node.line); const disc = await this.evaluate(node.discriminant); let start=-1; let def=-1; for(let i=0;i<node.cases.length;i++){ const c=node.cases[i]; if(c.test){ await this.pause(c.line); const tv=await this.evaluate(c.test); const v1=JSON.stringify(formatValue(disc)); const v2=JSON.stringify(formatValue(tv)); const compStr=`${v1} === ${v2}`; if(c.test.domIds.length>0){ this.ui.setRawTokenText(c.test.domIds[0], compStr, true); for(let k=1;k<c.test.domIds.length;k++){ const el=document.getElementById(c.test.domIds[k]); if(el){ if(!this.ui.modifiedTokens.has(c.test.domIds[k])) this.ui.modifiedTokens.set(c.test.domIds[k], {original:el.innerText, transient:true}); el.style.display='none'; } } } await this.ui.wait(800); const isMatch=(tv===disc); await this.ui.animateOperationCollapse(c.test.domIds, isMatch); await this.ui.wait(800); if(isMatch){ start=i; break; } } else { def=i; } } if(start===-1) start=def; if(start!==-1){ for(let i=start; i<node.cases.length; i++){ const c=node.cases[i]; for(const s of c.consequent){ const res=await this.execute(s); if(res==='BREAK') return; if(res&&res.__isReturn) return res; } } } }
        else if (node instanceof BreakStmt) { await this.pause(node.line); return 'BREAK'; }
        else if (node instanceof FunctionDecl) { await this.pause(node.line); this.functions[node.name] = node; }
    }

    async evaluate(node) {
        if (node instanceof Literal) return node.value;
        if (node instanceof UnaryExpr) { const arg = await this.evaluate(node.arg); let res; if (node.op === '!') res = !arg; else if (node.op === '-') res = -arg; else if (node.op === '+') res = +arg; await this.ui.animateOperationCollapse(node.domIds, res); await this.ui.wait(800); return res; }
        if (node instanceof FunctionExpression) { return { type: 'function_expr', name: node.name || 'anonymous', params: node.params.map(p => p.name), paramIds: node.params.map(p => p.id), body: node.body, scope: this.currentScope }; }
        if (node instanceof ArrayLiteral) { const elements = []; for (const el of node.elements) { elements.push(await this.evaluate(el)); } return elements; }
        if (node instanceof NewExpr) { if (node.callee instanceof Identifier && node.callee.name === 'Array') { const args = []; for(const arg of node.args) args.push(await this.evaluate(arg)); if(args.length === 1 && typeof args[0] === 'number') { return new Array(args[0]).fill(undefined); } return new Array(...args); } }
        if (node instanceof ArgumentsNode) { let result; for(const arg of node.args) { result = await this.evaluate(arg); } return result; }
        if (node instanceof Identifier) { const variable = this.currentScope.get(node.name); if (variable.value && variable.value.type === 'arrow_func') return variable.value; if (variable.value && variable.value.type === 'function_expr') return variable.value; await this.ui.animateRead(node.name, variable.value, node.domIds[0]); this.ui.replaceTokenText(node.domIds[0], variable.value, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return variable.value; }
        if (node instanceof MemberExpr) { let obj; if (node.object instanceof Identifier) { const varName = node.object.name; const scopedVar = this.currentScope.get(varName); obj = scopedVar.value; } else { obj = await this.evaluate(node.object); } const prop = node.computed ? await this.evaluate(node.property) : node.property.value; if (Array.isArray(obj) && prop === 'length' && node.object instanceof Identifier) { await this.ui.animateReadHeader(node.object.name, obj.length, node.domIds[0]); this.ui.replaceTokenText(node.domIds[0], obj.length, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return obj.length; } if (Array.isArray(obj) && node.object instanceof Identifier) { const val = obj[prop]; await this.ui.animateRead(node.object.name, val, node.domIds[0], prop); this.ui.replaceTokenText(node.domIds[0], val, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return val; } return obj[prop]; }
        if (node instanceof UpdateExpr) { const name = node.arg.name; const currentVal = this.currentScope.get(name).value; const isInc = node.op === '++'; const newVal = isInc ? currentVal + 1 : currentVal - 1; await this.ui.animateRead(name, currentVal, node.arg.domIds[0]); if (node.prefix) { await this.ui.animateOperationCollapse(node.domIds, newVal); await this.ui.wait(800); this.currentScope.assign(name, newVal); await this.ui.animateAssignment(name, newVal, node.domIds[0]); await this.ui.updateMemory(this.scopeStack, name, 'write'); return newVal; } else { await this.ui.animateOperationCollapse(node.domIds, currentVal); await this.ui.wait(800); this.currentScope.assign(name, newVal); await this.ui.animateAssignment(name, newVal, node.domIds[0]); await this.ui.updateMemory(this.scopeStack, name, 'write'); return currentVal; } }
        if (node instanceof BinaryExpr) { const left = await this.evaluate(node.left); if (node.op === '&&' && !left) { if (node.right instanceof Identifier) { try { const val = this.currentScope.get(node.right.name).value; await this.ui.visualizeIdentifier(node.right.name, val, node.right.domIds); } catch(e) { } } await this.ui.animateOperationCollapse(node.domIds, false); await this.ui.wait(800); return false; } if (node.op === '||' && left) { if (node.right instanceof Identifier) { try { const val = this.currentScope.get(node.right.name).value; await this.ui.visualizeIdentifier(node.right.name, val, node.right.domIds); } catch(e) { } } await this.ui.animateOperationCollapse(node.domIds, true); await this.ui.wait(800); return true; } const right = await this.evaluate(node.right); let result; switch(node.op) { case '+': result = left + right; break; case '-': result = left - right; break; case '*': result = left * right; break; case '/': result = left / right; break; case '%': result = left % right; break; case '>': result = left > right; break; case '<': result = left < right; break; case '>=': result = left >= right; break; case '<=': result = left <= right; break; case '==': result = left == right; break; case '!=': result = left != right; break; case '===': result = left === right; break; case '!==': result = left !== right; break; case '&&': result = left && right; break; case '||': result = left || right; break; } await this.ui.animateOperationCollapse(node.domIds, result); await this.ui.wait(800); return result; }
        if (node instanceof CallExpr) {
            const argValues = []; for (const arg of node.args) argValues.push(await this.evaluate(arg)); await this.ui.wait(800);
            if (node.callee instanceof MemberExpr) {
                let obj; let arrName = null;
                if (node.callee.object instanceof Identifier) { arrName = node.callee.object.name; const scopedVar = this.currentScope.get(arrName); obj = scopedVar.value; } else { obj = await this.evaluate(node.callee.object); }
                if (Array.isArray(obj) && arrName) {
                    const method = node.callee.property instanceof Identifier ? node.callee.property.name : node.callee.property.value; let result;
                    if (method === 'push') { const newIndex = obj.length; for (let i = 0; i < argValues.length; i++) { const val = argValues[i]; const currentIdx = newIndex + i; obj[currentIdx] = undefined; await this.ui.updateMemory(this.scopeStack); if (node.args[i]) { await this.ui.animateAssignment(arrName, val, node.args[i].domIds[0], currentIdx); } obj[currentIdx] = val; await this.ui.updateMemory(this.scopeStack, arrName, 'write', currentIdx); } result = obj.length; await this.ui.animateReturnHeader(arrName, result, node.domIds[0]); this.ui.replaceTokenText(node.domIds[0], result, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; } 
                    else if (method === 'pop') { const lastIndex = obj.length - 1; const val = obj[lastIndex]; await this.ui.animateRead(arrName, val, node.domIds[0], lastIndex); await this.ui.animateArrayPop(arrName, lastIndex); result = obj.pop(); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); this.ui.replaceTokenText(node.domIds[0], result, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; }
                    else if (method === 'splice') { const start = argValues[0]; const count = argValues[1] || 0; const removedItems = obj.slice(start, start + count); if (removedItems.length > 0) { const indicesToHighlight = []; for(let i=0; i<count; i++) indicesToHighlight.push(start + i); await this.ui.highlightArrayElements(arrName, indicesToHighlight, 'delete'); await this.ui.wait(500); await this.ui.animateSpliceRead(arrName, removedItems, node.domIds[0], start); } result = obj.splice(...argValues); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); const resultStr = `[${result.map(v => JSON.stringify(v)).join(', ')}]`; this.ui.setRawTokenText(node.domIds[0], resultStr, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; }
                    if (method === 'shift') { const firstVal = obj[0]; await this.ui.animateRead(arrName, firstVal, node.domIds[0], 0); result = obj.shift(); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); this.ui.replaceTokenText(node.domIds[0], result, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; }
                    if (method === 'unshift') { result = obj.unshift(...argValues); await this.ui.updateMemory(this.scopeStack, arrName, 'write'); if(node.args.length>0) await this.ui.animateAssignment(arrName, argValues[0], node.args[0].domIds[0], 0); await this.ui.animateReturnHeader(arrName, result, node.domIds[0]); this.ui.replaceTokenText(node.domIds[0], result, true); for(let i=1; i<node.domIds.length; i++) { const el = document.getElementById(node.domIds[i]); if(el) { if(!this.ui.modifiedTokens.has(node.domIds[i])) this.ui.modifiedTokens.set(node.domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await this.ui.wait(800); return result; }
                    if (result !== undefined) return result;
                }
            }
            if (node.callee instanceof Identifier && node.callee.name === 'console.log') { 
                await this.ui.highlightLines([node.line]); // Redundant highlight fix
                await this.ui.consoleLog(argValues); 
                return undefined; 
            }
            if (node.callee instanceof Identifier) { 
                if (node.callee.name === 'parseInt') { 
                    const res = parseInt(...argValues); 
                    await this.ui.animateOperationCollapse(node.domIds, res); 
                    await this.ui.wait(800); 
                    return res; 
                } 
                if (node.callee.name.startsWith('Math.')) { 
                    const method = node.callee.name.split('.')[1]; 
                    if (typeof Math[method] === 'function') {
                        let res = Math[method](...argValues); 
                        await this.ui.animateOperationCollapse(node.domIds, res); 
                        await this.ui.wait(800); 
                        return res; 
                    }
                } 
            }
            if (node.callee instanceof MemberExpr) { const objVal = await this.evaluate(node.callee.object); if (node.callee.property === 'toFixed' && typeof objVal === 'number') { const digits = argValues.length > 0 ? argValues[0] : 0; const res = objVal.toFixed(digits); await this.ui.animateOperationCollapse(node.domIds, `"${res}"`); await this.ui.wait(800); return res; } }
            let funcNode; let closureScope = this.globalScope; let paramNames = []; let funcName = "anonymous"; let paramIds = [];
            if (node.callee instanceof Identifier) { funcName = node.callee.name; let val = null; try { val = this.currentScope.get(node.callee.name); } catch(e) {} if (val && val.value && (val.value.type === 'arrow_func' || val.value.type === 'function_expr')) { funcNode = val.value; closureScope = val.value.scope; paramNames = val.value.params; paramIds = val.value.paramIds || []; } else if (this.functions[node.callee.name]) { funcNode = this.functions[node.callee.name]; paramNames = funcNode.params.map(p => p.name); paramIds = funcNode.params.map(p => p.id); } else { throw new Error(`Fonction ${node.callee.name} inconnue`); } }
            if (funcNode) { const fnScope = new Scope(`${funcName}(${paramNames.join(', ')})`, closureScope, this.currentScope); this.scopeStack.push(fnScope); for (let i=0; i<paramNames.length; i++) { const pName = paramNames[i]; if (node.args[i] && paramIds[i]) { await this.ui.animateParamPass(argValues[i], node.args[i].domIds[0], paramIds[i]); } fnScope.define(pName, 'let'); fnScope.initialize(pName, argValues[i]); if (paramIds[i]) { this.ui.replaceTokenText(paramIds[i], argValues[i], false); } await this.ui.updateMemory(this.scopeStack, pName, 'declare'); } await this.ui.wait(600); const prevScope = this.currentScope; this.currentScope = fnScope; await this.ui.updateMemory(this.scopeStack); this.ui.lockTokens(node.domIds || []); this.callStack.push(node.line); let result = undefined; let returnSourceId = null; const body = funcNode.body; if (body instanceof BlockStmt) { for(const stmt of body.body) { if (stmt instanceof ReturnStmt) { await this.pause(stmt.line); result = stmt.argument ? await this.evaluate(stmt.argument) : undefined; returnSourceId = (stmt.argument && stmt.argument.domIds.length > 0) ? stmt.argument.domIds[0] : stmt.domIds[0]; break; } await this.execute(stmt); } } else { await this.pause(node.line); result = await this.evaluate(body); returnSourceId = body.domIds ? body.domIds[0] : null; } this.callStack.pop(); this.ui.unlockTokens(node.domIds || []); if (result !== undefined) { if(returnSourceId) { await this.ui.animateReturnToCall(node.domIds, result, returnSourceId); } else { await this.ui.animateReturnToCall(node.domIds, result); } await this.ui.wait(800); } this.currentScope = prevScope; this.scopeStack.pop(); await this.ui.updateMemory(this.scopeStack); for (let i=0; i<paramIds.length; i++) { if (paramIds[i]) { this.ui.resetTokenText(paramIds[i]); } } return result; } }
    }
}

const ui = {
    modifiedTokens: new Map(), lockedTokens: new Set(), 
    speedMultiplier: 1, baseDelay: 800, globalScale: 14, 
    skipMode: false, isDrawerOpen: false, isStopping: false,
    currentWaitResolver: null,
    
    speeds: [0.1, 0.25, 0.5, 1, 1.5, 2, 4],
    speedIndex: 3, 
    adjustSpeed: (delta) => {
        ui.speedIndex = Math.max(0, Math.min(ui.speeds.length - 1, ui.speedIndex + delta));
        ui.speedMultiplier = ui.speeds[ui.speedIndex];
        document.getElementById('speed-display').innerText = ui.speedMultiplier + 'x';
        document.documentElement.style.setProperty('--time-scale', 1 / ui.speedMultiplier);
    },

    toggleDrawer: () => {
        if(window.innerWidth >= 800) return; 
        const panel = document.getElementById('right-panel');
        if (panel.classList.contains('open')) { panel.classList.remove('open'); ui.isDrawerOpen = false; }
        else { panel.classList.add('open'); ui.isDrawerOpen = true; }
    },
    switchTab: (tabName) => {
        if(window.innerWidth >= 800) return; 
        document.querySelectorAll('.drawer-tab').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${tabName}`).classList.add('active');
        document.querySelectorAll('.drawer-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`view-${tabName}`).classList.add('active');
    },
    
    ensureDrawerOpen: (tabName) => {
        return new Promise(resolve => {
            if (ui.skipMode || ui.isStopping) { resolve(); return; }
            if (window.innerWidth >= 800) { resolve(); return; } 
            
            const panel = document.getElementById('right-panel');
            const targetContent = document.getElementById(`view-${tabName}`);
            
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

    activeSubTool: null, 

    showMobileTools: () => {
        if(window.innerWidth < 800) {
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
        if(event) {
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
        mainRow.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active-category'));

        if (!ui.activeSubTool) {
            subRow.classList.add('hidden');
            subRow.innerHTML = '';
            return;
        }
        const activeBtn = document.getElementById(`btn-cat-${ui.activeSubTool}`);
        if(activeBtn) activeBtn.classList.add('active-category');

        subRow.classList.remove('hidden');
        let keys = [];
        
        if (ui.activeSubTool === 'brackets') keys = ['(', ')', '{', '}', '[', ']'];
        else if (ui.activeSubTool === 'math') keys = ['+', '-', '*', '/', '%'];
        else if (ui.activeSubTool === 'logic') keys = ['<', '>', '<=', '>=', '===', '!=', '&&', '||', '!'];

        subRow.innerHTML = keys.map(k => 
            `<button class="tool-btn" onmousedown="event.preventDefault()" onclick="editor.insertText('${k}', false, true)">${k.replace('<','&lt;').replace('>','&gt;')}</button>`
        ).join('');
    },

    updateGlobalFontSize: (delta) => { const newSize = ui.globalScale + delta; if(newSize >= 10 && newSize <= 24) { ui.globalScale = newSize; document.documentElement.style.setProperty('--content-scale', `${newSize}px`); } },
    
    wait: (ms) => { 
        if (ui.isStopping) return Promise.resolve();
        if (ui.skipMode) return Promise.resolve(); 
        return new Promise(resolve => {
            ui.currentWaitResolver = resolve;
            setTimeout(() => {
                if (ui.currentWaitResolver === resolve) {
                    ui.currentWaitResolver = null;
                    resolve();
                }
            }, ms / ui.speedMultiplier);
        });
    },

    stopAnimations: () => {
        document.querySelectorAll('.flying-element').forEach(el => el.remove());
    },

    renderCode: (tokens) => {
        const display = document.getElementById('code-display');
        display.innerHTML = ''; let html = '';
        tokens.forEach(t => {
            let className = 'tok-ident';
            switch(t.type) { case TokenType.KEYWORD: className = 'tok-keyword'; break; case TokenType.STRING: className = 'tok-string'; break; case TokenType.NUMBER: className = 'tok-number'; break; case TokenType.BOOLEAN: className = 'tok-boolean'; break; case TokenType.COMMENT: className = 'tok-comment'; break; case TokenType.OPERATOR: className = 'tok-operator'; break; case TokenType.PUNCTUATION: className = 'tok-punctuation'; break; }
            if (t.type === 'WHITESPACE') html += t.value; else html += `<span id="${t.id}" class="${className}">${t.value}</span>`;
        });
        display.innerHTML = html;
        ui.modifiedTokens.clear(); ui.lockedTokens.clear();
    },
    resetDisplay: () => { 
        editor.refresh(); 
        document.getElementById('highlight-layer').innerHTML = ''; 
        document.getElementById('memory-container').innerHTML = ''; 
        document.getElementById('console-output').innerHTML = '';
        ui.modifiedTokens.clear(); 
        ui.lockedTokens.clear(); 
        ui.setStepButtonState(false); 
        ui.setEventMode(false);
        if(window.innerWidth < 800) {
            document.getElementById('right-panel').classList.remove('open');
            ui.isDrawerOpen = false;
        }
        document.getElementById('code-wrapper').scrollTo(0, 0);
        ui.currentWaitResolver = null;
    },
    updateLineNumbers: (text) => { const lines = text.split('\n').length; document.getElementById('line-numbers').innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>'); },
    syncScroll: () => { 
        const wrapper = document.getElementById('code-wrapper'); 
        const lineNums = document.getElementById('line-numbers');
        lineNums.scrollTop = wrapper.scrollTop;
    },
    setRunningState: (running) => { 
        // Mise à jour de l'état du bouton Play/Stop
        const btnRun = document.getElementById('btn-toggle-run');
        if (running) {
            btnRun.innerHTML = '<i data-lucide="square"></i>';
            btnRun.classList.add('btn-stop-mode');
            if(window.lucide) window.lucide.createIcons();
        } else {
            btnRun.innerHTML = '<i data-lucide="play"></i>';
            btnRun.classList.remove('btn-stop-mode');
            if(window.lucide) window.lucide.createIcons();
        }
        
        document.getElementById('btn-next').disabled = !running; 
        document.getElementById('btn-skip').disabled = !running; 
        document.getElementById('code-input').readOnly = running; 
        if(!running) document.getElementById('highlight-layer').innerHTML = ''; 
    },
    setStepButtonState: (enabled) => { 
        document.getElementById('btn-next').disabled = !enabled; 
        document.getElementById('btn-skip').disabled = !ui.isStopping && !enabled && false; 
    },
    setEventMode: (enabled) => {
        document.getElementById('btn-trigger').disabled = !enabled;
        // document.getElementById('btn-set-event').disabled = !enabled; // Now always enabled
        document.getElementById('btn-next').disabled = true; 
        document.getElementById('btn-skip').disabled = true;
    },
    log: (msg, type='info') => { 
        if(ui.isStopping) return;
        const div = document.createElement('div'); div.className = `log-entry log-${type}`; div.innerText = msg; const box = document.getElementById('console-output'); box.appendChild(div); box.scrollTop = box.scrollHeight; 
    },
    
    consoleLog: async (args) => {
        if(ui.isStopping) return;
        await ui.ensureDrawerOpen('console');
        const box = document.getElementById('console-output');
        const div = document.createElement('div'); 
        div.className = `log-entry`; 
        const text = args.map(arg => {
            if (Array.isArray(arg)) return `[${arg.join(', ')}]`; 
            if (typeof arg === 'object' && arg !== null) return JSON.stringify(arg); 
            return arg;
        }).join(' ');
        div.innerText = `> ${text}`;
        box.appendChild(div); 
        box.scrollTop = box.scrollHeight;
        div.classList.add('console-flash');
        await ui.wait(600); 
        div.classList.remove('console-flash');
    },

    scrollToLine: (lineNumber) => {
        if(ui.skipMode || ui.isStopping) return;
        const wrapper = document.getElementById('code-wrapper');
        const lineHeight = parseFloat(getComputedStyle(document.getElementById('code-display')).lineHeight) || 24;
        const targetY = (lineNumber - 1) * lineHeight;
        const containerHeight = wrapper.clientHeight;
        
        if (targetY < wrapper.scrollTop + 20 || targetY > wrapper.scrollTop + containerHeight - 60) {
            wrapper.scrollTo({
                top: Math.max(0, targetY - containerHeight / 2),
                behavior: 'smooth'
            });
        }
    },

    highlightLines: (lineNumbers) => {
        if(ui.isStopping) return;
        const layer = document.getElementById('highlight-layer'); layer.innerHTML = ''; 
        const lh = parseFloat(getComputedStyle(document.getElementById('code-display')).lineHeight);
        if (lineNumbers.length > 0) {
            ui.scrollToLine(lineNumbers[lineNumbers.length - 1]);
        }
        for(let i=0; i<lineNumbers.length - 1; i++) { const div = document.createElement('div'); div.className = 'exec-line-stack'; div.style.top = `${(lineNumbers[i] - 1) * lh + 10}px`; layer.appendChild(div); }
        if (lineNumbers.length > 0) { const div = document.createElement('div'); div.className = 'exec-line'; div.style.top = `${(lineNumbers[lineNumbers.length - 1] - 1) * lh + 10}px`; layer.appendChild(div); }
    },

    ensureVisible: (elementId) => { 
        const el = document.getElementById(elementId); 
        if (el) { el.scrollIntoView({ behavior: 'auto', block: 'center' }); }
    },

    updateMemory: async (scopeStack, flashVarName = null, flashType = 'write', flashIndex = null) => {
        if(ui.isStopping) return;
        if(flashVarName) await ui.ensureDrawerOpen('memory');
        const container = document.getElementById('memory-container'); 
        let targetEl = null;
        const visibleScopes = scopeStack.filter(s => Object.keys(s.variables).length > 0 || s.name === 'Global');
        const visibleIds = new Set(visibleScopes.map(s => s.id));
        Array.from(container.children).forEach(child => { if (!visibleIds.has(child.id)) child.remove(); });

        visibleScopes.forEach((scope) => {
            let scopeDiv = document.getElementById(scope.id);
            if (!scopeDiv) {
                scopeDiv = document.createElement('div'); scopeDiv.id = scope.id; scopeDiv.className = 'memory-scope'; scopeDiv.style.borderColor = 'rgba(255,255,255,0.1)';
                const path = scope.getPath(); const titleDiv = document.createElement('div'); titleDiv.className = 'scope-title';
                path.forEach((part, idx) => { const s = document.createElement('span'); s.className = 'breadcrumb-item'; s.innerText = part; titleDiv.appendChild(s); if (idx < path.length - 1) { const sep = document.createElement('span'); sep.className = 'breadcrumb-sep'; sep.innerText = '>'; titleDiv.appendChild(sep); } });
                scopeDiv.appendChild(titleDiv); const varsContainer = document.createElement('div'); varsContainer.id = `scope-vars-${scope.id}`; scopeDiv.appendChild(varsContainer); container.appendChild(scopeDiv);
            }
            const varsContainer = document.getElementById(`scope-vars-${scope.id}`);
            const activeVarNames = new Set(Object.keys(scope.variables));
            Array.from(varsContainer.children).forEach(child => { if (!activeVarNames.has(child.getAttribute('data-var-name'))) child.remove(); });

            Object.keys(scope.variables).forEach(name => {
                const v = scope.variables[name]; const groupId = `mem-group-${scope.id}-${name}`; let groupDiv = document.getElementById(groupId);
                if (!groupDiv) { groupDiv = document.createElement('div'); groupDiv.id = groupId; groupDiv.className = 'memory-group'; groupDiv.setAttribute('data-var-name', name); groupDiv.classList.add('cell-entry'); varsContainer.appendChild(groupDiv); }
                const shouldFlash = (name === flashVarName && flashType !== 'none' && flashIndex === null);
                let valStr = Array.isArray(v.value) ? `Array(${v.value.length})` : (v.value && v.value.type && v.value.type.includes('func')) ? `f(${v.value.params})` : (v.value === undefined ? 'undefined' : JSON.stringify(formatValue(v.value)));
                const rowId = `mem-row-${scope.id}-${name}-main`; let row = document.getElementById(rowId);
                if (!row) { row = document.createElement('div'); row.id = rowId; row.className = 'memory-cell'; groupDiv.insertBefore(row, groupDiv.firstChild); }
                row.innerHTML = `<span class="mem-addr">${v.addr}</span><span class="mem-name">${name}</span><span class="mem-val" id="${Array.isArray(v.value)?`mem-header-${name}`:`mem-val-${name}`}">${valStr}</span>`;
                row.className = 'memory-cell'; 
                if(Array.isArray(v.value)) row.classList.add('sticky-var');
                if(shouldFlash) { row.classList.add(`flash-${flashType}`); targetEl = row; }
                if (Array.isArray(v.value)) {
                    const existing = Array.from(groupDiv.querySelectorAll('.array-element')); existing.forEach(r => { if(parseInt(r.getAttribute('data-index')) >= v.value.length) r.remove(); });
                    v.value.forEach((item, idx) => {
                        const iId = `mem-row-${scope.id}-${name}-${idx}`; let iRow = document.getElementById(iId);
                        if (!iRow) { iRow = document.createElement('div'); iRow.id = iId; iRow.className = 'memory-cell array-element'; iRow.setAttribute('data-index', idx); iRow.classList.add('cell-entry'); groupDiv.appendChild(iRow); }
                        iRow.innerHTML = `<span class="mem-addr"></span><span class="mem-name">${idx}</span><span class="mem-val" id="mem-val-${name}-${idx}">${item===undefined?'empty':JSON.stringify(formatValue(item))}</span>`;
                        if(name===flashVarName && flashIndex===idx) { iRow.classList.add(`flash-${flashType}`); targetEl = iRow; }
                    });
                } else { groupDiv.querySelectorAll('.array-element').forEach(r=>r.remove()); }
            });
        });
        if(targetEl) targetEl.scrollIntoView({ behavior: 'auto', block: 'center' }); 
    },

    animateArrayPop: async (arrName, index) => { if (ui.skipMode) return; await ui.ensureDrawerOpen('memory'); const valSpan = document.getElementById(`mem-val-${arrName}-${index}`); if(valSpan && valSpan.parentElement) { valSpan.parentElement.classList.add('cell-remove'); await ui.wait(400); } },
    highlightArrayElements: async (arrName, indices, type = 'delete') => { if(indices.length > 0) { await ui.ensureDrawerOpen('memory'); ui.ensureVisible(`mem-val-${arrName}-${indices[0]}`); } indices.forEach(i => { const el = document.getElementById(`mem-val-${arrName}-${i}`); if(el && el.parentElement) el.parentElement.classList.add(`flash-${type}`); }); },
    lockTokens: (ids) => ids.forEach(id => ui.lockedTokens.add(id)), unlockTokens: (ids) => ids.forEach(id => ui.lockedTokens.delete(id)),
    replaceTokenText: (tokenId, newValue, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { if (!ui.modifiedTokens.has(tokenId)) { ui.modifiedTokens.set(tokenId, { original: el.innerText, transient: isTransient }); } el.innerText = Array.isArray(newValue) ? JSON.stringify(newValue) : JSON.stringify(formatValue(newValue)); el.classList.add('val-replacement'); } },
    setRawTokenText: (tokenId, text, isTransient = true) => { if(ui.isStopping) return; const el = document.getElementById(tokenId); if (el) { if (!ui.modifiedTokens.has(tokenId)) ui.modifiedTokens.set(tokenId, { original: el.innerText, transient: isTransient }); el.innerText = text; el.classList.add('val-replacement'); } },
    resetTokenText: (tokenId) => { const el = document.getElementById(tokenId); if (el && ui.modifiedTokens.has(tokenId)) { const data = ui.modifiedTokens.get(tokenId); el.innerText = data.original; el.classList.remove('val-replacement'); ui.modifiedTokens.delete(tokenId); } },
    resetVisuals: () => { for (const [id, data] of ui.modifiedTokens) { if (data.transient && !ui.lockedTokens.has(id)) { const el = document.getElementById(id); if (el) { el.innerText = data.original; el.classList.remove('val-replacement'); el.classList.remove('op-result'); el.style.opacity = '1'; el.style.display = 'inline'; el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; } ui.modifiedTokens.delete(id); } } const hidden = document.querySelectorAll('[style*="display: none"]'); hidden.forEach(el => { if(!ui.modifiedTokens.has(el.id) || (ui.modifiedTokens.get(el.id).transient && !ui.lockedTokens.has(el.id))) { el.style.display = 'inline'; el.style.opacity = '1'; el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; } }); },

    flyHelper: async (value, startEl, endEl, delayStart = true) => {
        if (!startEl || !endEl || ui.isStopping) return;
        // Scroll destination into view first
        endEl.scrollIntoView({ behavior: 'smooth', block: 'center' }); 
        
        // Wait for scroll to reliably finish (fixed timing issue)
        await ui.wait(600); 
        
        if (ui.isStopping) return;

        // Determine Z-Index based on locations
        // Drawer z-index is 100.
        // If both elements are in the editor (not in memory container), keep it low.
        const startInMem = startEl.closest('#memory-container');
        const endInMem = endEl.closest('#memory-container');
        const zIndex = (!startInMem && !endInMem) ? 90 : 9999;

        // Re-calculate positions AFTER scroll is complete
        const start = startEl.getBoundingClientRect(); 
        const end = endEl.getBoundingClientRect();
        
        if (start.top < 0 || end.top < 0) return; 
        const flyer = document.createElement('div'); flyer.className = 'flying-element'; flyer.innerText = JSON.stringify(formatValue(value)); document.body.appendChild(flyer);
        
        flyer.style.zIndex = zIndex; 

        const fRect = flyer.getBoundingClientRect();
        const startX = start.left + (start.width - fRect.width) / 2;
        const startY = start.top + (start.height - fRect.height) / 2;
        flyer.style.left = `${startX}px`; flyer.style.top = `${startY}px`;
        if (delayStart) await ui.wait(150);
        if (ui.isStopping) { flyer.remove(); return; }
        const endX = end.left + (end.width - fRect.width) / 2;
        const endY = end.top + (end.height - fRect.height) / 2;
        const dx = endX - startX; const dy = endY - startY;
        await ui.wait(20);
        flyer.style.transition = `transform ${ui.baseDelay / ui.speedMultiplier}ms cubic-bezier(0.25, 1, 0.5, 1)`; 
        flyer.style.transform = `translate(${dx}px, ${dy}px)`;
        await ui.wait(ui.baseDelay); await ui.wait(100); flyer.remove();
    },

    animateAssignment: async (varName, value, targetTokenId, index = null) => { if (ui.skipMode || ui.isStopping) return; await ui.ensureDrawerOpen('memory'); const tokenEl = document.getElementById(targetTokenId); const memId = index !== null ? `mem-val-${varName}-${index}` : `mem-val-${varName}`; ui.ensureVisible(memId); const memEl = document.getElementById(memId); await ui.flyHelper(value, tokenEl, memEl); },
    animateRead: async (varName, value, targetTokenId, index = null) => { if (ui.skipMode || ui.isStopping) return; await ui.ensureDrawerOpen('memory'); const memId = index !== null ? `mem-val-${varName}-${index}` : `mem-val-${varName}`; ui.ensureVisible(memId); const memEl = document.getElementById(memId); const tokenEl = document.getElementById(targetTokenId); await ui.flyHelper(value, memEl, tokenEl); },
    visualizeIdentifier: async (varName, value, domIds) => { if (!domIds || domIds.length === 0 || ui.isStopping) return; await ui.animateRead(varName, value, domIds[0]); ui.replaceTokenText(domIds[0], value, true); for(let i=1; i<domIds.length; i++) { const el = document.getElementById(domIds[i]); if(el) { if(!ui.modifiedTokens.has(domIds[i])) ui.modifiedTokens.set(domIds[i], {original: el.innerText, transient: true}); el.style.display = 'none'; } } await ui.wait(800); },
    animateReadHeader: async (varName, value, targetTokenId) => { if (ui.skipMode || ui.isStopping) return; await ui.ensureDrawerOpen('memory'); const memId = `mem-header-${varName}`; ui.ensureVisible(memId); const memEl = document.getElementById(memId); const tokenEl = document.getElementById(targetTokenId); await ui.flyHelper(value, memEl, tokenEl); },
    animateReturnHeader: async (varName, value, targetTokenId) => { await ui.animateReadHeader(varName, value, targetTokenId); },
    animateSpliceRead: async (varName, values, targetTokenId, startIndex) => { if (ui.skipMode || ui.isStopping) return; await ui.ensureDrawerOpen('memory'); const memId = `mem-val-${varName}-${startIndex}`; ui.ensureVisible(memId); const memEl = document.getElementById(memId); const tokenEl = document.getElementById(targetTokenId); if (!memEl || !tokenEl) return; const valStr = `[${values.map(v => JSON.stringify(formatValue(v))).join(', ')}]`; await ui.flyHelper(valStr, memEl, tokenEl); },
    animateOperationCollapse: async (domIds, result) => { if (ui.skipMode || ui.isStopping) return; const elements = domIds.map(id => document.getElementById(id)).filter(e => e); if (elements.length === 0) return; elements.forEach(el => { if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.backgroundColor = 'rgba(167, 139, 250, 0.4)'; el.style.boxShadow = '0 0 2px rgba(167, 139, 250, 0.6)'; }); await ui.wait(ui.baseDelay); elements.forEach(el => { el.style.backgroundColor = 'transparent'; el.style.boxShadow = 'none'; el.style.opacity = '0.5'; }); await ui.wait(ui.baseDelay); const first = elements[0]; first.innerText = JSON.stringify(formatValue(result)); first.style.opacity = '1'; first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) elements[i].style.display = 'none'; },
    animateReturnToCall: async (callDomIds, result, sourceId = null) => { if (ui.skipMode) { const elements = callDomIds.map(id => document.getElementById(id)).filter(e => e); if(elements.length > 0) { const first = elements[0]; if(!ui.modifiedTokens.has(first.id)) ui.modifiedTokens.set(first.id, { original: first.innerText, transient: true }); first.innerText = JSON.stringify(formatValue(result)); first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) { const el = elements[i]; if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.display = 'none'; } } return; } const startEl = document.getElementById(callDomIds[0]); if(!startEl) return; if (sourceId) { const sourceEl = document.getElementById(sourceId); if (sourceEl) { await ui.flyHelper(result, sourceEl, startEl, false); } } const elements = callDomIds.map(id => document.getElementById(id)).filter(e => e); elements.forEach(el => { if(!ui.modifiedTokens.has(el.id)) ui.modifiedTokens.set(el.id, { original: el.innerText, transient: true }); el.style.opacity = '0.5'; }); if (!sourceId) await ui.wait(ui.baseDelay); const first = elements[0]; first.innerText = JSON.stringify(formatValue(result)); first.style.opacity = '1'; first.classList.add('op-result'); for (let i = 1; i < elements.length; i++) elements[i].style.display = 'none'; },
    animateParamPass: async (value, sourceId, targetId) => { if (ui.skipMode || ui.isStopping) return; const sourceEl = document.getElementById(sourceId); const targetEl = document.getElementById(targetId); await ui.flyHelper(value, sourceEl, targetEl); }
};

const consoleUI = { clear: () => document.getElementById('console-output').innerHTML = '' };

// --- MAIN APP ---
const app = {
    interpreter: null,
    isRunning: false,
    eventFunctionName: 'onClick',
    
    toggleRun: () => {
        if (app.isRunning) {
            app.stop();
        } else {
            app.start();
        }
    },
    
    start: () => {
        const code = document.getElementById('code-input').value;
        app.isRunning = true;
        ui.setRunningState(true);
        consoleUI.clear();
        app.interpreter = new Interpreter(ui);
        app.interpreter.start(code);
    },
    
    nextStep: () => { if(app.interpreter) app.interpreter.nextStep(); },
    stepAnimated: () => { ui.skipMode = false; app.nextStep(); },
    stepInstant: () => { 
        if (ui.currentWaitResolver) {
            ui.skipMode = true; 
            ui.currentWaitResolver(); 
            ui.currentWaitResolver = null;
        } else {
            ui.skipMode = true; 
            app.nextStep(); 
        }
    },
    
    stop: () => { 
        ui.isStopping = true; 
        ui.stopAnimations();
        if(app.interpreter) { app.interpreter.stop(); }
        setTimeout(() => { 
            ui.resetDisplay(); 
            app.isRunning = false;
            ui.setRunningState(false); 
            ui.isStopping = false; 
        }, 50);
    },
    
    toggleEventPopup: () => {
        const popup = document.getElementById('event-popup');
        popup.classList.toggle('visible');
        if (popup.classList.contains('visible')) {
            const input = document.getElementById('event-name-input');
            input.focus();
            input.select();
        }
    },
    
    saveEventName: () => {
        const input = document.getElementById('event-name-input');
        if (input.value.trim()) {
            app.eventFunctionName = input.value.trim();
            document.getElementById('event-popup').classList.remove('visible');
        }
    },
    
    triggerEvent: () => {
        if (app.interpreter) {
            app.interpreter.invokeEvent(app.eventFunctionName);
        }
    }
};

const editor = {
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
    insertText: (text, cursorOffset = false, stopProp = false) => {
        if(stopProp && event) {
            event.preventDefault();
            event.stopPropagation();
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

// --- KEYBOARD SHORTCUTS ---
document.getElementById('code-input').addEventListener('keydown', (e) => {
    // Tab support
    if (e.key === 'Tab') {
        e.preventDefault();
        editor.insertText('    ');
    }
    
    // Undo / Redo support (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y)
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        editor.undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        editor.redo();
    }
    // Enter to save event name if popup is visible
    if (e.key === 'Enter') {
        const popup = document.getElementById('event-popup');
        if (popup.classList.contains('visible')) {
            app.saveEventName();
        }
    }
});

// --- INIT & EVENTS ---
document.getElementById('code-input').value = DEFAULT_CODE;
// Initial height adjustment
editor.adjustHeight();
editor.refresh();

// Initialize icons
if (window.lucide) {
    window.lucide.createIcons();
}

// Initialize correct view based on screen size
if (window.innerWidth >= 800) {
    document.getElementById('view-memory').classList.add('active');
    document.getElementById('view-console').classList.add('active');
} else {
    ui.switchTab('memory');
}

// Drawer Drag Logic
const handle = document.getElementById('drawer-handle');
const panel = document.getElementById('right-panel');
let startY = 0, startHeight = 0, isDragging = false;

handle.addEventListener('touchstart', (e) => {
    if(window.innerWidth >= 800) return; // Disable drag on desktop
    startY = e.touches[0].clientY;
    startHeight = panel.getBoundingClientRect().height; 
    isDragging = true;
    panel.style.transition = 'none'; 
}, {passive: false});

document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    if(window.innerWidth >= 800) return;
    e.preventDefault(); 
    const currentY = e.touches[0].clientY;
    const deltaY = startY - currentY; 
    const newHeight = startHeight + deltaY;
    const maxHeight = window.innerHeight * 0.85;
    if (newHeight >= 32 && newHeight <= maxHeight) { panel.style.height = `${newHeight}px`; }
}, {passive: false});

handle.addEventListener('touchend', (e) => {
    if (!isDragging) return;
    if(window.innerWidth >= 800) return;
    isDragging = false;
    panel.style.transition = ''; 
    const currentHeight = panel.getBoundingClientRect().height;
    if (currentHeight > 120) { panel.classList.add('open'); ui.isDrawerOpen = true; } else { panel.classList.remove('open'); ui.isDrawerOpen = false; }
    panel.style.height = ''; 
});

handle.addEventListener('click', () => {
    if(window.innerWidth >= 800) return;
    ui.toggleDrawer();
    panel.style.height = ''; 
});

// Handle resize events to switch modes
window.addEventListener('resize', () => {
    if (window.innerWidth >= 800) {
        document.getElementById('view-memory').classList.add('active');
        document.getElementById('view-console').classList.add('active');
        document.getElementById('right-panel').classList.remove('open'); // Reset classes not needed for desktop
    } else {
        // Reset to tab view on mobile if needed
        const memActive = document.getElementById('tab-memory').classList.contains('active');
        const conActive = document.getElementById('tab-console').classList.contains('active');
        if(!memActive && !conActive) ui.switchTab('memory');
    }
});

// --- FIX IOS KEYBOARD ---
const setAppHeight = () => {
    // Si l'API visualViewport est disponible (cas moderne)
    if (window.visualViewport) {
        // On force la hauteur du body à la hauteur visible réelle
        document.documentElement.style.setProperty('--app-height', `${window.visualViewport.height}px`);
        // Optionnel : on force le scroll en haut pour éviter les décalages
        window.scrollTo(0, 0);
    } else {
        // Fallback pour vieux navigateurs
        document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);
    }
};

// On écoute le redimensionnement du viewport (clavier qui s'ouvre/ferme)
if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setAppHeight);
    window.visualViewport.addEventListener('scroll', setAppHeight); // Parfois nécessaire si le clavier shift le layout
}
window.addEventListener('resize', setAppHeight);

// Appel initial
setAppHeight();
// --- FIN FIX ---

