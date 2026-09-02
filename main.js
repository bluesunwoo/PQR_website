/* ===========================
   main.js — QSC Club Website
   =========================== */

/* ── NAV scroll effect ── */
const nav = document.getElementById('nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);
});

/* ── Hamburger menu ── */
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('open');
});

// Close mobile menu on link click
document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    mobileMenu.classList.remove('open');
  });
});

/* ── Quantum particle canvas (hero background) ── */
(function initQuantumCanvas() {
  const canvas = document.getElementById('quantum-canvas');
  const ctx = canvas.getContext('2d');

  let W, H, particles, connections;
  const PARTICLE_COUNT = 60;
  const MAX_DIST = 140;

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.4;
      this.vy = (Math.random() - 0.5) * 0.4;
      this.r = Math.random() * 2 + 1;
      this.alpha = Math.random() * 0.6 + 0.2;
    }
    update() {
      this.x += this.vx;
      this.y += this.vy;
      if (this.x < 0 || this.x > W) this.vx *= -1;
      if (this.y < 0 || this.y > H) this.vy *= -1;
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(74,158,255,${this.alpha})`;
      ctx.fill();
    }
  }

  function init() {
    resize();
    particles = Array.from({ length: PARTICLE_COUNT }, () => new Particle());
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MAX_DIST) {
          const alpha = (1 - dist / MAX_DIST) * 0.18;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(74,158,255,${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }
    }
  }

  function loop() {
    ctx.clearRect(0, 0, W, H);
    particles.forEach(p => { p.update(); p.draw(); });
    drawConnections();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', () => { resize(); });
  init();
  loop();
})();

/* ── Bloch Sphere qubit dot animation ── */
(function initBlochSphere() {
  const dot = document.getElementById('qubit-dot');
  if (!dot) return;

  let t = 0;
  const CX = 130, CY = 130, R = 80; // sphere radius in px

  function animate() {
    t += 0.012;
    // Parametric trajectory on sphere surface
    const theta = Math.PI / 3 + Math.sin(t * 0.7) * Math.PI / 2.5; // polar
    const phi   = t; // azimuthal

    const x = R * Math.sin(theta) * Math.cos(phi);
    const y = R * Math.sin(theta) * Math.sin(phi);
    const z = R * Math.cos(theta);

    // Project onto 2D with slight tilt (isometric feel)
    const proj_x = CX + x - y * 0.4;
    const proj_y = CY - z + y * 0.2;

    dot.style.left = proj_x + 'px';
    dot.style.top  = proj_y + 'px';
    dot.style.transform = 'translate(-50%,-50%)';

    // Draw line from center to dot using pseudo-element via CSS var
    const sphere = document.getElementById('bloch-sphere');
    if (sphere) {
      sphere.style.setProperty('--qx', proj_x + 'px');
      sphere.style.setProperty('--qy', proj_y + 'px');
    }

    requestAnimationFrame(animate);
  }

  animate();
})();

/* ── Stats counter animation ── */
function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    const duration = 1600;
    const step = 16;
    const increment = target / (duration / step);
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        current = target;
        clearInterval(timer);
      }
      el.textContent = Math.floor(current);
    }, step);
  });
}

/* ── Intersection Observer for reveal animations & stats ── */
const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.12 });

document.querySelectorAll(
  '.activity-card, .member-card, .tl-item, .gallery-item, .about-text, .about-visual, .join-left, .join-right'
).forEach(el => {
  el.classList.add('reveal');
  revealObserver.observe(el);
});

// Stats counter trigger
const statsSection = document.getElementById('stats');
let statsDone = false;
const statsObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting && !statsDone) {
    statsDone = true;
    animateCounters();
    statsObserver.disconnect();
  }
}, { threshold: 0.4 });
if (statsSection) statsObserver.observe(statsSection);

/* ── Join form submit ── */
function handleFormSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('join-form');
  const success = document.getElementById('join-success');

  // Simple fade out / fade in
  form.style.transition = 'opacity 0.3s ease';
  form.style.opacity = '0';
  setTimeout(() => {
    form.hidden = true;
    success.hidden = false;
    success.style.opacity = '0';
    success.style.transition = 'opacity 0.4s ease';
    requestAnimationFrame(() => {
      success.style.opacity = '1';
    });
  }, 300);
}

/* ── Active nav link highlight on scroll ── */
const sections = document.querySelectorAll('section[id]');
const navLinksAll = document.querySelectorAll('.nav-links a');

const navObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinksAll.forEach(a => a.classList.remove('active'));
      const active = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
      if (active) active.classList.add('active');
    }
  });
}, { rootMargin: '-40% 0px -40% 0px' });

sections.forEach(s => navObserver.observe(s));
