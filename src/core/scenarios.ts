// @ts-nocheck
import forSimpleCode from '../../saves/01-for-simple.js?raw';
import whileSimpleCode from '../../saves/02-while-simple.js?raw';
import functionSimpleCode from '../../saves/03-function-simple.js?raw';
import arrowSimpleCode from '../../saves/04-arrow-simple.js?raw';
import domSimpleHtml from '../../saves/05-dom-simple.html?raw';
import variablesSimpleCode from '../../saves/06-variables-declaration-assignation.js?raw';
import operationsSimpleCode from '../../saves/07-operations.js?raw';
import conditionsSimpleCode from '../../saves/08-conditions-if-elseif-else-switch.js?raw';

export const SCENARIOS = [
    { id: 'for-simple', title: 'Boucle for', kind: 'js', code: forSimpleCode.trim() },
    { id: 'while-simple', title: 'Boucle while', kind: 'js', code: whileSimpleCode.trim() },
    { id: 'function-simple', title: 'Fonction', kind: 'js', code: functionSimpleCode.trim() },
    { id: 'arrow-simple', title: 'Arrow function', kind: 'js', code: arrowSimpleCode.trim() },
    { id: 'dom-simple', title: 'DOM simple', kind: 'html', html: domSimpleHtml.trim() },
    { id: 'variables-simple', title: 'Variables', kind: 'js', code: variablesSimpleCode.trim() },
    { id: 'operations-simple', title: 'Operations', kind: 'js', code: operationsSimpleCode.trim() },
    { id: 'conditions-simple', title: 'Conditions (if / switch)', kind: 'js', code: conditionsSimpleCode.trim() },
];
