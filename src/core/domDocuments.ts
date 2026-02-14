// @ts-nocheck
import boutiqueHtml from '../../dom-saves/01-boutique.html?raw';
import formulaireHtml from '../../dom-saves/02-formulaire.html?raw';
import listeCoursesHtml from '../../dom-saves/03-dom-liste-courses.html?raw';
import querySelectorManipulationsHtml from '../../dom-saves/04-dom-queryselector-manipulations.html?raw';

export const DOM_DOCUMENTS = [
    { id: 'boutique', title: 'HTML Boutique', html: boutiqueHtml.trim() },
    { id: 'formulaire', title: 'HTML Formulaire', html: formulaireHtml.trim() },
    { id: 'dom-liste-courses', title: 'HTML DOM - Liste de courses', html: listeCoursesHtml.trim() },
    { id: 'dom-queryselector-manipulations', title: 'HTML DOM - QuerySelector et manipulations', html: querySelectorManipulationsHtml.trim() },
];
