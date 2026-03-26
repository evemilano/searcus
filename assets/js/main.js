// Searcus Swiss SAGL — Main JS (2027 UI)

document.addEventListener('DOMContentLoaded', function () {

    // ========== MOBILE MENU ==========
    var toggle = document.getElementById('menu-toggle');
    var closeBtn = document.getElementById('menu-close');
    var overlay = document.getElementById('mobile-overlay');

    function openMenu() {
        if (overlay) overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    function closeMenu() {
        if (overlay) overlay.classList.remove('active');
        document.body.style.overflow = '';
    }

    if (toggle) toggle.addEventListener('click', openMenu);
    if (closeBtn) closeBtn.addEventListener('click', closeMenu);
    if (overlay) {
        overlay.querySelectorAll('a').forEach(function (link) {
            link.addEventListener('click', closeMenu);
        });
    }

    // ========== SMART NAVBAR (hide on scroll down, show on scroll up) ==========
    var navbar = document.getElementById('navbar');
    var lastScroll = 0;
    var scrollThreshold = 80;

    window.addEventListener('scroll', function () {
        var currentScroll = window.scrollY;
        if (currentScroll <= scrollThreshold) {
            navbar.classList.remove('navbar-hidden');
            return;
        }
        if (currentScroll > lastScroll + 10) {
            navbar.classList.add('navbar-hidden');
        } else if (currentScroll < lastScroll - 10) {
            navbar.classList.remove('navbar-hidden');
        }
        lastScroll = currentScroll;
    }, { passive: true });

    // ========== SCROLL REVEAL (IntersectionObserver) ==========
    var reveals = document.querySelectorAll('.reveal');
    if (reveals.length > 0 && 'IntersectionObserver' in window) {
        var revealObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    revealObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

        reveals.forEach(function (el) {
            revealObserver.observe(el);
        });
    } else {
        // Fallback: show all immediately
        reveals.forEach(function (el) { el.classList.add('revealed'); });
    }

    // ========== COUNTER ANIMATION ==========
    // Resolve dynamic counters (years since founding)
    document.querySelectorAll('[data-counter-dynamic]').forEach(function (el) {
        var founded = parseInt(el.getAttribute('data-counter-dynamic'), 10);
        el.setAttribute('data-counter', new Date().getFullYear() - founded);
        el.removeAttribute('data-counter-dynamic');
    });

    var counters = document.querySelectorAll('[data-counter]');
    if (counters.length > 0 && 'IntersectionObserver' in window) {
        var counterObserver = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    animateCounter(entry.target);
                    counterObserver.unobserve(entry.target);
                }
            });
        }, { threshold: 0.3 });

        counters.forEach(function (el) { counterObserver.observe(el); });
    }

    function animateCounter(el) {
        var target = parseInt(el.getAttribute('data-counter'), 10);
        var suffix = el.getAttribute('data-suffix') || '';
        var duration = 2000;
        var start = 0;
        var startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            // Ease out cubic
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = Math.floor(eased * target);
            el.textContent = current + suffix;
            if (progress < 1) {
                requestAnimationFrame(step);
            } else {
                el.textContent = target + suffix;
            }
        }
        requestAnimationFrame(step);
    }

    // ========== DYNAMIC YEAR ==========
    var yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    // ========== RSS TICKER ==========
    var tickerTrack = document.getElementById('rss-ticker-track');
    var tickerWrap = document.getElementById('rss-ticker');

    function buildTicker(articles) {
        if (!tickerTrack || articles.length === 0) {
            if (tickerWrap) tickerWrap.style.display = 'none';
            return;
        }
        var html = '';
        articles.forEach(function (a) {
            html += '<a href="' + a.link + '" target="_blank" rel="noopener" class="rss-ticker-item">'
                  + '<span class="rss-ticker-sep">\u25C6</span> ' + a.title
                  + '</a>';
        });
        tickerTrack.innerHTML = html + html;
    }

    if (tickerTrack) {
        fetch('https://www.evemilano.com/feed/')
            .then(function (res) { return res.text(); })
            .then(function (xml) {
                var parser = new DOMParser();
                var doc = parser.parseFromString(xml, 'text/xml');
                var items = doc.querySelectorAll('item');
                var articles = [];
                items.forEach(function (item, i) {
                    if (i >= 50) return;
                    articles.push({
                        title: item.querySelector('title').textContent,
                        link: item.querySelector('link').textContent,
                        pubDate: item.querySelector('pubDate') ? item.querySelector('pubDate').textContent : ''
                    });
                });
                window.__rssItems = articles;
                buildTicker(articles);
                window.dispatchEvent(new CustomEvent('rss-loaded'));
            })
            .catch(function () {
                if (tickerWrap) tickerWrap.style.display = 'none';
            });
    }

});
