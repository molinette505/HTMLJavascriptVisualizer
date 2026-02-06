// @ts-nocheck
export class Scope {
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
