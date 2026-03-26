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

    function metricClass(thresholds, value) {
        if (value <= thresholds.good) return 'vitals-good';
        if (value <= thresholds.poor) return 'vitals-mid';
        return 'vitals-poor';
    }

    // ========== CHART 1: PAGESPEED INSIGHTS ==========
    var PSI_CACHE_KEY = 'searcus_psi_v1';
    var PSI_CACHE_TTL = 300000; // 5 min

    function getCachedPSI() {
        try {
            var c = JSON.parse(sessionStorage.getItem(PSI_CACHE_KEY));
            if (c && Date.now() - c.ts < PSI_CACHE_TTL) return c.data;
        } catch (e) {}
        return null;
    }

    function setCachedPSI(data) {
        try {
            sessionStorage.setItem(PSI_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data }));
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
        var error = document.getElementById('psi-error');
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
        if (tsEl) tsEl.textContent = 'Analisi: ' + new Date().toLocaleString();
    }

    function showPSIError() {
        var loading = document.getElementById('psi-loading');
        var error = document.getElementById('psi-error');
        if (loading) loading.classList.add('hidden');
        if (error) error.classList.remove('hidden');
    }

    function initPSI() {
        if (!document.getElementById('psi-card')) return;

        var cached = getCachedPSI();
        if (cached) {
            renderPSI(cached);
            return;
        }

        var controller = new AbortController();
        var timeout = setTimeout(function () { controller.abort(); }, 30000);

        fetch('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https%3A%2F%2Fsearcus.ch%2Fit%2F&strategy=mobile&category=PERFORMANCE', { signal: controller.signal })
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
            });
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

        webVitals.onLCP(function (metric) {
            setVitalBar('rv-lcp', metric.value, CWV.LCP);
        });

        webVitals.onCLS(function (metric) {
            setVitalBar('rv-cls', metric.value, CWV.CLS);
        });

        webVitals.onINP(function (metric) {
            setVitalBar('rv-inp', metric.value, CWV.INP);
        });
    }

    // ========== CHART 3: PUBLICATION TIMELINE ==========
    function aggregateByMonth(items) {
        var months = {};
        items.forEach(function (item) {
            if (!item.pubDate) return;
            var d = new Date(item.pubDate);
            if (isNaN(d.getTime())) return;
            var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            months[key] = (months[key] || 0) + 1;
        });

        var labels = [];
        var now = new Date();
        for (var i = 11; i >= 0; i--) {
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
            var monthName = d.toLocaleDateString('default', { month: 'short' });
            labels.push({ key: key, count: months[key] || 0, label: monthName });
        }
        return labels;
    }

    function renderTimeline(items) {
        var container = document.getElementById('pub-timeline');
        if (!container) return;

        var data = aggregateByMonth(items);
        var maxCount = Math.max.apply(null, data.map(function (d) { return d.count; }));
        if (maxCount === 0) maxCount = 1;

        var w = container.clientWidth || 600;
        var h = container.clientHeight || 200;
        var pad = { top: 20, bottom: 32, left: 10, right: 10 };
        var chartW = w - pad.left - pad.right;
        var chartH = h - pad.top - pad.bottom;
        var barGap = 6;
        var barW = Math.max((chartW / data.length) - barGap, 8);

        var svg = '<svg width="100%" height="100%" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="xMidYMid meet">';

        // Horizontal grid lines
        for (var g = 0; g <= 3; g++) {
            var gy = pad.top + chartH - (chartH * g / 3);
            svg += '<line x1="' + pad.left + '" y1="' + gy + '" x2="' + (w - pad.right) + '" y2="' + gy + '" stroke="' + COLORS.wire + '" stroke-width="0.5" stroke-dasharray="4 4" opacity="0.5"/>';
        }

        data.forEach(function (d, i) {
            var x = pad.left + i * (barW + barGap) + barGap / 2;
            var barH = d.count > 0 ? Math.max((d.count / maxCount) * chartH, 4) : 0;
            var y = pad.top + chartH - barH;

            if (d.count > 0) {
                svg += '<rect x="' + x + '" y="' + y + '" width="' + barW + '" height="' + barH + '" rx="3" fill="' + COLORS.signal + '" class="pub-bar" opacity="0.8">' +
                    '<animate attributeName="height" from="0" to="' + barH + '" dur="0.6s" begin="' + (i * 0.05) + 's" fill="freeze"/>' +
                    '<animate attributeName="y" from="' + (pad.top + chartH) + '" to="' + y + '" dur="0.6s" begin="' + (i * 0.05) + 's" fill="freeze"/>' +
                    '</rect>';
                // Count label on top
                svg += '<text x="' + (x + barW / 2) + '" y="' + (y - 6) + '" text-anchor="middle" fill="' + COLORS.chalk + '" font-family="JetBrains Mono,monospace" font-size="10" font-weight="500">' + d.count + '</text>';
            }

            // Month label
            svg += '<text x="' + (x + barW / 2) + '" y="' + (h - 8) + '" text-anchor="middle" fill="' + COLORS.mist + '" font-family="JetBrains Mono,monospace" font-size="9">' + d.label + '</text>';
        });

        svg += '</svg>';
        container.innerHTML = svg;
    }

    function initTimeline() {
        if (!document.getElementById('pub-timeline')) return;

        if (window.__rssItems && window.__rssItems.length > 0) {
            renderTimeline(window.__rssItems);
        } else {
            window.addEventListener('rss-loaded', function () {
                if (window.__rssItems) renderTimeline(window.__rssItems);
            });
        }
    }

    // Redraw timeline on resize for responsiveness
    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            if (window.__rssItems) renderTimeline(window.__rssItems);
        }, 250);
    });

    // ========== INIT ==========
    initPSI();
    initVisitorVitals();
    initTimeline();

});
