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
    // muted accent colours, kept soft so the scene stays mostly black, grey and white
    const C = {
        ocean: "#3a86e8", land: "#5cc25a", desert: "#dcb466", halo: "#6fb2ff",
        violet: "#a487d6", lilac: "#d8ccf0", rose: "#e2a6d2", dusk: "#6b5a8c", core: "#f4ead8",
        hot: "#ffc27a", amber: "#e8582c", ember: "#8e2618",
        sand: "#d6bd8a", tan: "#a88b5e", ringA: "#cdb98e", ringB: "#8c7853"
    };
    const SMOKE_CHARS = "+:··.";
    const LIGHT = [0.55, 0.35, 0.76];
    const DRIFT = [4, 9, 16], PAR = [4, 9, 16], BRIGHT = [0.45, 0.6, 0.9];
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
        falcon: art(String.raw`
  /\
  ||
  ||
 =||=
  ||
  ||
  ||
  ||
  ||
 /||\
 ^^^^
`),
        starship: art(String.raw`
   /\
  /  \
 <|  |>
  |  |
  |  |
  |==|
  |  |
  |  |
  |  |
 <|  |>
  |__|
  ^^^^
`),
        soyuz: art(String.raw`
    ^
   / \
   | |
   |=|
   | |
  /| |\
 / | | \
|  | |  |
|__|_|__|
 ^^ ^ ^^
`),
        lm: art(String.raw`
    .--.
  _/____\_
 | [====] |
 |________|
  /| /\ |\
 /_|/  \|_\
`),
        voyager: art(String.raw`
     .-"""-.
    /       \
   |    o    |
    \       /
     '-._.-'
       [#]===========o
      / | \
     o  |  '
`),
        iss: art(String.raw`
|=|=|  |=|=|     |=|=|  |=|=|
|=|=|  |=|=|  _  |=|=|  |=|=|
|=|=|  |=|=| [_] |=|=|  |=|=|
======+======|#|======+======
|=|=|  |=|=| [_] |=|=|  |=|=|
|=|=|  |=|=|  |  |=|=|  |=|=|
|=|=|  |=|=|     |=|=|  |=|=|
`)
    };

    let W = 0, H = 0, dpr = 1, phone = false, fs = 13, cw = 8, lh = 15;
    let sprites = {}, stars = [];
    let galaxy, earth, giant, hole, obstacles = [];
    let t = 0, mx = 0, my = 0, sx = 0, sy = 0;
    const particles = [], rockets = [], shooters = [];
    let lastRocket = "", nextRocket = 2, nextShooter = 3, nextFlyby = 3, turn = 0, lm = null, voyagers = [], iss = null;

    function offscreen(w, h, size) {
        const c = document.createElement("canvas");
        c.width = Math.ceil(w * dpr);
        c.height = Math.ceil(h * dpr);
        const g = c.getContext("2d");
        g.scale(dpr, dpr);
        g.font = (size || fs) + "px " + FONT;
        g.textAlign = "center";
        g.textBaseline = "middle";
        // report the size the bitmap really covers, so it is drawn 1:1 and not resampled
        return { c, g, w: c.width / dpr, h: c.height / dpr };
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
    function sphereCells(r, sw = cw, sh = lh) {
        const out = [];
        for (let y = -Math.floor(r / sh) * sh; y <= r; y += sh) {
            for (let x = -Math.floor(r / sw) * sw; x <= r; x += sw) {
                const d2 = (x * x + y * y) / (r * r);
                if (d2 > 1) continue;
                out.push({ x, y, nx: x / r, ny: y / r, nz: Math.sqrt(1 - d2) });
            }
        }
        return out;
    }

    const lit = p => Math.max(0, p.nx * LIGHT[0] + p.ny * LIGHT[1] + p.nz * LIGHT[2]);

    function surfaceCells(r, sw, sh) {
        return sphereCells(r, sw, sh).map(p => ({ x: p.x, y: p.y, lat: Math.asin(-p.ny), lon: Math.atan2(p.nx, p.nz), light: lit(p) }));
    }

    // land on a 3 degree grid (Natural Earth 1:110m), north pole first, starting at 180 W
    const WORLD = [
        "                                                                                                                        ",
        "                                                                                                                        ",
        "                               ########     #########                                                                   ",
        "                            #######   ################          ## ##                      ##                           ",
        "                   ##  #  # ######   ################                             #           ###                       ",
        "                   ##   # ####  ##       ############                         #        ############# #     #            ",
        "      ####            ####  # #######     #########                 ##            ## ############################       ",
        " ################################################################         ##        #                                   ",
        "      ########################### ####     ###       ##         ### ################################################### ",
        "     ########################     ##        ##                #### ############################################# # ###  ",
        "        #     ###############     ### #                   #   # ##  #######################################      #      ",
        "                ###############   ######                  #     #  ######################################       ##      ",
        "                 ################ #######                # #################################################    #       ",
        "                   ###################                     #################################################            ",
        "                   ###################                     ########### # #### ############################ #            ",
        "                   ##################                    # ### ######    ### ############################  #            ",
        "                   ################                      ###     ###  ####### ###################### ##                 ",
        "                   ################                      ###    #  # ######## ####################### #   #             ",
        "                    ##############                        #####         ############################    ##              ",
        "                     ############                        ########  ##   #############################  #                ",
        "                       #####    #                       ############### #### ########################                   ",
        "                        ####                           ######################   ####################                    ",
        "                         ##      #                     ################# #######   ####### #######                      ",
        "                         ###  #     #                  #################  #####     ####   #### #                       ",
        "                           ####                       ################### ####      ###    #####    #                   ",
        "                              ##                      ######################         ##      ###                        ",
        "                               #   ### #               ######################        ##        #                        ",
        "                                  ######                #####################                        #                  ",
        "                                  #########              #    ##############                #     ##                    ",
        "                                  #########                    ############                  ## ###                     ",
        "                                 ############                  ###########                    #  ## #   #               ",
        "                                 ##############                 #########                     #          ###            ",
        "                                 ###############                #########                       ##        ###           ",
        "                                  ##############                #########                                               ",
        "                                   ############                 ##########  #                          ##  #            ",
        "                                    ###########                 #########  ##                        ##### ##           ",
        "                                     ##########                 ########   #                        #########           ",
        "                                     #########                   #######  ##                      ############          ",
        "                                    ########                     ######                           #############         ",
        "                                    ########                     ######                           #############         ",
        "                                    #######                       ####                             ############         ",
        "                                    ######                        #                                #      ####          ",
        "                                   ######                                                                  ###        # ",
        "                                   ####                                                                               # ",
        "                                    ##                                                                               #  ",
        "                                   ###                                                                              #   ",
        "                                   ##                                                                                   ",
        "                                   ##                                                                                   ",
        "                                                                                                                        ",
        "                                                                                                                        ",
        "                                                                                                                        ",
        "                                       #                                                                                ",
        "                                     #                                      ####       ######################           ",
        "                                    ###                       # ### ############### ##############################      ",
        "                   #      # #### #  ####               #############################################################    ",
        "           ##########################              ################################################################     ",
        "      #   ########################         ###    ################################################################      ",
        "         ###############################  #########################################################################     ",
        "          #                                                                                                             ",
        "                                                                                                                        "
    ];

    // rotating planets: each surface returns [colour, brightness factor, glow, char] for a point
    // (shared arrays, so nothing is allocated per cell per frame)
    const ICE = [WHITE, 1.1], LAND = [C.land, 1], DESERT = [C.desert, 1], SEA = [C.ocean, 0.4, false, "~"];
    const SURFACE = {
        earth(lat, lon) {
            if (Math.abs(lat) > 1.2) return ICE;
            const f = ((lon + Math.PI) / (2 * Math.PI) % 1 + 1) % 1, row = Math.min(59, Math.floor((Math.PI / 2 - lat) / Math.PI * 60));
            if (WORLD[row][Math.floor(f * 120)] !== "#") return SEA;
            // Sahara/Arabia, Kalahari and the Australian outback in sand, the rest green
            const d = f * 360 - 180, a = lat * 57.3;
            return (a > 14 && a < 32 && d > -17 && d < 60) || (a < -17 && a > -32 && ((d > 12 && d < 30) || (d > 115 && d < 145))) ? DESERT : LAND;
        }
    };

    function drawBody(b, ox, oy) {
        let col = "";
        if (b.font) ctx.font = b.font;
        for (const c of b.cells) {
            const [next, k, glow, ch] = SURFACE[b.kind](c.lat, c.lon + t * b.spin);
            if (ch === " ") continue;
            if (next !== col) ctx.fillStyle = col = next;
            const v = glow ? k : Math.min(1, ((b.ambient || 0.15) + (1 - (b.ambient || 0.15)) * c.light) * k);
            ctx.globalAlpha = 0.3 + 0.7 * v;
            ctx.fillText(ch || RAMP[Math.max(1, Math.round(v * 9))], b.x + c.x + ox, b.y + c.y + oy);
        }
        if (b.font) ctx.font = fs + "px " + FONT;
    }

    function drawHalo(b, ox, oy) {
        const r = b.r * 1.05, n = Math.round(2 * Math.PI * r / (cw * 1.1));
        ctx.fillStyle = C.halo;
        for (let i = 0; i < n; i++) {
            const a = i / n * Math.PI * 2;
            ctx.globalAlpha = 0.12 + 0.18 * Math.max(0, Math.cos(a - 0.6));
            ctx.fillText("·", b.x + Math.cos(a) * r + ox, b.y + Math.sin(a) * r + oy);
        }
    }

    // a small cratered moon, baked once
    function bakeMoon(b) {
        const r = Math.max(b.r * 0.24, lh * 0.9), sw = cw * 0.6, sh = lh * 0.6;
        const s = offscreen(r * 2 + sw * 2, r * 2 + sh * 2, Math.round(fs * 0.6));
        const craters = [[-0.35, -0.3, 0.28], [0.3, 0.25, 0.22], [0.1, -0.55, 0.15], [-0.2, 0.45, 0.18], [0.55, -0.1, 0.14]];
        for (const p of sphereCells(r, sw, sh)) {
            const pit = craters.some(([x, y, k]) => (p.nx - x) ** 2 + (p.ny - y) ** 2 < k * k);
            const v = lit(p) * (pit ? 0.55 : 1);
            s.g.fillStyle = pit ? DARK : v > 0.6 ? WHITE : GREY;
            s.g.globalAlpha = 0.35 + 0.65 * v;
            s.g.fillText(pit ? "o" : RAMP[Math.max(1, Math.round(v * 9))], s.w / 2 + p.x, s.h / 2 + p.y);
        }
        b.moon = s;
        b.moonGlow = glow(r * 1.6, "214,222,240", 0.09);
    }

    // the moon sits just off the planet's upper right, clear of the hero card, floating gently in a soft glow
    function drawMoon(b, ox, oy) {
        const m = b.moon, x = b.x + b.r * 1.45 + ox, y = b.y - b.r * (1 + 0.04 * Math.sin(t * 0.9)) + oy;
        haze(b.moonGlow, x, y, 0, 1, 0.8 + 0.2 * Math.sin(t * 1.3));
        ctx.globalAlpha = 1;
        ctx.drawImage(m.c, snap(x - m.w / 2), snap(y - m.h / 2), m.w, m.h);
    }

    // ring points stay put (the baked planet leaves gaps for the front ones); a brightness wave makes them spin
    function drawRing(pts, base, ox, oy) {
        let col = "";
        for (const p of pts) {
            if (p.col !== col) ctx.fillStyle = col = p.col;
            ctx.globalAlpha = base * (0.45 + 0.55 * Math.max(0, Math.sin(p.a * 5 - t * 1.6)));
            ctx.fillText(p.ch, giant.x + p.x + ox, giant.y + p.y + oy);
        }
    }

    function bakeGiant() {
        const r = giant.r, s = offscreen(r * 4.6, r * 4.6);
        const tilt = -0.35, ct = Math.cos(tilt), st = Math.sin(tilt);
        const back = [], front = [];
        [[1.55, ":", C.ringB], [1.95, "-", C.ringA]].forEach(([k, ch, col]) => {
            const rx = r * k, ry = rx * 0.28, n = Math.round(2 * Math.PI * rx / (cw * 0.9));
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
                const p = { x: ex * ct - ey * st, y: ex * st + ey * ct, ch, col, a };
                (ey < 0 ? back : front).push(p);
            }
        });
        giant.back = back.filter(p => p.x * p.x + p.y * p.y > r * r);
        giant.front = front;
        for (const p of sphereCells(r)) {
            if (front.some(f => Math.abs(f.x - p.x) < cw * 0.7 && Math.abs(f.y - p.y) < lh * 0.6)) continue;
            const b = lit(p);
            s.g.fillStyle = Math.sin(p.ny * 9 + Math.sin(p.ny * 3) * 1.5) > 0 ? C.sand : C.tan;
            s.g.globalAlpha = 0.3 + 0.7 * b;
            s.g.fillText(RAMP[Math.max(1, Math.round(b * 9))], s.w / 2 + p.x, s.h / 2 + p.y);
        }
        giant.img = s;
    }

    // soft coloured glow: a radial gradient around the origin, drawn squashed and tilted with haze()
    function glow(r, rgb, a) {
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, "rgba(" + rgb + "," + a + ")");
        g.addColorStop(1, "rgba(" + rgb + ",0)");
        return { g, r };
    }

    function haze(h, x, y, tilt, squash, alpha = 1) {
        const c = Math.cos(tilt) * dpr, n = Math.sin(tilt) * dpr;
        ctx.setTransform(c, n, -n * squash, c * squash, x * dpr, y * dpr);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = h.g;
        ctx.fillRect(-h.r, -h.r, h.r * 2, h.r * 2);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // spiral galaxy: bright core, two arms with dust lanes and star knots, faint halo
    function buildGalaxy() {
        const pts = [], R = galaxy.r, n = phone ? 80 : 140;
        const add = (r, a, k, ch, col) => pts.push({ r, a, k, ch, col });
        for (let arm = 0; arm < 2; arm++) {
            for (let i = 0; i < n; i++) {
                const f = i / n, a = arm * Math.PI + f * 3.8, spread = 0.3 + f;
                const k = 1 - f * 0.75, r = R * (0.12 + f * 0.88) * rand(0.94, 1.06);
                add(r, a + rand(-0.25, 0.25) * spread, k, k > 0.92 ? "*" : k > 0.52 ? "+" : k > 0.38 ? "·" : ".", k > 0.7 ? C.lilac : C.violet);
                if (i % 2 === 0) add(r * rand(1.02, 1.12), a + rand(-0.4, 0.4) * spread, k * 0.5, "·", C.violet);
                if (i % 3 === 0) add(r * 0.93, a - 0.22, 0.35, ".", DARK);
                if (i % 17 === 8) add(r, a, 0.85, "o", C.rose);
            }
        }
        for (let i = 0; i < 24; i++) {
            const r = R * Math.pow(Math.random(), 1.5) * 0.16;
            add(r, rand(0, 6.28), 1 - r / (R * 0.2), r < R * 0.05 ? "@" : r < R * 0.1 ? "%" : "*", C.core);
        }
        for (let i = 0; i < (phone ? 25 : 45); i++) add(R * rand(0.2, 1.15), rand(0, 6.28), 0.15, "·", C.dusk);
        galaxy.pts = pts;
        galaxy.haze = glow(R * 1.1, "164,135,214", 0.14);
    }

    function drawGalaxy(ox, oy) {
        const tilt = -0.45, ct = Math.cos(tilt), st = Math.sin(tilt);
        haze(galaxy.haze, galaxy.x + ox, galaxy.y + oy, tilt, 0.5);
        let col = "";
        for (const p of galaxy.pts) {
            const a = p.a + t * 0.12, x = Math.cos(a) * p.r, y = Math.sin(a) * p.r * 0.5;
            if (p.col !== col) ctx.fillStyle = col = p.col;
            ctx.globalAlpha = 0.2 + 0.7 * p.k * (0.8 + 0.2 * Math.sin(t * 2 + p.a * 5));
            ctx.fillText(p.ch, galaxy.x + x * ct - y * st + ox, galaxy.y + x * st + y * ct + oy);
        }
    }

    // black hole: a flattened accretion disk plus the far side of it lensed over and under the shadow
    function buildHole() {
        const r = hole.r, disk = [], lens = [];
        const tilt = 0.12, ct = Math.cos(tilt), st = Math.sin(tilt);
        for (let k = 0; k < 5; k++) {
            const rx = r * (1.35 + k * 0.32), ry = rx * 0.24, n = Math.round(2 * Math.PI * rx / (cw * 0.85));
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
                disk.push({ x: ex * ct - ey * st, y: ex * st + ey * ct, a, k: 1 - k / 5, ch: k < 2 ? "=" : k < 4 ? "-" : ".", front: ey > 0 });
            }
        }
        for (const [rr, ch, base] of [[1.12, "·", 0.9], [1.35, ".", 0.45]]) {
            const R = r * rr, n = Math.round(2 * Math.PI * R / (cw * 0.8));
            for (let i = 0; i < n; i++) {
                const a = i / n * Math.PI * 2;
                lens.push({ x: Math.cos(a) * R, y: Math.sin(a) * R * 0.95, a, ch, k: base * (Math.sin(a) < 0 ? 1 : 0.55) });
            }
        }
        Object.assign(hole, { disk, lens, glow: glow(r * 3.2, "214,64,36", 0.22) });
    }

    function drawDisk(x0, y0, front) {
        let col = "";
        for (const p of hole.disk) {
            if (p.front !== front) continue;
            const next = p.k > 0.7 ? C.hot : p.k > 0.4 ? C.amber : C.ember;
            if (next !== col) ctx.fillStyle = col = next;
            ctx.globalAlpha = (0.25 + 0.6 * p.k) * (0.55 + 0.45 * Math.sin(p.a * 3 - t * 2.2 + p.k * 4));
            ctx.fillText(p.ch, x0 + p.x, y0 + p.y);
        }
    }

    function drawBlackHole(ox, oy) {
        const x0 = hole.x + ox, y0 = hole.y + oy;
        haze(hole.glow, x0, y0, 0.12, 0.6);
        drawDisk(x0, y0, false);
        ctx.globalAlpha = 1;
        ctx.fillStyle = BG;
        ctx.beginPath();
        ctx.arc(x0, y0, hole.r * 1.02, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = C.hot;
        for (const p of hole.lens) {
            ctx.globalAlpha = p.k * (0.6 + 0.4 * Math.sin(p.a * 4 + t * 1.8));
            ctx.fillText(p.ch, x0 + p.x, y0 + p.y);
        }
        drawDisk(x0, y0, true);
    }

    function resize() {
        W = space.clientWidth;
        H = space.clientHeight;
        dpr = Math.min(window.devicePixelRatio || 1, 3);
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
            falcon: sprite(ART.falcon, 0.75),
            starship: sprite(ART.starship, 0.75),
            soyuz: sprite(ART.soyuz, 0.75),
            lm: sprite(ART.lm, 0.85),
            iss: sprite(ART.iss, 0.8),
            voyager: sprite(ART.voyager, 0.75)
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
        stars.sort((a, b) => a.layer - b.layer);

        const m = Math.min(W, H);
        if (phone) {
            galaxy = { x: W * 0.82, y: H * 0.92, r: m * 0.12 };
            earth = { x: W * 0.15, y: H * 0.08, r: m * 0.11 };
            giant = { x: W * 0.84, y: H * 0.09, r: m * 0.055 };
            hole = { x: W * 0.15, y: H * 0.92, r: m * 0.04 };
        } else {
            galaxy = { x: W * 0.86, y: H * 0.78, r: m * 0.12 };
            earth = { x: W * 0.14, y: H * 0.21, r: m * 0.125 };
            giant = { x: W * 0.86, y: H * 0.22, r: m * 0.065 };
            hole = { x: W * 0.15, y: H * 0.78, r: m * 0.045 };
        }

        // keep the bodies clear of the hero card (it covers more of the screen when zoomed in):
        // take the shorter of sliding sideways or up/down out of it, and shrink only if neither fits
        const card = document.getElementById("smaller-box"), sr = space.getBoundingClientRect();
        if (card) {
            const c = card.getBoundingClientRect(), gap = 6;
            const top = c.top - sr.top, bottom = c.bottom - sr.top, left = c.left - sr.left, right = c.right - sr.left;
            // [body, extent above, extent below, half width] in radii; earth's height includes its moon
            for (const [b, up, down, w] of [[earth, 1.3, 1.08, 1.08], [giant, 1, 1, 2], [galaxy, 0.7, 0.7, 1.1], [hole, 1.4, 1.4, 2.7]]) {
                const high = b.y < (top + bottom) / 2, west = b.x < (left + right) / 2;
                if (b.x + w * b.r < left || b.x - w * b.r > right || (high ? b.y + down * b.r < top : b.y - up * b.r > bottom)) continue;
                const nx = west ? left - gap - w * b.r : right + gap + w * b.r, ny = high ? top - gap - down * b.r : bottom + gap + up * b.r;
                const fitX = west ? nx - w * b.r >= gap : nx + w * b.r <= W - gap, fitY = high ? ny - up * b.r >= gap : ny + down * b.r <= H - gap;
                if (fitX && (!fitY || Math.abs(nx - b.x) < Math.abs(ny - b.y))) b.x = nx;
                else if (fitY) b.y = ny;
                else {
                    const rx = ((west ? left : W - right) - gap * 2) / (w * 2), ry = ((high ? top : H - bottom) - gap * 2) / (up + down);
                    b.r = Math.max(6, rx, ry);
                    if (rx > ry) b.x = west ? gap + w * b.r : W - gap - w * b.r;
                    else b.y = high ? gap + up * b.r : H - gap - down * b.r;
                }
            }
        }

        // earth uses a smaller font on a tighter grid so the coastlines show
        const ef = 0.7;
        Object.assign(earth, { kind: "earth", spin: 0.15, ambient: 0.5, font: Math.round(fs * ef) + "px " + FONT, cells: surfaceCells(earth.r, cw * ef, lh * ef) });
        buildGalaxy();
        bakeGiant();
        bakeMoon(earth);
        obstacles = [
            { x: earth.x, y: earth.y, r: earth.r * 1.1 },
            { x: earth.x + earth.r * 1.45, y: earth.y - earth.r, r: earth.r * 0.4 },
            { x: giant.x, y: giant.y, r: giant.r * 2 },
            { x: galaxy.x, y: galaxy.y, r: galaxy.r * 0.85 },
            { x: hole.x, y: hole.y, r: hole.r * 2 }
        ];
        buildHole();

        if (reduced) still();
    }

    function emit(x, y, vx, vy, life, tbl) {
        if (particles.length > 400) return;
        particles.push({ x, y, vx, vy, age: 0, life, tbl });
    }

    function launch() {
        const kinds = ["saturn", "shuttle", "falcon", "starship", "soyuz"].filter(k => k !== lastRocket);
        const kind = lastRocket = kinds[Math.floor(Math.random() * kinds.length)];
        // don't launch right under a low body: there's no room to steer round it
        let x = rand(W * 0.08, W * 0.92);
        for (let i = 0; i < 8 && obstacles.some(o => o.y > H * 0.6 && Math.abs(x - o.x) < o.r * 1.3); i++) x = rand(W * 0.08, W * 0.92);
        rockets.push({
            kind, x, y: H + sprites[kind].h,
            h: rand(-0.35, 0.35), turn: rand(-0.12, 0.12),
            v: rand(70, 120) * (phone ? 0.7 : 1), acc: 0, dodge: 0, dv: 0
        });
    }

    function update(dt) {
        t += dt;
        const k = Math.min(1, dt * 3);
        sx += (mx - sx) * k;
        sy += (my - sy) * k;

        for (const s of stars) {
            s.x -= DRIFT[s.layer] * dt;
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
            r.h = Math.max(-0.6, Math.min(0.6, r.h + r.turn * dt));
            // steer around bodies ahead: each one near the path pulls the heading away from its side,
            // fading in and out smoothly, and a damped spring eases the rocket onto that heading
            let target = 0;
            for (const o of obstacles) {
                const oy = o.y - r.y, near = o.r + h * 3 + 60;
                if (oy > 0) continue;
                const d = Math.hypot(o.x - r.x, oy), f = Math.max(0, Math.min(1, 1 - (d - o.r) / (near - o.r)));
                target += (r.x < o.x ? -1.1 : 1.1) * f * f * (3 - 2 * f);
            }
            target = Math.max(-0.9, Math.min(0.9, target));
            r.dv += ((target - r.dodge) * 4 - r.dv * 4) * dt;
            r.dodge += r.dv * dt;
            const a = r.h + r.dodge, dx = Math.sin(a), dy = -Math.cos(a);
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
            const next = turn++ % 3;
            if (next === 0) {
                lm = { x: W + sprites.lm.w, v: (W + sprites.lm.w * 2) / rand(20, 24), t: 0 };
            } else if (next === 1) {
                // Voyager drifts slowly out across the top
                const d = rand(50, 56), vw = sprites.voyager.w;
                voyagers.push({ x: -vw, y: H * 0.16, vx: (W + vw * 2) / d, vy: -H * 0.1 / d, t: 0 });
            } else {
                const d = rand(24, 28);
                iss = { x: -sprites.iss.w, y: H * (phone ? 0.12 : 0.04), v: (W + sprites.iss.w * 2) / d, vy: H * (phone ? 0.22 : 0.3) / d };
            }
        }
        for (let i = voyagers.length - 1; i >= 0; i--) {
            const v = voyagers[i];
            v.t += dt;
            v.x += v.vx * dt;
            v.y += v.vy * dt;
            if (v.x < -sprites.voyager.w * 1.5 || v.x > W + sprites.voyager.w * 1.5) voyagers.splice(i, 1);
        }
        if (iss) {
            iss.x += iss.v * dt;
            iss.y += iss.vy * dt;
            if (iss.x > W + sprites.iss.w) iss = null;
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

    // round to the nearest device pixel so unrotated bitmaps stay crisp
    function snap(v) { return Math.round(v * dpr) / dpr; }

    function blit(s, x, y, a) {
        if (Math.abs(a) < 0.002) {
            ctx.drawImage(s.c, snap(x - s.w / 2), snap(y - s.h / 2), s.w, s.h);
            return;
        }
        const c = Math.cos(a) * dpr, n = Math.sin(a) * dpr;
        ctx.setTransform(c, n, -n, c, x * dpr, y * dpr);
        ctx.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function draw() {
        ctx.globalAlpha = 1;
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, W, H);

        let col = "";
        for (const s of stars) {
            const next = s.layer === 2 ? WHITE : GREY;
            if (next !== col) ctx.fillStyle = col = next;
            ctx.globalAlpha = BRIGHT[s.layer] * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase));
            ctx.fillText(s.ch, s.x + sx * PAR[s.layer], s.y + sy * PAR[s.layer]);
        }

        ctx.fillStyle = WHITE;
        for (const s of shooters) {
            const fade = Math.min(1, s.life * 2);
            for (let i = 0; i < s.pts.length; i++) {
                ctx.globalAlpha = fade * (1 - i / s.pts.length);
                ctx.fillText(i === 0 ? "*" : i < 3 ? "+" : i < 7 ? ":" : ".", s.pts[i].x, s.pts[i].y);
            }
        }

        const ox = sx * 6, oy = sy * 6;
        drawRing(giant.back, 0.6, ox, oy);
        ctx.globalAlpha = 1;
        ctx.drawImage(giant.img.c, snap(giant.x + ox - giant.img.w / 2), snap(giant.y + oy - giant.img.h / 2), giant.img.w, giant.img.h);
        drawRing(giant.front, 0.8, ox, oy);
        drawGalaxy(ox, oy);
        drawHalo(earth, ox, oy);
        drawBody(earth, ox, oy);
        drawMoon(earth, ox, oy);
        drawBlackHole(ox, oy);

        col = "";
        for (const p of particles) {
            const f = p.age / p.life, next = p.tbl[Math.floor(f * (p.tbl.length - 1))];
            if (next !== col) ctx.fillStyle = col = next;
            ctx.globalAlpha = 0.8 * (1 - f);
            ctx.fillText(SMOKE_CHARS[Math.floor(f * SMOKE_CHARS.length)], p.x, p.y);
        }

        ctx.globalAlpha = 1;
        for (const r of rockets) blit(sprites[r.kind], r.x, r.y, r.h + r.dodge);
        if (lm) blit(sprites.lm, lm.x, H * (phone ? 0.83 : 0.88) + Math.sin(lm.t * 0.9) * 5, Math.sin(lm.t * 0.6) * 0.05);
        if (iss) blit(sprites.iss, iss.x, iss.y, Math.atan2(iss.vy, iss.v));
        for (const v of voyagers) blit(sprites.voyager, v.x, v.y, Math.sin(v.t * 0.3) * 0.15);
    }

    function still() {
        t = 12;
        lm = { x: W / 2, v: 0, t: 0 };
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
