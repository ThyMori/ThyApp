/* Traits « faits main » partagés par les jeux (Course, Football).
 * Le tremblé dépend de la position sur le papier (coordonnées du monde), pas de l'écran :
 * il ne bouge pas quand la caméra bouge. */
(function (global) {
  'use strict';
      function hash2(ix, iy) {
        var h = (ix * 374761393 + iy * 668265263) | 0;
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        return (((h ^ (h >>> 16)) >>> 0) / 4294967295) * 2 - 1;
      }
      function vnoise(x, y) {
        var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
        fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
        var a = hash2(ix, iy), b = hash2(ix + 1, iy), c = hash2(ix, iy + 1), d = hash2(ix + 1, iy + 1);
        return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
      }
      function wob(wx, wy, amp, seed) {
        return [
          vnoise(wx * 0.45 + seed, wy * 0.45) * amp + vnoise(wx * 1.7 + 9, wy * 1.7 + seed) * amp * 0.35,
          vnoise(wx * 0.45 + 31, wy * 0.45 + seed) * amp + vnoise(wx * 1.7 + seed, wy * 1.7 + 17) * amp * 0.35
        ];
      }
      function penPoints(world, closed, X, Y, amp, seed) {
        var out = [], m = world.length, segs = closed ? m : m - 1;
        function put(wx, wy) { var d = wob(wx, wy, amp, seed); out.push([X(wx) + d[0], Y(wy) + d[1]]); }
        for (var i = 0; i < segs; i++) {
          var a = world[i], b = world[(i + 1) % m];
          var len = Math.hypot(X(b[0]) - X(a[0]), Y(b[1]) - Y(a[1])), k = Math.max(1, Math.ceil(len / 12));
          for (var j = 0; j < k; j++) put(a[0] + (b[0] - a[0]) * j / k, a[1] + (b[1] - a[1]) * j / k);
        }
        if (!closed) put(world[m - 1][0], world[m - 1][1]);
        return out;
      }
      function strokeSmooth(ctx, pts, closed) {
        var n = pts.length;
        if (n < 2) return;
        ctx.beginPath();
        if (closed) {
          ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
          for (var i = 0; i < n; i++) { var p = pts[i], q = pts[(i + 1) % n]; ctx.quadraticCurveTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2); }
          ctx.closePath();
        } else {
          ctx.moveTo(pts[0][0], pts[0][1]);
          for (var j = 1; j < n - 1; j++) { var a = pts[j], b = pts[j + 1]; ctx.quadraticCurveTo(a[0], a[1], (a[0] + b[0]) / 2, (a[1] + b[1]) / 2); }
          ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
        }
        ctx.stroke();
      }
      // Un trait au stylo : deux passages légèrement décalés, comme quand on repasse.
      function pen(ctx, world, closed, X, Y, s, color, width, alpha) {
        var amp = Math.min(2.6, 0.7 + s * 0.045);
        ctx.save();
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = color;
        ctx.globalAlpha = (alpha == null ? 1 : alpha);
        ctx.lineWidth = width;
        strokeSmooth(ctx, penPoints(world, closed, X, Y, amp, 0), closed);
        ctx.globalAlpha = (alpha == null ? 1 : alpha) * 0.5;
        ctx.lineWidth = Math.max(0.8, width * 0.55);
        strokeSmooth(ctx, penPoints(world, closed, X, Y, amp, 41), closed);
        ctx.restore();
      }
      function penCircle(ctx, wx, wy, rWorld, X, Y, s, color, width, fill) {
        var pts = [], n = 14, amp = Math.min(2, 0.5 + s * 0.03);
        for (var i = 0; i < n; i++) {
          var a = i / n * 6.283, r = rWorld * (1 + vnoise(wx * 3 + i * 0.7, wy * 3) * 0.1);
          pts.push([wx + Math.cos(a) * r, wy + Math.sin(a) * r]);
        }
        if (fill) { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(function (p, i) { if (i) ctx.lineTo(X(p[0]), Y(p[1])); else ctx.moveTo(X(p[0]), Y(p[1])); }); ctx.closePath(); ctx.fill(); }
        pen(ctx, pts, true, X, Y, s * 0.6, color, width);
      }

      function shade(hex, k) {
        var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
        return 'rgb(' + Math.round(r * k) + ',' + Math.round(g * k) + ',' + Math.round(b * k) + ')';
      }

  global.ThyPen = {
    hash2: hash2, vnoise: vnoise, wob: wob, penPoints: penPoints, strokeSmooth: strokeSmooth,
    pen: pen, penCircle: penCircle, shade: shade
  };
})(window);
