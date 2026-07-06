import './style.css';
import Swiper from 'swiper';
import { Navigation, Pagination } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';
import videosData from './data/videos.json';

// 動画カード1枚を DOM 要素として組み立てる
// user-provided strings は textContent / setAttribute 経由で挿入し XSS リスクを排除
function buildVideoSlide(video) {
    const slide = document.createElement('div');
    slide.className = 'swiper-slide';

    const card = document.createElement('a');
    card.className = 'video-card';
    card.href = video.url;
    card.target = '_blank';
    card.rel = 'noopener';

    const thumb = document.createElement('div');
    thumb.className = 'video-thumb';

    const img = document.createElement('img');
    img.src = video.thumbnail;
    img.alt = video.title;
    img.loading = 'lazy';

    const play = document.createElement('span');
    play.className = 'video-play';
    play.setAttribute('aria-hidden', 'true');
    play.textContent = '▶'; // ▶

    thumb.append(img, play);

    const title = document.createElement('p');
    title.className = 'video-card-title';
    title.textContent = video.title;

    card.append(thumb, title);
    slide.append(card);
    return slide;
}

function renderYouTubeCarousel() {
    const wrapper = document.getElementById('youtube-slides');
    if (!wrapper || !videosData?.videos?.length) return;

    for (const v of videosData.videos) {
        wrapper.append(buildVideoSlide(v));
    }

    new Swiper('.youtube-swiper', {
        modules: [Navigation, Pagination],
        slidesPerView: 1.25,
        spaceBetween: 22,
        // PC は 2 列で どーん と見せる (旧 3 列は窮屈)
        breakpoints: {
            640: { slidesPerView: 2.15, spaceBetween: 22 },
            1024: { slidesPerView: 2, spaceBetween: 28 },
        },
        navigation: {
            nextEl: '.youtube-nav-next',
            prevEl: '.youtube-nav-prev',
        },
        pagination: {
            el: '.youtube-pagination',
            clickable: true,
        },
    });
}

function initCapYamamotoTracking() {
    if (window.__capYamamotoTrackingInstalled) return;
    window.__capYamamotoTrackingInstalled = true;

    const cleanText = (value) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, 120);

    const closestAction = (target) => {
        if (!target || !target.closest) return null;
        return target.closest('a, button, [role="button"]');
    };

    const toUrl = (href) => {
        if (!href) return '';
        try {
            return new URL(href, window.location.href).href;
        } catch {
            return href;
        }
    };

    const getClickText = (el) => {
        const img = el.querySelector?.('img[alt]');
        return cleanText(
            el.innerText ||
            el.textContent ||
            img?.getAttribute('alt') ||
            el.getAttribute('aria-label') ||
            el.getAttribute('title') ||
            ''
        );
    };

    const getClickArea = (el, href, url) => {
        const target = href || url || '';
        if (!el) return 'other_link';
        if (el.closest('.btn-hero-cta')) return 'hero_cta';
        if (el.closest('.footer-cta-wrap')) return 'footer_cta';
        if (el.closest('.cta-bubble')) return 'floating_cta';
        if (el.closest('.logo')) return 'header_logo';
        if (el.closest('.nav')) {
            if (target === '#company') return 'nav_company';
            if (target === '#results') return 'nav_results';
            if (target === '#service') return 'nav_service';
            if (target === '#youtube') return 'nav_youtube';
            if (/\/contact\/?$/.test(target)) return 'nav_contact';
            if (/spollup\.jp\/?$/.test(target)) return 'nav_spollup';
            return 'nav_other';
        }
        if (/rakuten\.co\.jp\/earlygetter/.test(target)) return 'rakuten_banner';
        if (/youtube\.com\/watch/.test(target)) return 'youtube_video';
        if (/youtube\.com\/@cap-yamamoto/.test(target)) return 'social_youtube';
        if (/facebook\.com\/shinjiro\.yamamoto/.test(target)) return 'social_facebook';
        if (/instagram\.com\/spollup_yamamoto/.test(target)) return 'social_instagram';
        if (/spollup\.jp\/?$/.test(target)) return 'footer_spollup';
        return 'other_link';
    };

    const getClickType = (url, area) => {
        if (area.includes('cta') || area === 'nav_contact') return 'cta';
        if (/youtube|facebook|instagram/.test(area)) return 'social';
        if (area.startsWith('nav_') || String(url || '').startsWith('#')) return 'nav';
        if (/youtube\.com\/watch/.test(url || '')) return 'video';

        try {
            return new URL(url, window.location.href).hostname === window.location.hostname ? 'internal' : 'outbound';
        } catch {
            return 'other';
        }
    };

    const sendEvent = (name, params = {}) => {
        if (typeof window.gtag !== 'function') return;
        window.gtag('event', name, {
            page_path: window.location.pathname,
            page_location: window.location.href,
            transport_type: 'beacon',
            ...params,
        });
    };

    document.addEventListener('click', (event) => {
        const el = closestAction(event.target);
        if (!el) return;

        const href = el.getAttribute('href') || '';
        const url = toUrl(href);
        const area = getClickArea(el, href, url);
        const type = getClickType(href || url, area);
        const params = {
            click_area: area,
            click_type: type,
            click_text: getClickText(el) || area,
            click_url: url || href || area,
            event_category: 'cap_yamamoto_lp',
            event_label: area,
        };

        sendEvent('lp_click', params);
        if (type === 'cta') {
            sendEvent('lp_cta_click', params);
        }
    }, true);

    const scrollMarks = [25, 50, 75, 90];
    const sentScroll = new Set();

    const checkScroll = () => {
        const doc = document.documentElement;
        const body = document.body || {};
        const maxScroll = Math.max(doc.scrollHeight || 0, body.scrollHeight || 0) - window.innerHeight;
        if (maxScroll <= 0) return;

        const scrollTop = window.pageYOffset || doc.scrollTop || body.scrollTop || 0;
        const percent = Math.round((scrollTop / maxScroll) * 100);
        scrollMarks.forEach((mark) => {
            if (sentScroll.has(mark) || percent < mark) return;
            sentScroll.add(mark);
            sendEvent('lp_scroll_depth', {
                scroll_percent: String(mark),
                event_category: 'cap_yamamoto_lp',
                event_label: `scroll_${mark}`,
            });
        });
    };

    window.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    window.setTimeout(checkScroll, 1000);

    [5, 10, 30, 60].forEach((seconds) => {
        window.setTimeout(() => {
            if (document.visibilityState !== 'visible') return;
            sendEvent('lp_engaged_time', {
                engagement_bucket: `${seconds}s`,
                event_category: 'cap_yamamoto_lp',
                event_label: `engaged_${seconds}s`,
            });
        }, seconds * 1000);
    });
}

initCapYamamotoTracking();

document.addEventListener('DOMContentLoaded', () => {
    // Mobile hamburger menu (max-width: 900px)
    // aria-expanded を真実の状態源として使う。CSS は body.menu-open でパネル位置 + 背景固定を制御。
    const navToggle = document.getElementById('nav-toggle');
    const nav = document.getElementById('nav');
    if (navToggle && nav) {
        const setMenuOpen = (open) => {
            navToggle.setAttribute('aria-expanded', String(open));
            navToggle.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
            document.body.classList.toggle('menu-open', open);
        };
        navToggle.addEventListener('click', () => {
            setMenuOpen(navToggle.getAttribute('aria-expanded') !== 'true');
        });
        // リンクタップで自動クローズ (アンカーへスムーススクロール中に背景固定が残らないよう)
        nav.querySelectorAll('a').forEach((a) => {
            a.addEventListener('click', () => setMenuOpen(false));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && navToggle.getAttribute('aria-expanded') === 'true') {
                setMenuOpen(false);
            }
        });
        // パネル外タップ (オーバーレイ部分) で閉じる
        document.addEventListener('click', (e) => {
            if (navToggle.getAttribute('aria-expanded') !== 'true') return;
            if (nav.contains(e.target) || navToggle.contains(e.target)) return;
            setMenuOpen(false);
        });
        // デスクトップ幅 (>1024px) に戻ったら強制クローズ (body の overflow:hidden が残る事故防止)
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024 && navToggle.getAttribute('aria-expanded') === 'true') {
                setMenuOpen(false);
            }
        });
    }

    // Reveal Animations using Intersection Observer
    const revealElements = document.querySelectorAll('.reveal');
    const revealOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                observer.unobserve(entry.target);
            }
        });
    }, revealOptions);

    revealElements.forEach(el => {
        revealObserver.observe(el);
    });

    renderYouTubeCarousel();

    // Header Scroll Effect & Floating CTA
    const header = document.querySelector('.header');
    const floatingCta = document.getElementById('floating-cta');
    // ドック先は旧「緑ボタン」ではなく、同じ位置に残した空スロット (.footer-cta-wrap) を参照する
    const footerCtaBtn = document.querySelector('.footer-cta-wrap');

    // Floating CTA の基準中心座標 (position:fixed; bottom:2rem; right:2rem) を
    // ビューポートサイズとCTA寸法から毎回再計算する。
    // transform で動かしても getBoundingClientRect が "現在位置" を返すので
    // 基準位置そのものの計算には使えない。
    function computeFloatingBaseCenter() {
        if (!floatingCta) return null;
        // CSS の right/bottom を実測で読む。
        // デスクトップは 2rem、モバイル breakpoint で 1rem に切り替わるため
        // ハードコードではズレる (ドック位置が左下に流れる)
        const cs = getComputedStyle(floatingCta);
        const rightPx = parseFloat(cs.right) || 0;
        const bottomPx = parseFloat(cs.bottom) || 0;
        const w = floatingCta.offsetWidth;
        const h = floatingCta.offsetHeight;
        return {
            cx: window.innerWidth - rightPx - w / 2,
            cy: window.innerHeight - bottomPx - h / 2,
        };
    }

    // スクロール位置が footer の緑ボタンと重なる領域に入ったら
    // floating CTA を緑ボタンの中心に translate で移動させる。
    // 緑ボタン側は opacity で消して "椅子取り" の見た目を作る。
    function updateFloatingDock() {
        if (!floatingCta || !footerCtaBtn) return;
        const target = footerCtaBtn.getBoundingClientRect();
        const vh = window.innerHeight;
        const inView = target.top < vh - 60 && target.bottom > 60;

        if (inView) {
            const base = computeFloatingBaseCenter();
            if (!base) return;
            const targetCx = target.left + target.width / 2;
            const targetCy = target.top + target.height / 2;
            // ドック時は移動 + 1.15倍スケールで "着地して膨らむ" 感を出す
            floatingCta.style.transform = `translate(${targetCx - base.cx}px, ${targetCy - base.cy}px) scale(1.15)`;
            floatingCta.classList.add('docked');
        } else {
            floatingCta.style.transform = '';
            floatingCta.classList.remove('docked');
        }
    }

    window.addEventListener('scroll', () => {
        // Header shadow
        if (window.scrollY > 20) {
            header.style.boxShadow = '0 10px 30px rgba(0,0,0,0.05)';
        } else {
            header.style.boxShadow = 'none';
        }

        // Show Floating CTA after 500px scroll
        if (floatingCta) {
            if (window.scrollY > 500) {
                floatingCta.classList.add('active');
            } else {
                floatingCta.classList.remove('active');
            }
        }

        updateFloatingDock();
    });
    window.addEventListener('resize', updateFloatingDock);

    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const href = this.getAttribute('href');
            if (href === '#') return;

            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
});
