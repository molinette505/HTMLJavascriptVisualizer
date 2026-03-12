// @ts-nocheck

export const getFlowVisualElement = (element) => {
    if (!element || !element.classList) return element;
    if (element.classList.contains('mem-val')) {
        const valueContent = element.querySelector('.mem-val-content');
        if (valueContent) return valueContent;
    }
    return element;
};

let flowGuideCounter = 1;

export const createFlowGuideLine = (sourceEl, destinationEl, showFlowLine = true) => {
    const noop = {
        stop: () => {},
        expand: async () => {},
        collapse: async () => {},
        show: () => {},
        hide: () => {}
    };
    if (!sourceEl || !destinationEl || typeof document === 'undefined') return noop;
    if (showFlowLine === false) return noop;
    const sourceTarget = getFlowVisualElement(sourceEl);
    const destinationTarget = getFlowVisualElement(destinationEl);
    if (!sourceTarget || !destinationTarget) return noop;
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('flow-link-line');
    svg.setAttribute('preserveAspectRatio', 'none');
    const gradientId = `flow-link-gradient-${flowGuideCounter++}`;

    const defs = document.createElementNS(svgNS, 'defs');
    const gradient = document.createElementNS(svgNS, 'linearGradient');
    gradient.setAttribute('id', gradientId);
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '0%');

    const stopStart = document.createElementNS(svgNS, 'stop');
    stopStart.setAttribute('offset', '0%');
    stopStart.setAttribute('stop-color', '#67e8f9');
    stopStart.setAttribute('stop-opacity', '1');
    gradient.appendChild(stopStart);

    const stopMid = document.createElementNS(svgNS, 'stop');
    stopMid.setAttribute('offset', '50%');
    stopMid.setAttribute('stop-color', '#60a5fa');
    stopMid.setAttribute('stop-opacity', '1');
    gradient.appendChild(stopMid);

    const stopEnd = document.createElementNS(svgNS, 'stop');
    stopEnd.setAttribute('offset', '100%');
    stopEnd.setAttribute('stop-color', '#3b82f6');
    stopEnd.setAttribute('stop-opacity', '1');
    gradient.appendChild(stopEnd);

    defs.appendChild(gradient);
    svg.appendChild(defs);

    const glowPath = document.createElementNS(svgNS, 'path');
    glowPath.classList.add('flow-link-path', 'flow-link-path-glow');
    glowPath.setAttribute('stroke', `url(#${gradientId})`);
    svg.appendChild(glowPath);

    const corePath = document.createElementNS(svgNS, 'path');
    corePath.classList.add('flow-link-path', 'flow-link-path-core');
    corePath.setAttribute('stroke', `url(#${gradientId})`);
    svg.appendChild(corePath);

    const sourceDot = document.createElementNS(svgNS, 'circle');
    sourceDot.classList.add('flow-link-endpoint', 'source');
    sourceDot.setAttribute('r', '4.5');
    svg.appendChild(sourceDot);

    const destinationDot = document.createElementNS(svgNS, 'circle');
    destinationDot.classList.add('flow-link-endpoint', 'destination');
    destinationDot.setAttribute('r', '5.2');
    svg.appendChild(destinationDot);

    document.body.appendChild(svg);
    let rafId = null;
    let tweenId = null;
    let active = true;
    let leadProgress = 0;
    let trailProgress = 0;
    const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
    const setProgress = (lead, trail) => {
        leadProgress = clamp(lead);
        trailProgress = clamp(trail);
        if (trailProgress > leadProgress) trailProgress = leadProgress;
    };
    const tweenProgress = (toLead, toTrail, duration = 120, easing = 'out') => new Promise((resolve) => {
        if (!active) { resolve(); return; }
        const fromLead = leadProgress;
        const fromTrail = trailProgress;
        const targetLead = clamp(toLead);
        const targetTrail = clamp(toTrail);
        if (duration <= 0) {
            setProgress(targetLead, targetTrail);
            resolve();
            return;
        }
        if (tweenId) cancelAnimationFrame(tweenId);
        const startTime = (typeof performance !== 'undefined' && typeof performance.now === 'function')
            ? performance.now()
            : Date.now();
        const tick = (now) => {
            if (!active) { resolve(); return; }
            const elapsed = Math.max(0, now - startTime);
            const ratio = Math.min(1, elapsed / duration);
            let eased = ratio;
            if (ratio < 1) {
                if (easing === 'in') eased = Math.pow(ratio, 3);
                else if (easing === 'out') eased = 1 - Math.pow(1 - ratio, 3);
                else eased = ratio;
            }
            const nextLead = fromLead + (targetLead - fromLead) * eased;
            const nextTrail = fromTrail + (targetTrail - fromTrail) * eased;
            setProgress(nextLead, nextTrail);
            if (ratio < 1) {
                tweenId = requestAnimationFrame(tick);
            } else {
                tweenId = null;
                resolve();
            }
        };
        tweenId = requestAnimationFrame(tick);
    });
    const update = () => {
        if (!active) return;
        const overlayRect = svg.getBoundingClientRect();
        const overlayWidth = Math.max(1, overlayRect.width);
        const overlayHeight = Math.max(1, overlayRect.height);
        const sourceRect = sourceTarget.getBoundingClientRect();
        const destinationRect = destinationTarget.getBoundingClientRect();
        const startX = sourceRect.left + sourceRect.width / 2 - overlayRect.left;
        const startY = sourceRect.top + sourceRect.height / 2 - overlayRect.top;
        const endX = destinationRect.left + destinationRect.width / 2 - overlayRect.left;
        const endY = destinationRect.top + destinationRect.height / 2 - overlayRect.top;
        const drawStartX = startX + (endX - startX) * trailProgress;
        const drawStartY = startY + (endY - startY) * trailProgress;
        const drawEndX = startX + (endX - startX) * leadProgress;
        const drawEndY = startY + (endY - startY) * leadProgress;
        const pathData = `M ${drawStartX} ${drawStartY} L ${drawEndX} ${drawEndY}`;
        svg.setAttribute('viewBox', `0 0 ${overlayWidth} ${overlayHeight}`);
        glowPath.setAttribute('d', pathData);
        corePath.setAttribute('d', pathData);
        sourceDot.setAttribute('cx', String(startX));
        sourceDot.setAttribute('cy', String(startY));
        destinationDot.setAttribute('cx', String(endX));
        destinationDot.setAttribute('cy', String(endY));
        rafId = requestAnimationFrame(update);
    };
    update();
    return {
        expand: (duration = 120) => tweenProgress(1, 0, duration, 'in'),
        collapse: (duration = 120) => tweenProgress(1, 1, duration, 'out'),
        show: () => setProgress(1, 0),
        hide: () => setProgress(0, 0),
        stop: () => {
            active = false;
            if (rafId) cancelAnimationFrame(rafId);
            if (tweenId) cancelAnimationFrame(tweenId);
            if (svg.parentElement) svg.remove();
        }
    };
};
