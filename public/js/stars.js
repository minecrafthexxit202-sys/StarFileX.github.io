/**
 * Star File X - Background Starfield & Constellation Canvas Animation
 */
(function() {
  const canvas = document.getElementById('starCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  const STARS_COUNT = Math.min(Math.floor((width * height) / 8000), 120);
  const stars = [];

  function initStars() {
    stars.length = 0;
    for (let i = 0; i < STARS_COUNT; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 1.6 + 0.4,
        alpha: Math.random() * 0.8 + 0.2,
        speed: Math.random() * 0.3 + 0.05,
        twinkleSpeed: (Math.random() * 0.02 + 0.005) * (Math.random() > 0.5 ? 1 : -1),
        color: Math.random() > 0.7 ? '#00f2fe' : (Math.random() > 0.5 ? '#b794f4' : '#ffffff')
      });
    }
  }

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    initStars();
  }

  window.addEventListener('resize', resize);
  initStars();

  function render() {
    ctx.clearRect(0, 0, width, height);

    // Vẽ các chòm sao kết nối mờ
    for (let i = 0; i < stars.length; i++) {
      const s1 = stars[i];

      // Cập nhật vị trí và độ sáng lấp lánh
      s1.y -= s1.speed;
      if (s1.y < 0) {
        s1.y = height;
        s1.x = Math.random() * width;
      }

      s1.alpha += s1.twinkleSpeed;
      if (s1.alpha > 0.9 || s1.alpha < 0.2) {
        s1.twinkleSpeed = -s1.twinkleSpeed;
      }

      ctx.beginPath();
      ctx.arc(s1.x, s1.y, s1.radius, 0, Math.PI * 2);
      ctx.fillStyle = s1.color;
      ctx.globalAlpha = Math.max(0.1, Math.min(1, s1.alpha));
      ctx.fill();

      // Kết nối đường sao gần nhau
      for (let j = i + 1; j < stars.length; j++) {
        const s2 = stars[j];
        const dx = s1.x - s2.x;
        const dy = s1.y - s2.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 85) {
          ctx.beginPath();
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(s2.x, s2.y);
          ctx.strokeStyle = '#4facfe';
          ctx.globalAlpha = (1 - dist / 85) * 0.15;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1.0;
    requestAnimationFrame(render);
  }

  requestAnimationFrame(render);
})();
