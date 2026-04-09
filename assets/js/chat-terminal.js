/* ============================================================
   Searcus — Chat Terminal (plug-and-play, removable)
   Zero dependencies · IIFE vanilla
   Si aggancia al .terminal-window hero e attiva una chat RAG
   dopo che la typewriter animation CSS ha finito di stampare
   le 8 righe statiche (~17.4s).

   Backend: POST /api/chat  (same-origin, reverse-proxy nginx
   verso il plugin eve_rag su evemilano.com via loopback).

   Rimuovi il <script> tag + il <link> a chat-terminal.css
   per disabilitare completamente.
   ============================================================ */
(function () {
    'use strict';

    // ─── Config ───
    const API_ENDPOINT = '/api/chat';
    const HERO_TYPEWRITER_DURATION_MS = 17600; // 15.4s delay + 2s anim + ~200ms margin
    const MAX_INPUT = 1500;                    // match plugin eve_rag max_input_chars
    const FETCH_TIMEOUT_MS = 45000;            // > plugin OpenAI latency but bounded
    const TYPE_SPEED_MS = 24;                  // ms per char in bot reply typewriter
    const SESSION_STORAGE_KEY = 'searcus-chat-sid';
    const ALLOWED_SOURCE_HOSTS = ['www.evemilano.com', 'evemilano.com'];

    // ─── i18n ───
    const STRINGS = {
        it: {
            welcome: "Ciao! Sono l'assistente AI di Searcus. Chiedimi qualcosa sui nostri servizi SEO, Google Ads, formazione o local SEO.",
            placeholder: "scrivi la tua domanda…",
            thinking: "elaborando",
            sources_header: "[fonti]",
            err_rate: "⚠ Troppe richieste, attendi qualche secondo.",
            err_network: "⚠ Connessione interrotta. Riprova.",
            err_timeout: "⚠ La richiesta ha impiegato troppo tempo.",
            err_empty: "⚠ Risposta vuota.",
            input_aria: "Campo di input del chatbot Searcus"
        },
        en: {
            welcome: "Hi! I'm Searcus AI assistant. Ask me about our SEO, Google Ads, training or local SEO services.",
            placeholder: "type your question…",
            thinking: "thinking",
            sources_header: "[sources]",
            err_rate: "⚠ Too many requests, please wait a moment.",
            err_network: "⚠ Connection error. Please retry.",
            err_timeout: "⚠ Request took too long.",
            err_empty: "⚠ Empty response.",
            input_aria: "Searcus chatbot input field"
        }
    };

    // ─── State ───
    const state = {
        lang: 'it',
        strings: STRINGS.it,
        terminalWindow: null,
        body: null,
        sessionId: null,
        isInFlight: false,
        initialized: false,
        prefersReducedMotion: false,
        terminalInView: true
    };

    // ─── Utilities ───

    function detectLang() {
        const raw = (document.documentElement.getAttribute('lang') || 'it').toLowerCase();
        return raw.startsWith('en') ? 'en' : 'it';
    }

    function generateUUID() {
        if (window.crypto && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        // fallback UUID v4
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getOrCreateSessionId() {
        try {
            let sid = sessionStorage.getItem(SESSION_STORAGE_KEY);
            if (!sid) {
                sid = generateUUID();
                sessionStorage.setItem(SESSION_STORAGE_KEY, sid);
            }
            return sid;
        } catch (e) {
            // sessionStorage indisponibile (privacy mode?) → memoria volatile
            if (!state.sessionId) state.sessionId = generateUUID();
            return state.sessionId;
        }
    }

    function findTerminal() {
        const tw = document.querySelector('.terminal-window.bg-obsidian.max-w-xl');
        if (!tw) return null;
        // Il body del terminale è il SECONDO figlio diretto (dopo .terminal-header).
        // NON usare querySelector('.font-mono') perché matcherebbe prima lo <span>
        // del label "terminal" dentro l'header (document-order depth-first).
        const body = tw.children && tw.children.length >= 2 ? tw.children[1] : null;
        if (!body) return null;
        return { tw: tw, body: body };
    }

    function scrollToBottom() {
        if (state.body) state.body.scrollTop = state.body.scrollHeight;
    }

    // ─── Markdown rendering (marked + DOMPurify, pattern da eve_rag) ───
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // Decodifica entità HTML (es. &#8211; → –) nei titoli delle sources che WP
    // spesso ritorna pre-encoded.
    function decodeHtmlEntities(text) {
        if (text == null) return '';
        const ta = document.createElement('textarea');
        ta.innerHTML = String(text);
        return ta.value;
    }

    // Rende una stringa markdown in HTML sicuro. Pattern identico al widget
    // di eve_rag (marked.parse → DOMPurify.sanitize), con fallback plain text
    // + <br> se i vendor non sono caricati.
    function renderMarkdown(text) {
        const source = text == null ? '' : String(text);
        let html = '';
        if (typeof window.marked !== 'undefined') {
            try {
                html = window.marked.parse(source);
            } catch (e) {
                html = escapeHtml(source).replace(/\n/g, '<br>');
            }
        } else {
            html = escapeHtml(source).replace(/\n/g, '<br>');
        }
        if (typeof window.DOMPurify !== 'undefined') {
            try {
                html = window.DOMPurify.sanitize(html, {
                    ADD_ATTR: ['target', 'rel']
                });
            } catch (e) {
                html = escapeHtml(source).replace(/\n/g, '<br>');
            }
        }
        return html;
    }

    // Rafforza i link generati dal markdown: target=_blank, rel=noopener,
    // classe coerente. Applicato dopo l'inserimento nel DOM.
    function hardenLinks(rootEl) {
        if (!rootEl) return;
        const links = rootEl.querySelectorAll('a[href]');
        links.forEach(function (a) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener');
            a.classList.add('chat-source-link');
        });
    }

    // Typewriter sui text node di un sotto-albero DOM.
    // L'HTML (link, <strong>, <li>, ecc.) è già presente nel DOM ma i text
    // node sono stati svuotati: vengono riempiti progressivamente carattere
    // per carattere in document order. Così l'utente vede il testo apparire
    // in stile terminale ma già con la formattazione markdown corretta.
    function typeIntoElement(rootEl, speedMs) {
        return new Promise(function (resolve) {
            // Raccoglie i text node in document order
            const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
            const nodes = [];
            let n;
            while ((n = walker.nextNode())) {
                const original = n.nodeValue;
                if (original && original.length > 0) {
                    nodes.push({ node: n, text: original });
                    n.nodeValue = '';
                }
            }
            if (nodes.length === 0) { resolve(); return; }

            let nodeIdx = 0;
            let charIdx = 0;
            const speed = Math.max(1, speedMs | 0);

            function tick() {
                if (nodeIdx >= nodes.length) { resolve(); return; }
                const cur = nodes[nodeIdx];
                charIdx++;
                cur.node.nodeValue = cur.text.slice(0, charIdx);

                // Scroll interno solo ogni tot char per non floodare il layout
                if (charIdx % 4 === 0) scrollToBottom();

                if (charIdx >= cur.text.length) {
                    nodeIdx++;
                    charIdx = 0;
                }
                setTimeout(tick, speed);
            }
            tick();
        });
    }

    // ─── Rendering righe terminale ───

    function appendStaticLine(className, html) {
        const div = document.createElement('div');
        div.className = 'terminal-static-line ' + (className || '');
        if (html !== undefined && html !== null) div.innerHTML = html;
        state.body.appendChild(div);
        scrollToBottom();
        return div;
    }

    function appendUserCommand(text) {
        const div = document.createElement('div');
        div.className = 'terminal-static-line chat-msg-user';
        const prompt = document.createElement('span');
        prompt.className = 'text-mist';
        prompt.textContent = '$ ';
        const msg = document.createElement('span');
        msg.className = 'text-chalk';
        msg.textContent = text;
        div.appendChild(prompt);
        div.appendChild(msg);
        state.body.appendChild(div);
        scrollToBottom();
    }

    function appendThinkingLine() {
        const div = document.createElement('div');
        div.className = 'terminal-static-line chat-msg-bot chat-thinking';
        div.setAttribute('data-chat-thinking', '1');
        div.innerHTML = '<span class="text-mist">&gt;</span> <span>' + escapeHtml(state.strings.thinking) + '</span>';
        state.body.appendChild(div);
        scrollToBottom();
        return div;
    }

    function removeThinking() {
        const el = state.body.querySelector('[data-chat-thinking="1"]');
        if (el) el.remove();
    }

    // Inserisce la risposta del bot come blocco markdown renderizzato e
    // applica un typewriter sui text node dell'albero DOM: la struttura
    // (link, bold, liste) è già presente, i caratteri appaiono progressivamente.
    function renderBotReply(reply) {
        const wrapper = document.createElement('div');
        wrapper.className = 'terminal-static-line chat-msg-bot chat-msg-bot-md';

        const gt = document.createElement('span');
        gt.className = 'text-mist chat-bot-prompt';
        gt.textContent = '> ';
        wrapper.appendChild(gt);

        const content = document.createElement('span');
        content.className = 'chat-bot-content';
        content.innerHTML = renderMarkdown(reply);
        hardenLinks(content);
        wrapper.appendChild(content);

        state.body.appendChild(wrapper);
        scrollToBottom();

        if (state.prefersReducedMotion) {
            // niente animazione: il testo è già inserito così com'è
            return Promise.resolve();
        }
        return typeIntoElement(content, TYPE_SPEED_MS).then(function () {
            scrollToBottom();
        });
    }

    function appendSources(sources) {
        if (!Array.isArray(sources) || sources.length === 0) return;
        // header
        const header = document.createElement('div');
        header.className = 'terminal-static-line chat-sources-header';
        header.innerHTML = '<span class="text-mist">' + escapeHtml(state.strings.sources_header) + '</span>';
        state.body.appendChild(header);

        sources.forEach(function (src, idx) {
            const line = document.createElement('div');
            line.className = 'terminal-static-line chat-source-line';
            const num = '[' + (idx + 1) + '] ';
            // decodeHtmlEntities per trasformare &#8211; → –, &amp; → & ecc.
            // (WP restituisce i titoli pre-encoded).
            const rawTitle = (src && src.title) ? decodeHtmlEntities(src.title) : '(untitled)';
            let hostAllowed = false;
            let safeUrl = '';
            try {
                const u = new URL(src.url);
                if (ALLOWED_SOURCE_HOSTS.indexOf(u.hostname) !== -1) {
                    hostAllowed = true;
                    safeUrl = u.href;
                }
            } catch (e) { /* noop */ }

            if (hostAllowed) {
                line.innerHTML =
                    '<span class="text-mist">' + escapeHtml(num) + '</span>' +
                    '<a href="' + escapeHtml(safeUrl) + '" target="_blank" rel="noopener" class="chat-source-link">' +
                    escapeHtml(rawTitle) +
                    '</a>';
            } else {
                line.innerHTML =
                    '<span class="text-mist">' + escapeHtml(num) + '</span>' +
                    '<span>' + escapeHtml(rawTitle) + '</span>';
            }
            state.body.appendChild(line);
        });
        scrollToBottom();
    }

    // ─── Input row ───

    function createInputRow() {
        const row = document.createElement('div');
        row.className = 'chat-input-row terminal-static-line';

        const prompt = document.createElement('span');
        prompt.className = 'text-mist chat-input-prompt';
        prompt.textContent = '$';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'chat-input';
        input.placeholder = state.strings.placeholder;
        input.maxLength = MAX_INPUT;
        input.setAttribute('aria-label', state.strings.input_aria);
        input.setAttribute('autocomplete', 'off');
        input.setAttribute('spellcheck', 'false');

        row.appendChild(prompt);
        row.appendChild(input);
        state.body.appendChild(row);
        scrollToBottom();

        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleSubmit(input.value, row);
            } else if (e.key === 'Escape') {
                input.blur();
            }
        });

        if (state.terminalInView) {
            setTimeout(function () { try { input.focus(); } catch (e) {} }, 60);
        }
        return { row: row, input: input };
    }

    // ─── Submit ───

    async function handleSubmit(rawValue, inputRow) {
        if (state.isInFlight) return;
        const message = (rawValue || '').trim();
        if (!message) return;

        state.isInFlight = true;

        // Rimuovi la riga input (verrà ricreata dopo la risposta)
        if (inputRow && inputRow.parentNode) inputRow.parentNode.removeChild(inputRow);

        // Echo del comando utente
        appendUserCommand(message);

        // Thinking indicator
        appendThinkingLine();

        const controller = new AbortController();
        const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);

        let response, data;
        try {
            response = await fetch(API_ENDPOINT, {
                method: 'POST',
                credentials: 'omit',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: message.slice(0, MAX_INPUT),
                    session_id: state.sessionId,
                    current_url: window.location.href
                }),
                signal: controller.signal
            });
        } catch (err) {
            clearTimeout(timer);
            removeThinking();
            if (err && err.name === 'AbortError') {
                appendStaticLine('chat-msg-error', '<span class="text-ember">' + escapeHtml(state.strings.err_timeout) + '</span>');
            } else {
                appendStaticLine('chat-msg-error', '<span class="text-ember">' + escapeHtml(state.strings.err_network) + '</span>');
            }
            state.isInFlight = false;
            createInputRow();
            return;
        }
        clearTimeout(timer);

        if (!response.ok) {
            removeThinking();
            const msg = (response.status === 429) ? state.strings.err_rate : state.strings.err_network;
            appendStaticLine('chat-msg-error', '<span class="text-ember">' + escapeHtml(msg) + '</span>');
            state.isInFlight = false;
            createInputRow();
            return;
        }

        try {
            data = await response.json();
        } catch (e) {
            removeThinking();
            appendStaticLine('chat-msg-error', '<span class="text-ember">' + escapeHtml(state.strings.err_network) + '</span>');
            state.isInFlight = false;
            createInputRow();
            return;
        }

        removeThinking();

        const reply = (data && typeof data.reply === 'string') ? data.reply.trim() : '';
        if (!reply) {
            appendStaticLine('chat-msg-error', '<span class="text-ember">' + escapeHtml(state.strings.err_empty) + '</span>');
        } else {
            await renderBotReply(reply);
        }

        if (data && Array.isArray(data.sources) && data.sources.length > 0) {
            appendSources(data.sources);
        }

        // Se il backend ha restituito un session_id diverso (es. primo giro), aggiorna
        if (data && typeof data.session_id === 'string' && data.session_id !== state.sessionId) {
            state.sessionId = data.session_id;
            try { sessionStorage.setItem(SESSION_STORAGE_KEY, state.sessionId); } catch (e) {}
        }

        state.isInFlight = false;
        createInputRow();
    }

    // ─── Activation ───

    async function activateChat() {
        if (state.initialized) return;
        state.initialized = true;

        // Fissa altezza massima del body terminale + scroll interno
        const currentH = state.body.scrollHeight;
        state.body.style.maxHeight = (currentH + 220) + 'px';
        state.body.classList.add('terminal-scrollable');

        // Rimuovi il caret lampeggiante dall'ultima riga statica originale
        const lastStatic = state.body.querySelector('.terminal-line.terminal-cursor');
        if (lastStatic) lastStatic.classList.remove('terminal-cursor');

        // ARIA
        state.body.setAttribute('role', 'log');
        state.body.setAttribute('aria-live', 'polite');
        state.body.setAttribute('aria-label', state.lang === 'en' ? 'Chat conversation' : 'Conversazione chat');

        // Welcome: prompt statico + testo in typewriter (coerente con le righe sopra)
        const welcome = document.createElement('div');
        welcome.className = 'terminal-static-line chat-welcome';
        const gt = document.createElement('span');
        gt.className = 'text-mist';
        gt.textContent = '> ';
        const txt = document.createElement('span');
        txt.textContent = state.strings.welcome;
        welcome.appendChild(gt);
        welcome.appendChild(txt);
        state.body.appendChild(welcome);
        scrollToBottom();

        if (!state.prefersReducedMotion) {
            await typeIntoElement(txt, TYPE_SPEED_MS);
        }

        // Prima input row (dopo che il welcome è completo)
        createInputRow();
        scrollToBottom();
    }

    function init() {
        const found = findTerminal();
        if (!found) return; // niente terminale in pagina → silent no-op

        state.terminalWindow = found.tw;
        state.body = found.body;
        state.lang = detectLang();
        state.strings = STRINGS[state.lang];
        state.prefersReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        state.sessionId = getOrCreateSessionId();

        // Traccia se il terminale è in viewport (per decidere se rubare focus)
        if (typeof IntersectionObserver === 'function') {
            const io = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    state.terminalInView = entry.isIntersecting;
                });
            }, { threshold: 0.3 });
            io.observe(state.terminalWindow);
        }

        // Con reduced-motion la CSS-typewriter dell'hero è comunque più lenta che statica
        // (la regola esistente non viene disabilitata). Teniamo lo stesso timing per
        // non interferire con le righe statiche. Se l'utente vuole davvero saltare,
        // può già scorrere: nessun side effect.
        const delay = state.prefersReducedMotion ? 400 : HERO_TYPEWRITER_DURATION_MS;
        setTimeout(activateChat, delay);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
