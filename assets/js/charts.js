// Searcus Swiss SAGL — Charts & Web Vitals Dashboard

document.addEventListener('DOMContentLoaded', function () {

    // ========== CONSTANTS ==========
    var CWV = {
        LCP: { good: 2500, poor: 4000, unit: 'ms', max: 6000 },
        CLS: { good: 0.1, poor: 0.25, unit: '', max: 0.5 },
        INP: { good: 200, poor: 500, unit: 'ms', max: 800 }
    };

    var COLORS = {
        good: '#10B981',
        mid: '#F59E0B',
        poor: '#EF4444',
        signal: '#6366F1',
        flare: '#818CF8',
        mist: '#9896A8',
        wire: '#2A2A3A',
        chalk: '#E8E6F0'
    };

    function metricColor(thresholds, value) {
        if (value <= thresholds.good) return COLORS.good;
        if (value <= thresholds.poor) return COLORS.mid;
        return COLORS.poor;
    }

    // ========== CHART 1: PAGESPEED INSIGHTS ==========
    var PSI_CACHE_KEY = 'searcus_psi_v2';
    var PSI_CACHE_TTL = 86400000; // 24h

    function getCachedPSI() {
        try {
            var c = JSON.parse(localStorage.getItem(PSI_CACHE_KEY));
            if (c && Date.now() - c.ts < PSI_CACHE_TTL) return c.data;
        } catch (e) {}
        return null;
    }

    function setCachedPSI(data) {
        try {
            localStorage.setItem(PSI_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
        } catch (e) {}
    }

    function parsePSI(json) {
        var lh = json.lighthouseResult;
        var le = json.loadingExperience || {};
        var metrics = le.metrics || {};
        var score = lh.categories.performance.score;
        var lcp = lh.audits['largest-contentful-paint'].numericValue;
        var cls = lh.audits['cumulative-layout-shift'].numericValue;
        // INP from field data (CrUX), fallback to lab TBT as proxy
        var inp = metrics.INTERACTION_TO_NEXT_PAINT
            ? metrics.INTERACTION_TO_NEXT_PAINT.percentile
            : null;
        return { score: score, lcp: lcp, cls: cls, inp: inp };
    }

    function drawGauge(containerId, score) {
        var svg = document.getElementById(containerId);
        if (!svg) return;
        var r = 62, cx = 80, cy = 80;
        var circ = 2 * Math.PI * r;
        var arc = circ * 0.75; // 270 deg
        var color = score >= 0.9 ? COLORS.good : score >= 0.5 ? COLORS.mid : COLORS.poor;
        var val = Math.round(score * 100);

        svg.innerHTML =
            '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + COLORS.wire + '" stroke-width="8" stroke-dasharray="' + arc + ' ' + circ + '" transform="rotate(135 ' + cx + ' ' + cy + ')"/>' +
            '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + arc + ' ' + circ + '" stroke-dashoffset="' + arc + '" transform="rotate(135 ' + cx + ' ' + cy + ')" class="psi-gauge-arc" data-target="' + (arc - arc * score) + '"/>' +
            '<text x="' + cx + '" y="' + cy + '" text-anchor="middle" dominant-baseline="central" fill="' + color + '" font-family="Space Grotesk,sans-serif" font-size="36" font-weight="700">' + val + '</text>' +
            '<text x="' + cx + '" y="' + (cy + 28) + '" text-anchor="middle" fill="' + COLORS.mist + '" font-family="JetBrains Mono,monospace" font-size="10">Performance</text>';

        // Animate gauge arc
        requestAnimationFrame(function () {
            var arcEl = svg.querySelector('.psi-gauge-arc');
            if (arcEl) {
                var target = parseFloat(arcEl.getAttribute('data-target'));
                arcEl.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.4,0,0.2,1)';
                arcEl.style.strokeDashoffset = target;
            }
        });
    }

    function formatMetric(value, unit) {
        if (value === null || value === undefined) return 'N/A';
        if (unit === 'ms') {
            return value >= 1000 ? (value / 1000).toFixed(2) + 's' : Math.round(value) + 'ms';
        }
        return value.toFixed(3);
    }

    function renderPSI(data) {
        var loading = document.getElementById('psi-loading');
        var results = document.getElementById('psi-results');
        if (!results) return;

        if (loading) loading.classList.add('hidden');
        results.classList.remove('hidden');
        results.classList.add('chart-fade-in');

        drawGauge('psi-gauge', data.score);

        var lcpEl = document.getElementById('psi-lcp');
        var clsEl = document.getElementById('psi-cls');
        var inpEl = document.getElementById('psi-inp');

        if (lcpEl) {
            lcpEl.textContent = formatMetric(data.lcp, 'ms');
            lcpEl.style.color = metricColor(CWV.LCP, data.lcp);
        }
        if (clsEl) {
            clsEl.textContent = formatMetric(data.cls, '');
            clsEl.style.color = metricColor(CWV.CLS, data.cls);
        }
        if (inpEl) {
            inpEl.textContent = data.inp !== null ? formatMetric(data.inp, 'ms') : 'N/A';
            if (data.inp !== null) inpEl.style.color = metricColor(CWV.INP, data.inp);
        }

        var tsEl = document.getElementById('psi-timestamp');
        if (tsEl) tsEl.textContent = 'Analisi live: ' + new Date().toLocaleString();
    }

    function showPSIError() {
        var loading = document.getElementById('psi-loading');
        var error = document.getElementById('psi-error');
        var refreshBtn = document.getElementById('psi-refresh');
        if (loading) loading.classList.add('hidden');
        if (error) error.classList.remove('hidden');
        if (refreshBtn) refreshBtn.disabled = false;
    }

    function fetchPSI() {
        // Show loading state
        var loading = document.getElementById('psi-loading');
        var results = document.getElementById('psi-results');
        var refreshBtn = document.getElementById('psi-refresh');
        if (loading) loading.classList.remove('hidden');
        if (results) { results.classList.add('hidden'); results.classList.remove('chart-fade-in'); }
        if (refreshBtn) refreshBtn.disabled = true;

        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 30000);

        fetch('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fsearcus.ch%2Fit%2F&strategy=mobile&category=PERFORMANCE&key=AIzaSyCer7ZAf_1fChZ996-E04C73-vOQhgjZNs', { signal: controller.signal })
            .then(function (res) {
                clearTimeout(timeout);
                if (!res.ok) throw new Error('PSI ' + res.status);
                return res.json();
            })
            .then(function (json) {
                var data = parsePSI(json);
                setCachedPSI(data);
                renderPSI(data);
            })
            .catch(function () {
                clearTimeout(timeout);
                showPSIError();
            })
            .finally(function () {
                if (refreshBtn) refreshBtn.disabled = false;
            });
    }

    function initPSI() {
        if (!document.getElementById('psi-card')) return;

        // Bind refresh button
        var refreshBtn = document.getElementById('psi-refresh');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', function () {
                localStorage.removeItem(PSI_CACHE_KEY);
                fetchPSI();
            });
        }

        var cached = getCachedPSI();
        if (cached) {
            renderPSI(cached);
            return;
        }

        fetchPSI();
    }

    // ========== CHART 2: VISITOR WEB VITALS ==========
    function setVitalBar(id, value, thresholds) {
        var bar = document.getElementById(id + '-bar');
        var label = document.getElementById(id);
        if (!bar || !label) return;

        var pct = Math.min((value / thresholds.max) * 100, 100);
        var color = metricColor(thresholds, value);

        bar.style.width = pct + '%';
        bar.style.backgroundColor = color;
        label.textContent = formatMetric(value, thresholds.unit);
        label.style.color = color;
    }

    function initVisitorVitals() {
        if (!document.getElementById('visitor-vitals-card')) return;
        if (typeof webVitals === 'undefined') return;

        var opts = { reportAllChanges: true };

        webVitals.onLCP(function (metric) {
            setVitalBar('rv-lcp', metric.value, CWV.LCP);
        }, opts);

        webVitals.onCLS(function (metric) {
            setVitalBar('rv-cls', metric.value, CWV.CLS);
        }, opts);

        webVitals.onINP(function (metric) {
            setVitalBar('rv-inp', metric.value, CWV.INP);
        }, opts);
    }

    // ========== INIT ==========
    initPSI();
    initVisitorVitals();

});
