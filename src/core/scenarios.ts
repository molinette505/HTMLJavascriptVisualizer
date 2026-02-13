// @ts-nocheck
import creationVariablesCode from '../../saves/01-creation-variables.js?raw';
import operationsArithmetiquesCode from '../../saves/02-operations-arithmetiques.js?raw';
import operationsComparaisonCode from '../../saves/03-operations-comparaison.js?raw';
import conditionsCode from '../../saves/04-conditions.js?raw';
import arraysCode from '../../saves/05-arrays-et-methodes.js?raw';
import stringsCode from '../../saves/06-strings.js?raw';
import bouclesCode from '../../saves/07-boucles.js?raw';
import functionsCode from '../../saves/08-functions-et-arrow-functions.js?raw';

export const SCENARIOS = [
    { id: 'creation-variables', title: 'Creation de variables', code: creationVariablesCode.trim() },
    { id: 'operations-arithmetiques', title: 'Operations arithmetiques', code: operationsArithmetiquesCode.trim() },
    { id: 'operations-comparaison', title: 'Operations de comparaison', code: operationsComparaisonCode.trim() },
    { id: 'conditions', title: 'Conditions', code: conditionsCode.trim() },
    { id: 'arrays-methodes', title: 'Arrays et methodes', code: arraysCode.trim() },
    { id: 'strings', title: 'Strings', code: stringsCode.trim() },
    { id: 'boucles', title: 'Boucles', code: bouclesCode.trim() },
    { id: 'functions-arrow', title: 'Function et Arrow Function', code: functionsCode.trim() },
];
