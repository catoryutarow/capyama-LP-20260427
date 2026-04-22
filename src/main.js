import './style.css'

document.addEventListener('DOMContentLoaded', () => {
    // Section title: Japanet recipe の 2層構造用に data-text を自動付与
    // (innerText で <br> → 改行 が保持されるので、CSS側の white-space: pre と組み合わせて二層が完全一致する)
    document.querySelectorAll('.section-title').forEach(el => {
        el.setAttribute('data-text', el.innerText);
    });

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

    // Header Scroll Effect & Floating CTA
    const header = document.querySelector('.header');
    const floatingCta = document.getElementById('floating-cta');
    
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
    });

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
