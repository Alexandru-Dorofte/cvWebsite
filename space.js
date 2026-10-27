(function () {
    const space = document.getElementById("space");
    if (!space) return;

    const canvas = document.createElement("canvas");
    canvas.className = "space-canvas";
    canvas.setAttribute("aria-hidden", "true");
    space.prepend(canvas);
    const ctx = canvas.getContext("2d");

    const FONT = 'Menlo, Consolas, "DejaVu Sans Mono", "Liberation Mono", monospace';
    const BG = "#070709", WHITE = "#f2f2f2", GREY = "#9a9a9a", DARK = "#5a5a5a";
    const RAMP = " .:-=+*#%@";
    const SMOKE_CHARS = "+:··.";
    const LIGHT = [0.55, 0.35, 0.76];
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rand = (a, b) => a + Math.random() * (b - a);

    function art(s) {
        const lines = s.split(/\r?\n/);
        while (lines.length && !lines[0].trim()) lines.shift();
        while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
        const indent = Math.min(...lines.filter(l => l.trim()).map(l => l.match(/^ */)[0].length));
        return lines.map(l => l.slice(indent).replace(/\s+$/, ""));
    }

    function hex(c) { return [1, 3, 5].map(i => parseInt(c.substr(i, 2), 16)); }
    function shades(from, to, n) {
        const a = hex(from), b = hex(to), out = [];
        for (let i = 0; i < n; i++) {
            const f = i / (n - 1);
            out.push("rgb(" + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",") + ")");
        }
        return out;
    }
    const SMOKE = shades(WHITE, DARK, 16);
    const DRIVE = shades(GREY, DARK, 16);

    const ART = {
        saturn: art(String.raw`
   |
   A
  /_\
  | |
  |=|
  | |
 /___\
 |   |
 |===|
 |   |
/|___|\
 /^^^\
`),
        shuttle: art(String.raw`
     /\
    /  \
   |    |
   |    |
  /|    |\
 / |    | \
/__|____|__\
   '----'
`),
        lm: art(String.raw`
    .--.
  _/____\_
 | [====] |
 |________|
  /| /\ |\
 /_|/  \|_\
`),
        hail: art(String.raw`
              _.---------------------._
 ___  _______.'  o    o    o    o    o  '.__
[___]=|______|                           |__>
 '-'  '------'._________________________.'
`)
    };

    let W = 0, H = 0, dpr = 1, phone = false, fs = 13, cw = 8, lh = 15;
    let sprites = {}, stars = [], earthCells = [];
    let moon, earth, giant;
    let t = 0, mx = 0, my = 0, sx = 0, sy = 0;
    const particles = [], rockets = [], shooters = [];
    let nextRocket = 2, nextShooter = 3, nextFlyby = 3, turn = 0, hail = null, lm = null;

    function offscreen(w, h, size) {
        const c = document.createElement("canvas");
        c.width = Math.ceil(w * dpr);
        c.height = Math.ceil(h * dpr);
        const g = c.getContext("2d");
        g.scale(dpr, dpr);
        g.font = (size || fs) + "px " + FONT;
        g.textAlign = "center";
        g.textBaseline = "middle";
        return { c, g, w, h };
    }

    function sprite(lines, scale) {
        const w = cw * scale, h = lh * scale, cols = Math.max(...lines.map(l => l.length));
        const s = offscreen(cols * w, lines.length * h, fs * scale);
        lines.forEach((line, r) => {
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (ch === " ") continue;
                s.g.fillStyle = "=o[]^'".includes(ch) ? GREY : WHITE;
                s.g.fillText(ch, i * w + w / 2, r * h + h / 2);
            }
        });
        return s;
    }

    // cells of a char grid covering a disc of radius r, with sphere normals
    function sphereCells(r) {
        const out = [];
        for (let y = -Math.floor(r / lh) * lh; y <= r; y += lh) {
            for (let x = -Math.floor(r / cw) * cw; x <= r; x += cw) {
                const d2 = (x * x + y * y) / (r * r);
                if (d2 > 1) continue;
                out.push({ x, y, nx: x / r, ny: y / r, nz: Math.sqrt(1 - d2) });
            }
        }
        return out;
    }

    const lit = p => Math.max(0, p.nx * LIGHT[0] + p.ny * LIGHT[1] + p.nz * LIGHT[2]);

    function bakeMoon() {
        const r = moon.r, s = offscreen(r * 2 + cw * 2, r * 2 + lh * 2);
        s.g.fillStyle = GREY;
        for (const p of sphereCells(r)) {
            const b = lit(p);
            s.g.globalAlpha = 0.25 + 0.6 * b;
            s.g.fillText(RAMP[Math.max(1, Math.round(b * 9))], s.w / 2 + p.x, s.h / 2 + p.y);
        }
        moon.img = s;
    }

    function bakeGiant() {
        const r = giant.r, s = offscreen(r * 4.6, r * 4.6);
        const tilt = -0.35, ct = Math.cos(tilt), st = Math.sin(tilt);
        const back = [], front = [];
        [[1.55, ":", DARK], [1.95, "-", GREY]].forEach(([k, ch, col]) => {
            const rx = r * k, ry = rx * 0.28, n = Math.round(2 * Math.PI * rx / (cw * 0.9));
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
                const p = { x: ex * ct - ey * st, y: ex * st + ey * ct, ch, col };
                (ey < 0 ? back : front).push(p);
            }
        });
        const ring = p => { s.g.fillStyle = p.col; s.g.fillText(p.ch, s.w / 2 + p.x, s.h / 2 + p.y); };
        s.g.globalAlpha = 0.6;
        back.filter(p => p.x * p.x + p.y * p.y > r * r).forEach(ring);
        for (const p of sphereCells(r)) {
            if (front.some(f => Math.abs(f.x - p.x) < cw * 0.7 && Math.abs(f.y - p.y) < lh * 0.6)) continue;
            const b = lit(p);
            s.g.fillStyle = Math.sin(p.ny * 9 + Math.sin(p.ny * 3) * 1.5) > 0 ? GREY : DARK;
            s.g.globalAlpha = 0.3 + 0.7 * b;
            s.g.fillText(RAMP[Math.max(1, Math.round(b * 9))], s.w / 2 + p.x, s.h / 2 + p.y);
        }
        s.g.globalAlpha = 0.75;
        front.forEach(ring);
        giant.img = s;
    }

    function resize() {
        W = space.clientWidth;
        H = space.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        phone = W < 600;
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        fs = phone ? 10 : 13;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.font = fs + "px " + FONT;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        cw = ctx.measureText("M").width;
        lh = Math.round(fs * 1.15);

        sprites = {
            saturn: sprite(ART.saturn, 0.75),
            shuttle: sprite(ART.shuttle, 0.75),
            lm: sprite(ART.lm, 0.85),
            hail: sprite(ART.hail, phone ? 0.8 : 1)
        };

        stars = [];
        const count = Math.round(W * H / (phone ? 5000 : 4500));
        for (let i = 0; i < count; i++) {
            const f = Math.random(), layer = f < 0.5 ? 0 : f < 0.82 ? 1 : 2;
            stars.push({
                x: rand(0, W), y: rand(0, H), layer,
                ch: layer === 0 ? "." : layer === 1 ? "·" : Math.random() < 0.6 ? "+" : "*",
                phase: rand(0, 6.28), speed: rand(0.6, 2.2)
            });
        }

        const m = Math.min(W, H);
        if (phone) {
            moon = { x: W * 0.86, y: H * 0.09, r: m * 0.07 };
            earth = { x: W * 0.13, y: H * 0.08, r: m * 0.09 };
            giant = { x: W * 0.15, y: H * 0.92, r: m * 0.055 };
        } else {
            moon = { x: W * 0.86, y: H * 0.22, r: m * 0.06 };
            earth = { x: W * 0.13, y: H * 0.24, r: m * 0.09 };
            giant = { x: W * 0.15, y: H * 0.78, r: m * 0.065 };
        }

        earthCells = sphereCells(earth.r).map(p => ({
            x: p.x, y: p.y, lat: Math.asin(-p.ny), lon: Math.atan2(p.nx, p.nz), light: lit(p)
        }));

        bakeMoon();
        bakeGiant();

        if (reduced) still();
    }

    function emit(x, y, vx, vy, life, tbl) {
        if (particles.length > 400) return;
        particles.push({ x, y, vx, vy, age: 0, life, tbl });
    }

    function launch() {
        const kind = Math.random() < 0.5 ? "saturn" : "shuttle";
        rockets.push({
            kind, x: rand(W * 0.08, W * 0.92), y: H + sprites[kind].h,
            h: rand(-0.35, 0.35), turn: rand(-0.12, 0.12),
            v: rand(70, 120) * (phone ? 0.7 : 1), acc: 0
        });
    }

    function update(dt) {
        t += dt;
        const k = Math.min(1, dt * 3);
        sx += (mx - sx) * k;
        sy += (my - sy) * k;

        const drift = [4, 9, 16];
        for (const s of stars) {
            s.x -= drift[s.layer] * dt;
            if (s.x < -20) s.x += W + 40;
        }

        if ((nextShooter -= dt) <= 0) {
            nextShooter = rand(3, 7);
            shooters.push({ x: rand(W * 0.2, W), y: rand(0, H * 0.4), vx: -rand(350, 550), vy: rand(120, 220), life: 1.3, pts: [] });
        }
        for (let i = shooters.length - 1; i >= 0; i--) {
            const s = shooters[i];
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.life -= dt;
            const last = s.pts[0];
            if (!last || Math.hypot(s.x - last.x, s.y - last.y) >= cw) {
                s.pts.unshift({ x: s.x, y: s.y });
                if (s.pts.length > 14) s.pts.pop();
            }
            if (s.life <= 0 || s.x < -50 || s.y > H + 50) shooters.splice(i, 1);
        }

        if ((nextRocket -= dt) <= 0) {
            nextRocket = rand(5, 10);
            launch();
        }
        for (let i = rockets.length - 1; i >= 0; i--) {
            const r = rockets[i], h = sprites[r.kind].h;
            r.h += r.turn * dt;
            const dx = Math.sin(r.h), dy = -Math.cos(r.h);
            r.x += dx * r.v * dt;
            r.y += dy * r.v * dt;
            for (r.acc += dt; r.acc > 0.04; r.acc -= 0.04) {
                const sp = rand(20, 45), side = rand(-6, 6);
                emit(r.x - dx * h / 2, r.y - dy * h / 2, -dx * sp - dy * side, -dy * sp + dx * side, rand(0.8, 1.4), SMOKE);
            }
            if (r.y < -h * 1.5 || r.x < -200 || r.x > W + 200) rockets.splice(i, 1);
        }

        if ((nextFlyby -= dt) <= 0) {
            nextFlyby = rand(12, 15);
            if (turn++ % 2 === 0) {
                hail = { x: -sprites.hail.w / 2, v: (W + sprites.hail.w) / rand(22, 26), t: 0, acc: 0 };
            } else {
                lm = { x: W + sprites.lm.w, v: (W + sprites.lm.w * 2) / rand(20, 24), t: 0 };
            }
        }
        if (hail) {
            hail.t += dt;
            hail.x += hail.v * dt;
            for (hail.acc += dt; hail.acc > 0.05; hail.acc -= 0.05) {
                emit(hail.x - sprites.hail.w / 2, hailY() + sprites.hail.h * 0.125, -rand(25, 45), rand(-6, 6), rand(1.2, 1.8), DRIVE);
            }
            if (hail.x > W + sprites.hail.w / 2 + 20) hail = null;
        }
        if (lm) {
            lm.t += dt;
            lm.x -= lm.v * dt;
            if (lm.x < -sprites.lm.w) lm = null;
        }

        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.age += dt;
            if (p.age >= p.life) {
                particles[i] = particles[particles.length - 1];
                particles.pop();
                continue;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vx *= 1 - dt * 0.8;
            p.vy *= 1 - dt * 0.8;
        }
    }

    function hailY() { return H * (phone ? 0.17 : 0.1) + (hail ? Math.sin(hail.t * 0.8) * 3 : 0); }

    function blit(s, x, y, a) {
        const c = Math.cos(a) * dpr, n = Math.sin(a) * dpr;
        ctx.setTransform(c, n, -n, c, x * dpr, y * dpr);
        ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
        ctx.globalAlpha = 1;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, W, H);

        const par = [4, 9, 16], bright = [0.45, 0.6, 0.9];
        for (const s of stars) {
            ctx.fillStyle = s.layer === 2 ? WHITE : GREY;
            ctx.globalAlpha = bright[s.layer] * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase));
            ctx.fillText(s.ch, s.x + sx * par[s.layer], s.y + sy * par[s.layer]);
        }

        ctx.fillStyle = WHITE;
        for (const s of shooters) {
            const fade = Math.min(1, s.life * 2);
            s.pts.forEach((p, i) => {
                ctx.globalAlpha = fade * (1 - i / s.pts.length);
                ctx.fillText(i === 0 ? "*" : i < 3 ? "+" : i < 7 ? ":" : ".", p.x, p.y);
            });
        }

        const ox = sx * 6, oy = sy * 6;
        ctx.globalAlpha = 1;
        ctx.drawImage(giant.img.c, giant.x + ox - giant.img.w / 2, giant.y + oy - giant.img.h / 2, giant.img.w, giant.img.h);
        ctx.drawImage(moon.img.c, moon.x + ox - moon.img.w / 2, moon.y + oy - moon.img.h / 2, moon.img.w, moon.img.h);

        let col = "";
        for (const c of earthCells) {
            const lon = c.lon + t * 0.25;
            const land = Math.sin(2 * lon + 1.3) * 0.5 + Math.sin(3 * lon + 0.7 + c.lat * 2) * 0.35 +
                Math.sin(5 * lon - c.lat * 4) * 0.2 + Math.cos(c.lat * 2.5) * 0.3 - 0.35;
            const cl = lon + t * 0.08;
            const cloud = Math.sin(4 * cl + c.lat * 5) * Math.sin(3 * c.lat + cl) > 0.45;
            const next = cloud ? WHITE : land > 0 ? GREY : DARK;
            if (next !== col) ctx.fillStyle = col = next;
            const b = 0.15 + 0.85 * c.light;
            ctx.globalAlpha = 0.35 + 0.65 * b;
            ctx.fillText(RAMP[Math.max(1, Math.round(b * 9))], earth.x + c.x + ox, earth.y + c.y + oy);
        }

        for (const p of particles) {
            const f = p.age / p.life;
            ctx.fillStyle = p.tbl[Math.floor(f * (p.tbl.length - 1))];
            ctx.globalAlpha = 0.8 * (1 - f);
            ctx.fillText(SMOKE_CHARS[Math.floor(f * SMOKE_CHARS.length)], p.x, p.y);
        }

        ctx.globalAlpha = 1;
        for (const r of rockets) blit(sprites[r.kind], r.x, r.y, r.h);
        if (hail) blit(sprites.hail, hail.x, hailY(), Math.sin(hail.t * 0.5) * 0.02);
        if (lm) blit(sprites.lm, lm.x, H * (phone ? 0.83 : 0.88) + Math.sin(lm.t * 0.9) * 5, Math.sin(lm.t * 0.6) * 0.05);
        ctx.globalAlpha = 1;
    }

    function still() {
        t = 12;
        hail = { x: W / 2, v: 0, t: 0, acc: 0 };
        draw();
    }

    let running = false, visible = true, last = 0, raf = 0;
    function frame(now) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        update(dt);
        draw();
    }
    function sync() {
        const on = visible && !document.hidden;
        if (reduced || on === running) return;
        running = on;
        if (on) {
            last = performance.now();
            raf = requestAnimationFrame(frame);
        } else {
            cancelAnimationFrame(raf);
        }
    }

    window.addEventListener("mousemove", e => {
        mx = e.clientX / window.innerWidth * 2 - 1;
        my = e.clientY / window.innerHeight * 2 - 1;
    });
    new ResizeObserver(resize).observe(space);
    new IntersectionObserver(entries => {
        visible = entries[0].isIntersecting;
        sync();
    }).observe(space);
    document.addEventListener("visibilitychange", sync);
    resize();
    sync();
})();
