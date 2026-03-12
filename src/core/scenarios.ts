// @ts-nocheck
// File purpose: discover and normalize lesson scenarios shown in the scenario loader.

const scenarioFiles = import.meta.glob('../../saves/*.{js,html}', {
    eager: true,
    query: '?raw',
    import: 'default'
});

const SCENARIO_OVERRIDES = {
    '01-for-simple.js': { id: 'for-simple', title: 'Boucle for' },
    '02-while-simple.js': { id: 'while-simple', title: 'Boucle while' },
    '03-function-simple.js': { id: 'function-simple', title: 'Fonction' },
    '04-arrow-simple.js': { id: 'arrow-simple', title: 'Arrow function' },
    '05-dom-simple.html': { id: 'dom-simple', title: 'DOM simple' },
    '06-variables-declaration-assignation.js': { id: 'variables-simple', title: 'Variables' },
    '07-operations.js': { id: 'operations-simple', title: 'Operations' },
    '08-conditions-if-elseif-else-switch.js': { id: 'conditions-simple', title: 'Conditions (if / switch)' },
    '12-p5-delta-time.js': {
        id: 'p5-delta-time',
        title: 'p5.js - DeltaTime fixe',
        ui: { p5ModeEnabled: true }
    }
};

const getFileName = (path) => path.split('/').pop() || path;

const TITLE_SEGMENT_OVERRIDES = {
    dom: 'DOM',
    js: 'JS',
    html: 'HTML',
    p5: 'p5',
    queryselector: 'QuerySelector'
};

const toScenarioId = (fileName) => fileName
    .replace(/\.[^.]+$/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const toScenarioTitle = (fileName) => {
    const baseName = fileName.replace(/\.[^.]+$/, '');
    const cleanName = baseName.replace(/^\d+[-_]?/, '');
    return cleanName
        .split(/[-_]+/)
        .filter(Boolean)
        .map((segment) => {
            const lower = segment.toLowerCase();
            if (TITLE_SEGMENT_OVERRIDES[lower]) return TITLE_SEGMENT_OVERRIDES[lower];
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(' ');
};

const getScenarioOrder = (fileName) => {
    const match = fileName.match(/^(\d+)[-_]/);
    return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
};

const buildScenario = (path, rawContent) => {
    const fileName = getFileName(path);
    const extension = fileName.split('.').pop()?.toLowerCase();
    const isHtml = extension === 'html';
    const kind = isHtml ? 'html' : 'js';
    const override = SCENARIO_OVERRIDES[fileName] || {};
    const scenario = {
        id: override.id || toScenarioId(fileName),
        title: override.title || toScenarioTitle(fileName),
        kind,
        ...(override.ui ? { ui: override.ui } : {})
    };

    if (kind === 'html') {
        scenario.html = String(rawContent || '').trim();
    } else {
        scenario.code = String(rawContent || '').trim();
    }

    return {
        fileName,
        order: getScenarioOrder(fileName),
        scenario
    };
};

export const SCENARIOS = Object.entries(scenarioFiles)
    .map(([path, rawContent]) => buildScenario(path, rawContent))
    .sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return a.fileName.localeCompare(b.fileName, 'en');
    })
    .map((entry) => entry.scenario);
