/* ===========================
   main.js — PQR Website
   =========================== */

/* ── NAV scroll effect ── */
const nav = document.getElementById('nav');

// 서브 페이지면 항상 solid
if (nav.classList.contains('solid')) {
  // do nothing, CSS handles it
} else {
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 40);
  });
}

/* ── Hamburger menu ── */
const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');

hamburger.addEventListener('click', () => {
  hamburger.classList.toggle('open');
  mobileMenu.classList.toggle('open');
});

document.querySelectorAll('.mobile-link').forEach(link => {
  link.addEventListener('click', () => {
    hamburger.classList.remove('open');
    mobileMenu.classList.remove('open');
  });
});

/* ── Quantum particle canvas (hero background) ── */
(function initQuantumCanvas() {
  const canvas = document.getElementById('quantum-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W, H, particles;
  const PARTICLE_COUNT = 50;
  const MAX_DIST = 130;

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  class Particle {
    constructor() { this.reset(); }
    reset() {
      this.x = Math.random() * W;
      this.y = Math.random() * H;
      this.vx = (Math.random() - 0.5) * 0.35;
      this.vy = (Math.random() - 0.5) * 0.35;
      this.r = Math.random() * 1.8 + 0.8;
      this.alpha = Math.random() * 0.5 + 0.15;
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
          const alpha = (1 - dist / MAX_DIST) * 0.13;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(74,158,255,${alpha})`;
          ctx.lineWidth = 0.8;
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

  window.addEventListener('resize', resize);
  init();
  loop();
})();

/* ── Bloch Sphere qubit dot animation ── */
(function initBlochSphere() {
  const dot = document.getElementById('qubit-dot');
  if (!dot) return;

  let t = 0;
  const CX = 120, CY = 120, R = 74;

  function animate() {
    t += 0.01;
    const theta = Math.PI / 3 + Math.sin(t * 0.6) * Math.PI / 2.8;
    const phi = t;

    const x = R * Math.sin(theta) * Math.cos(phi);
    const y = R * Math.sin(theta) * Math.sin(phi);
    const z = R * Math.cos(theta);

    const proj_x = CX + x - y * 0.38;
    const proj_y = CY - z + y * 0.18;

    dot.style.left = proj_x + 'px';
    dot.style.top  = proj_y + 'px';
    dot.style.transform = 'translate(-50%,-50%)';

    requestAnimationFrame(animate);
  }

  animate();
})();

/* ── Stats counter animation ── */
function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    const duration = 1400;
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

const statsSection = document.getElementById('stats');
let statsDone = false;
if (statsSection) {
  const statsObserver = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting && !statsDone) {
      statsDone = true;
      animateCounters();
      statsObserver.disconnect();
    }
  }, { threshold: 0.4 });
  statsObserver.observe(statsSection);
}

/* ── Join form submit ── */
function handleFormSubmit(e) {
  e.preventDefault();
  const form = document.getElementById('join-form');
  const success = document.getElementById('join-success');

  form.style.transition = 'opacity 0.25s ease';
  form.style.opacity = '0';
  setTimeout(() => {
    form.hidden = true;
    success.hidden = false;
  }, 250);
}
