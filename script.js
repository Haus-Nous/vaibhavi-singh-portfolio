/* ============================================================
   VAIBHAVI SINGH — PORTFOLIO INTERACTIONS
   ============================================================ */

(function () {
  'use strict';

  // --- Mobile Navigation ---
  const navToggle = document.getElementById('nav-toggle');
  const mobileMenu = document.getElementById('mobile-menu');

  if (navToggle && mobileMenu) {
    navToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('active');
      navToggle.classList.toggle('active');
    });

    // Close mobile menu on link click
    mobileMenu.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('active');
        navToggle.classList.remove('active');
      });
    });
  }

  // --- Scroll-triggered Animations ---
  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -60px 0px',
    threshold: 0.1
  };

  const animateOnScroll = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        animateOnScroll.unobserve(entry.target);
      }
    });
  }, observerOptions);

  // Observe elements
  document.querySelectorAll(
    '.focus-card, .project-card, .project-featured, .research-card, .skill-row, .contact-card'
  ).forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    animateOnScroll.observe(el);
  });

  // --- Nav Background on Scroll ---
  const nav = document.getElementById('main-nav');
  let lastScrollY = 0;

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;

    if (scrollY > 100) {
      nav.style.borderBottomColor = '#333';
    } else {
      nav.style.borderBottomColor = '#222';
    }

    lastScrollY = scrollY;
  }, { passive: true });

  // --- Typing Effect for Terminal ---
  const terminalLines = document.querySelectorAll('.terminal-line');
  if (terminalLines.length) {
    terminalLines.forEach((line, i) => {
      line.style.opacity = '0';
      line.style.transform = 'translateX(-8px)';
    });

    const terminalObserver = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const lines = entry.target.querySelectorAll('.terminal-line');
          lines.forEach((line, i) => {
            setTimeout(() => {
              line.style.transition = 'all 0.3s ease';
              line.style.opacity = '1';
              line.style.transform = 'translateX(0)';
            }, i * 150);
          });
          terminalObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.3 });

    const terminalBody = document.querySelector('.terminal-body');
    if (terminalBody) {
      terminalObserver.observe(terminalBody);
    }
  }

  // --- Active nav link on scroll ---
  const sections = document.querySelectorAll('.section, #hero');
  const navLinks = document.querySelectorAll('.nav-link');

  const sectionObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.style.color = '';
          if (link.getAttribute('href') === `#${id}`) {
            link.style.color = '#fff';
          }
        });
      }
    });
  }, { rootMargin: '-50% 0px -50% 0px' });

  sections.forEach(sec => sectionObserver.observe(sec));

  // --- Smooth hover sound effect (visual) on project cards ---
  document.querySelectorAll('.project-card, .focus-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.transition = 'all 0.3s cubic-bezier(0.22, 1, 0.36, 1)';
    });
  });

  // --- Parallax on hero decoration ---
  const heroDecoration = document.querySelector('.hero-decoration');
  if (heroDecoration && window.innerWidth > 1024) {
    window.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - 0.5) * 20;
      const y = (e.clientY / window.innerHeight - 0.5) * 20;
      heroDecoration.style.transform = `translateY(-50%) translate(${x}px, ${y}px)`;
    }, { passive: true });
  }

  // --- Console Easter Egg ---
  console.log(
    '%c⬡ VAIBHAVI SINGH %c AI Systems Builder',
    'color: #FF0000; font-weight: bold; font-size: 16px; font-family: monospace;',
    'color: #999; font-size: 12px; font-family: monospace;'
  );

})();
