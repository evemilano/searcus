/* ============================================================
   Searcus — Custom Tech Cursor (plug-and-play, removable)
   Zero dependencies · IIFE · rAF + lerp
   Rimuovi il <script> tag per disabilitare completamente.
   ============================================================ */
(function () {
    'use strict';

    // Early return: touch devices o reduced motion
    if (
        !window.matchMedia ||
        window.matchMedia('(pointer: coarse)').matches ||
        window.matchMedia('(hover: none)').matches
    ) {
        return;
    }

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const INTERACTIVE_SELECTOR = 'a, button, [role="button"], input, textarea, select, label, [data-cursor]';
    const LERP = 0.22;

    let dot, ring;
    let targetX = -100;
    let targetY = -100;
    let ringX = -100;
    let ringY = -100;
    let rafId = null;
    let initialized = false;

    function init() {
        if (initialized) return;
        initialized = true;

        dot = document.createElement('div');
        dot.className = 'cursor-dot is-hidden';
        dot.setAttribute('aria-hidden', 'true');

        ring = document.createElement('div');
        ring.className = 'cursor-ring is-hidden';
        ring.setAttribute('aria-hidden', 'true');

        document.body.appendChild(ring);
        document.body.appendChild(dot);

        window.addEventListener('pointermove', onPointerMove, { passive: true });
        window.addEventListener('pointerdown', onPointerDown, { passive: true });
        window.addEventListener('pointerup', onPointerUp, { passive: true });
        window.addEventListener('pointerover', onPointerOver, { passive: true });
        document.addEventListener('mouseleave', onMouseLeave);
        document.addEventListener('mouseenter', onMouseEnter);

        loop();
    }

    function onPointerMove(e) {
        targetX = e.clientX;
        targetY = e.clientY;

        if (dot.classList.contains('is-hidden')) {
            dot.classList.remove('is-hidden');
            ring.classList.remove('is-hidden');
            // snap ring alla prima posizione per evitare "volo" dal bordo
            ringX = targetX;
            ringY = targetY;
        }
    }

    function onPointerDown() {
        ring.classList.add('is-click');
    }

    function onPointerUp() {
        ring.classList.remove('is-click');
    }

    function onPointerOver(e) {
        const target = e.target;
        if (!target || target.nodeType !== 1) return;
        const interactive = target.closest(INTERACTIVE_SELECTOR);
        if (interactive) {
            dot.classList.add('is-hover');
            ring.classList.add('is-hover');
        } else {
            dot.classList.remove('is-hover');
            ring.classList.remove('is-hover');
        }
    }

    function onMouseLeave() {
        dot.classList.add('is-hidden');
        ring.classList.add('is-hidden');
    }

    function onMouseEnter() {
        dot.classList.remove('is-hidden');
        ring.classList.remove('is-hidden');
    }

    function loop() {
        // Dot: posizione esatta istantanea
        dot.style.setProperty('--cursor-x', targetX + 'px');
        dot.style.setProperty('--cursor-y', targetY + 'px');

        // Ring: lerp trailing (disabilitato se reduced motion → snap)
        if (prefersReducedMotion) {
            ringX = targetX;
            ringY = targetY;
        } else {
            ringX += (targetX - ringX) * LERP;
            ringY += (targetY - ringY) * LERP;
        }
        ring.style.setProperty('--cursor-ring-x', ringX + 'px');
        ring.style.setProperty('--cursor-ring-y', ringY + 'px');

        rafId = requestAnimationFrame(loop);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
