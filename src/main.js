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
        slidesPerView: 1.15,
        spaceBetween: 20,
        // おじちゃん・おばちゃん向けに数本見えるブレイクポイントに
        breakpoints: {
            640: { slidesPerView: 2.1, spaceBetween: 20 },
            1024: { slidesPerView: 3, spaceBetween: 24 },
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

document.addEventListener('DOMContentLoaded', () => {
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
