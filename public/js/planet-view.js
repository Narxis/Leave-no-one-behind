// PlanÃ¨te dessinÃ©e par le code Ã  partir de ses stats et d'une graine (l'id de
// la carte) : chaque planÃ¨te est unique et toujours la mÃªme d'une page Ã  l'autre.
// Les couches n'apparaissent qu'une fois la stat scannÃ©e, pour ne rien dÃ©voiler :
//   wtr â†’ mers, lacs gelÃ©s ou liquide inconnu    res â†’ couleurs de la roche
//   cli â†’ calottes, lave, monde figÃ©, nuages     oxy â†’ couleur de l'atmosphÃ¨re
//   grv â†’ taille de la planÃ¨te                    ff  â†’ vÃ©gÃ©tation, lumiÃ¨res des villes
// Les paliers sont ceux des textes de scan (public/js/planet.js).
(function () {
    const TABS = {
        oxy: [0, .2, .4, .6, .8, 1],
        cli: [0, .25, .5, .75, 1],
        flo: [0, .25, .5, .75, 1],
        civ: [0, .1, .2, .8, 1],
        res: [0, .2, .4, .6, .8, 1],
        grv: [0, .3, .6, .8, 1],
        wtr: [0, .2, .3, .4, .6, .8, 1]
    };
    const LAYERS = ['wtr', 'res', 'cli', 'oxy', 'grv', 'ff'];
    const TEX_W = 512, TEX_H = 256;
    const SWEEP_MS = 1500;
    const LIGHT = norm([-0.62, 0.42, 0.66]);
    const HALF = norm([LIGHT[0], LIGHT[1], LIGHT[2] + 1]);

    function norm(v) {
        let l = Math.hypot(v[0], v[1], v[2]);
        return [v[0] / l, v[1] / l, v[2] / l];
    }

    const tier = (value, tab) => {
        let i = 0;
        while (i < tab.length - 2 && value > tab[i + 1] * 100)
            i++;
        return i;
    };
    const clamp01 = (v) => v < 0 ? 0 : (v > 1 ? 1 : v);
    const smooth = (a, b, v) => {
        let t = clamp01((v - a) / (b - a));
        return t * t * (3 - 2 * t);
    };
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

    function mulberry32(a) {
        return function () {
            a |= 0;
            a = a + 0x6D2B79F5 | 0;
            let t = Math.imul(a ^ a >>> 15, 1 | a);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    // Bruit de Perlin 3D avec une table de permutation tirÃ©e de la graine
    function makeNoise(rng) {
        let p = [...Array(256).keys()];
        for (let i = 255; i > 0; i--) {
            let j = Math.floor(rng() * (i + 1));
            [p[i], p[j]] = [p[j], p[i]];
        }
        const perm = new Uint8Array(512);
        for (let i = 0; i < 512; i++)
            perm[i] = p[i & 255];
        const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
        const grad = (h, x, y, z) => {
            h &= 15;
            let u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z);
            return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
        };
        const noise = (x, y, z) => {
            let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
            x -= X; y -= Y; z -= Z;
            X &= 255; Y &= 255; Z &= 255;
            let u = fade(x), v = fade(y), w = fade(z);
            let A = perm[X] + Y, AA = perm[A] + Z, AB = perm[A + 1] + Z;
            let B = perm[X + 1] + Y, BA = perm[B] + Z, BB = perm[B + 1] + Z;
            const l = (a, b, t) => a + t * (b - a);
            return l(l(l(grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z), u),
                l(grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z), u), v),
                l(l(grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1), u),
                    l(grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1), u), v), w);
        };
        return function fbm(x, y, z, octaves) {
            let sum = 0, amp = 0.5, freq = 1;
            for (let i = 0; i < octaves; i++) {
                sum += amp * noise(x * freq, y * freq, z * freq);
                freq *= 2.03;
                amp *= 0.5;
            }
            return sum;
        };
    }

    function hashSeed(modules) {
        let h = 2166136261;
        for (let k of Object.keys(modules).sort()) {
            let s = k + modules[k].val;
            for (let i = 0; i < s.length; i++)
                h = Math.imul(h ^ s.charCodeAt(i), 16777619);
        }
        return h >>> 0;
    }

    // Champs de bruit calculÃ©s une fois : relief, humiditÃ©, dÃ©tail, crÃªtes,
    // villes, nuages. Les couleurs sont recalculÃ©es Ã  chaque scan
    function buildFields(seed) {
        let rng = mulberry32(seed);
        let fbm = makeNoise(rng);
        let o = () => rng() * 100;
        let off = [[o(), o(), o()], [o(), o(), o()], [o(), o(), o()], [o(), o(), o()], [o(), o(), o()], [o(), o(), o()]];
        let n = TEX_W * TEX_H;
        let f = {
            elev: new Float32Array(n), moist: new Float32Array(n), detail: new Float32Array(n),
            ridge: new Float32Array(n), city: new Float32Array(n), cloud: new Float32Array(n),
            px: new Float32Array(n), py: new Float32Array(n), pz: new Float32Array(n), lat: new Float32Array(n)
        };
        for (let v = 0; v < TEX_H; v++) {
            let lat = (0.5 - (v + 0.5) / TEX_H) * Math.PI;
            let cl = Math.cos(lat), sl = Math.sin(lat);
            for (let u = 0; u < TEX_W; u++) {
                let lon = (u + 0.5) / TEX_W * Math.PI * 2;
                let x = cl * Math.sin(lon), y = sl, z = cl * Math.cos(lon);
                let i = v * TEX_W + u;
                f.px[i] = x; f.py[i] = y; f.pz[i] = z; f.lat[i] = lat;
                // Relief dÃ©formÃ© par un second bruit, pour des continents moins ronds
                let wx = fbm(x * 1.2 + off[5][0], y * 1.2 + off[5][1], z * 1.2 + off[5][2], 3);
                f.elev[i] = fbm(x * 1.7 + off[0][0] + wx, y * 1.7 + off[0][1] + wx, z * 1.7 + off[0][2], 6);
                f.moist[i] = fbm(x * 2.4 + off[1][0], y * 2.4 + off[1][1], z * 2.4 + off[1][2], 4);
                f.detail[i] = fbm(x * 9 + off[2][0], y * 9 + off[2][1], z * 9 + off[2][2], 3);
                f.ridge[i] = 1 - Math.abs(fbm(x * 3.2 + off[3][0], y * 3.2 + off[3][1], z * 3.2 + off[3][2], 4)) * 2.2;
                f.city[i] = fbm(x * 16 + off[4][0], y * 16 + off[4][1], z * 16 + off[4][2], 3);
                // Nuages Ã©tirÃ©s en longitude, comme des bandes de vent. Relief et
                // nuages sont ensuite remis Ã  plat (rang de 0 Ã  1) pour rÃ©gler la
                // part de liquide et de ciel couvert au pourcentage prÃ¨s
                f.cloud[i] = fbm(x * 2.3 + wx * 1.4, y * 5.2, z * 2.3 + wx, 5);
            }
        }
        f.elev = toRank(f.elev);
        f.cloud = toRank(f.cloud);
        return f;
    }

    function toRank(values) {
        let n = values.length;
        let order = Array.from(values.keys()).sort((a, b) => values[a] - values[b]);
        let rank = new Float32Array(n);
        order.forEach((idx, r) => { rank[idx] = r / (n - 1); });
        return rank;
    }

    const RES_PALETTE = [
        ['#6d6862', '#a59e93'],
        ['#5a2a1c', '#b65a3c'],
        ['#4e3b2c', '#9c7c56'],
        ['#463629', '#8f7352'],
        ['#6a3b2a', '#b38c45']
    ];
    const ATMOS = [
        {color: '#e6c56c', size: .17, tint: .16},
        {color: '#8fd9a3', size: .11, tint: .07},
        {color: '#c2d3e2', size: .05, tint: .02},
        {color: '#c6abff', size: .08, tint: .04},
        {color: '#73b4ff', size: .09, tint: .02},
        {color: '#4ad9ff', size: .12, tint: .03}
    ];
    const UNKNOWN_ATMOS = {color: '#9097a6', size: .04, tint: 0};
    const LIQUID_COVER = [0.34, 0.16, 0.10, 0.22, 0.50, 0.72];

    // Couleurs, Ã©missions (lave, villes) et nuages selon les couches rÃ©vÃ©lÃ©es
    function paint(f, s, shown) {
        let n = TEX_W * TEX_H;
        let albedo = new Uint8ClampedArray(n * 3);
        let emit = new Uint8ClampedArray(n * 3);
        let night = new Uint8ClampedArray(n * 3);
        let water = new Uint8Array(n);
        let clouds = new Uint8ClampedArray(n * 4);

        let wT = tier(s.wtr, TABS.wtr), rT = tier(s.res, TABS.res), cT = tier(s.cli, TABS.cli);
        let fT = tier(s.flo, TABS.flo), vT = tier(s.civ, TABS.civ);
        let hasW = shown.has('wtr'), hasR = shown.has('res'), hasC = shown.has('cli'), hasF = shown.has('ff');
        let sea = hasW ? LIQUID_COVER[wT] : 0;
        let rock = hasR ? RES_PALETTE[rT].map(hex) : [hex('#43444e'), hex('#8b8d99')];
        let capLat = !hasC ? 99 : ([99, 99, 66, 74][cT] - (hasW && wT === 1 ? 22 : 0));
        let lockSide = hasC && cT === 1;

        let liquid = !hasW ? null : wT === 0
            ? [hex('#4a2a10'), hex('#b8742c')]
            : (wT === 1 ? [hex('#a9cfe2'), hex('#e4f2f8')] : [hex('#0b2c57'), hex('#2f93b6')]);
        let veg = !hasF ? null : [null, [hex('#7d2aa8'), hex('#c4479f')], [hex('#46702d'), hex('#6f9a43')], [hex('#1f6a2c'), hex('#4fa046')]][fT];
        let vegThresh = [1, .02, .14, -.10][fT];
        let lights = !hasF ? null : [{c: hex('#ff5c3c'), t: .08, k: 1}, {c: hex('#ffad5a'), t: .26, k: .55}, null, {c: hex('#ffe7a8'), t: .1, k: 1}][vT];
        let ice = hex('#e8f3f8');
        let basalt = hex('#2b2326');
        let lava = hex('#ff6a1c');

        // Part du ciel couverte : plus d'eau, plus de nuages ; tempÃªtes sur un monde figÃ©
        let cover = hasC ? (lockSide ? .42 : .14 + (hasW ? wT * .045 : .08)) : 0;
        let cloudCol = hasC && cT === 0 ? hex('#c7bd8c') : (shown.has('oxy') && tier(s.oxy, TABS.oxy) === 1 ? hex('#c3d9a2') : hex('#f4f7fb'));

        for (let i = 0; i < n; i++) {
            let e = f.elev[i], d = f.detail[i], m = f.moist[i];
            let latDeg = Math.abs(f.lat[i]) * 57.3;
            let c = mix(rock[0], rock[1], clamp01((e - sea) / (1 - sea + 1e-6) * 1.1 + d * .35));
            let isWater = e < sea;

            // Roche : minerais rares (Ã©clats) et ressources variÃ©es (bandes)
            if (hasR && rT === 3 && d > .33)
                c = mix(c, (i % 2) ? hex('#78e6ff') : hex('#c58cff'), .75);
            if (hasR && rT === 4)
                c = mix(c, m > 0 ? hex('#7a4f86') : hex('#5d7a3c'), clamp01(Math.abs(m) * 1.6) * .3);
            if (hasR && rT === 1 && m > .12)
                c = mix(c, hex('#c7783a'), .35);

            let k = i * 3;
            if (isWater) {
                let depth = clamp01((sea - e) / sea);
                c = wT === 1 ? mix(liquid[1], liquid[0], depth * .6 + d * .4) : mix(liquid[1], liquid[0], Math.sqrt(depth));
                water[i] = wT === 1 ? 0 : 1;
            }
            else {
                // Climat : basalte et lave, monde figÃ© (face brÃ»lÃ©e / face gelÃ©e)
                if (hasC && cT === 0) {
                    c = mix(c, basalt, .6);
                    let r = f.ridge[i];
                    if (r > .83) {
                        let g = smooth(.83, .97, r);
                        emit[k] = lava[0] * g; emit[k + 1] = lava[1] * g * .8; emit[k + 2] = lava[2] * g;
                    }
                }
                if (veg && fT > 0 && e < .9 && m > vegThresh)
                    c = mix(c, mix(veg[0], veg[1], clamp01(d + .5)), smooth(vegThresh, vegThresh + .2, m) * .85);
                if (lights && f.city[i] > lights.t && e < .85) {
                    let g = smooth(lights.t, lights.t + .12, f.city[i]) * lights.k;
                    night[k] = lights.c[0] * g; night[k + 1] = lights.c[1] * g; night[k + 2] = lights.c[2] * g;
                }
            }
            if (lockSide) {
                let facing = f.px[i] * LIGHT[0] + f.py[i] * LIGHT[1] + f.pz[i] * LIGHT[2];
                if (facing > .25)
                    c = mix(c, hex('#e0c99c'), smooth(.25, .8, facing) * .7);
                else if (facing < -.05)
                    c = mix(c, ice, smooth(-.05, -.4, facing) * .9);
            }
            // Calottes polaires, Ã  bord irrÃ©gulier
            if (latDeg + d * 9 > capLat)
                c = mix(c, ice, smooth(capLat, capLat + 5, latDeg + d * 9));

            albedo[k] = c[0]; albedo[k + 1] = c[1]; albedo[k + 2] = c[2];

            if (cover) {
                let cv = f.cloud[i];
                // Monde figÃ© : les tempÃªtes se massent sur la ligne jour/nuit
                if (lockSide)
                    cv *= 1.25 - Math.abs(f.px[i] * LIGHT[0] + f.py[i] * LIGHT[1] + f.pz[i] * LIGHT[2]);
                let a = smooth(1 - cover - .06, 1 - cover + .2, cv) * .85;
                let j = i * 4;
                clouds[j] = cloudCol[0]; clouds[j + 1] = cloudCol[1]; clouds[j + 2] = cloudCol[2]; clouds[j + 3] = a * 235;
            }
        }
        return {albedo, emit, night, water, clouds, hasClouds: cover > 0};
    }

    function radiusScale(s, shown) {
        if (!shown.has('grv'))
            return 1;
        let t = tier(s.grv, TABS.grv);
        let big = s.grv % 2 === 0;
        return [big ? 1.3 : .7, big ? 1.17 : .83, big ? 1.07 : .93, 1][t];
    }

    function create(canvas, options) {
        let modules = options.modules || {};
        let s = {};
        for (let k of ['oxy', 'grv', 'wtr', 'res', 'fau', 'flo', 'civ', 'cli'])
            s[k] = Number(modules[k] && modules[k].val) || 0;
        let seed = Number(options.seed) || hashSeed(modules);
        let shown = new Set(options.revealed === 'all' ? LAYERS : (options.revealed || []));
        // Monde figÃ© (face toujours tournÃ©e vers son Ã©toile) : il ne tourne pas
        let spin = () => (shown.has('cli') && tier(s.cli, TABS.cli) === 1) ? 0 : 1;

        let fields = buildFields(seed);
        let tex = paint(fields, s, shown), prevTex = null;
        let scale = radiusScale(s, shown), fromScale = scale;
        let sweepStart = 0;
        let rot = (seed % 628) / 100, cloudRot = rot;
        let rotSpeed = spin();

        let cssSize = options.size || canvas.clientWidth || 340;
        let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        let size = Math.round(cssSize * dpr);
        canvas.width = canvas.height = size;
        let ctx = canvas.getContext('2d');
        let sphere = document.createElement('canvas');
        let sctx = sphere.getContext('2d');
        let baseR = size * .3;

        // Projection de la sphÃ¨re : pour chaque pixel du disque, sa longitude
        // de base, sa ligne de texture et son Ã©clairage (recalculÃ©s si la taille change)
        let map = null;
        function buildMap(r) {
            let R = Math.ceil(r);
            let w = R * 2;
            sphere.width = sphere.height = w;
            let count = 0, idx = [], lonF = [], row = [], diff = [], spec = [], limb = [], dark = [];
            for (let y = 0; y < w; y++) {
                for (let x = 0; x < w; x++) {
                    let nx = (x + .5 - R) / r, ny = -(y + .5 - R) / r;
                    let q = nx * nx + ny * ny;
                    if (q > 1)
                        continue;
                    let nz = Math.sqrt(1 - q);
                    let lat = Math.asin(ny);
                    let lon = Math.atan2(nx, nz);
                    let dot = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2];
                    let h = Math.max(0, nx * HALF[0] + ny * HALF[1] + nz * HALF[2]);
                    idx.push(y * w + x);
                    lonF.push(lon / (Math.PI * 2) * TEX_W);
                    row.push(Math.min(TEX_H - 1, Math.floor((.5 - lat / Math.PI) * TEX_H)) * TEX_W);
                    diff.push(smooth(-.18, .7, dot) * .97 + .05);
                    spec.push(Math.pow(h, 70) * .45);
                    limb.push(Math.pow(1 - nz, 2.2));
                    dark.push(1 - smooth(-.12, .22, dot));
                    // Antialiasing du bord du disque
                    count++;
                }
            }
            map = {
                r, w, count, idx: Int32Array.from(idx), lonF: Float32Array.from(lonF), row: Int32Array.from(row),
                diff: Float32Array.from(diff), spec: Float32Array.from(spec), limb: Float32Array.from(limb),
                dark: Float32Array.from(dark), img: sctx.createImageData(w, w)
            };
        }

        function atmos() {
            return shown.has('oxy') ? ATMOS[tier(s.oxy, TABS.oxy)] : UNKNOWN_ATMOS;
        }

        function drawSphere(sweepX) {
            let m = map, data = m.img.data;
            data.fill(0);
            let a = atmos(), ac = hex(a.color);
            let u0 = rot / (Math.PI * 2) * TEX_W, cu0 = cloudRot / (Math.PI * 2) * TEX_W;
            let half = m.w / 2;
            for (let p = 0; p < m.count; p++) {
                let lu = m.lonF[p];
                let u = Math.floor(lu + u0) % TEX_W;
                if (u < 0) u += TEX_W;
                let ti = m.row[p] + u;
                let px = m.idx[p] % m.w;
                // Pendant un scan : Ã  gauche du balayage la nouvelle couche, Ã  droite l'ancienne
                let t = (prevTex && px > sweepX) ? prevTex : tex;
                let k = ti * 3;
                let shade = m.diff[p];
                let r = t.albedo[k] * shade, g = t.albedo[k + 1] * shade, b = t.albedo[k + 2] * shade;
                if (t.water[ti]) {
                    let sp = m.spec[p] * 255;
                    r += sp; g += sp; b += sp;
                }
                let dk = m.dark[p];
                r += t.night[k] * dk + t.emit[k]; g += t.night[k + 1] * dk + t.emit[k + 1]; b += t.night[k + 2] * dk + t.emit[k + 2];
                if (t.hasClouds) {
                    let cu = Math.floor(lu + cu0) % TEX_W;
                    if (cu < 0) cu += TEX_W;
                    let cj = (m.row[p] + cu) * 4, ca = t.clouds[cj + 3] / 255;
                    if (ca > 0) {
                        let cs = shade * 1.05;
                        r += (t.clouds[cj] * cs - r) * ca; g += (t.clouds[cj + 1] * cs - g) * ca; b += (t.clouds[cj + 2] * cs - b) * ca;
                    }
                }
                // Brume de l'atmosphÃ¨re sur le bord et teinte gÃ©nÃ©rale
                let haze = Math.min(1, m.limb[p] * (a.size * 4) + a.tint) * (shade * .7 + .3);
                r += (ac[0] - r) * haze; g += (ac[1] - g) * haze; b += (ac[2] - b) * haze;
                if (prevTex && Math.abs(px - sweepX) < 2.5 * dpr) {
                    r = r * .3 + 79 * .7 + 60; g = g * .3 + 216 * .7 + 30; b = b * .3 + 224 * .7 + 30;
                }
                let o = m.idx[p] * 4;
                data[o] = r; data[o + 1] = g; data[o + 2] = b;
                // Bord adouci sur un pixel
                let dx = px + .5 - half, dy = Math.floor(m.idx[p] / m.w) + .5 - half;
                data[o + 3] = Math.min(255, (m.r - Math.hypot(dx, dy)) * 255 + 128);
            }
            sctx.putImageData(m.img, 0, 0);
        }

        function drawRing(r, front) {
            let vT = tier(s.civ, TABS.civ);
            if (!shown.has('ff') || (vT !== 0 && vT !== 3))
                return;
            let color = vT === 0 ? '255,92,60' : '140,230,255';
            let c = size / 2;
            ctx.save();
            ctx.translate(c, c);
            ctx.rotate(-.32);
            ctx.lineWidth = 1.6 * dpr;
            ctx.strokeStyle = 'rgba(' + color + ',' + (front ? .75 : .3) + ')';
            ctx.beginPath();
            ctx.ellipse(0, 0, r * 1.55, r * .3, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2);
            ctx.stroke();
            // Stations en orbite
            for (let i = 0; i < 5; i++) {
                let ang = rot * .6 + i * 1.2566;
                let inFront = Math.sin(ang) > 0;
                if (inFront !== front)
                    continue;
                ctx.fillStyle = 'rgba(' + color + ',' + (front ? 1 : .45) + ')';
                ctx.beginPath();
                ctx.arc(Math.cos(ang) * r * 1.55, Math.sin(ang) * r * .3, 2.2 * dpr, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }

        function frame(now) {
            let k = sweepStart ? clamp01((now - sweepStart) / SWEEP_MS) : 1;
            let sc = fromScale + (scale - fromScale) * smooth(0, 1, k);
            let r = baseR * sc;
            if (!map || Math.abs(map.r - r) > .25)
                buildMap(r);
            rot += .0021 * rotSpeed;
            cloudRot += .0029 * rotSpeed + .0006;
            let sweepX = prevTex ? -2 + k * (map.w + 4) : -1;
            drawSphere(sweepX);
            if (k >= 1 && prevTex) {
                prevTex = null;
                sweepStart = 0;
            }

            ctx.clearRect(0, 0, size, size);
            let c = size / 2, a = atmos();
            drawRing(r, false);
            let glow = ctx.createRadialGradient(c, c, r * .92, c, c, r * (1.02 + a.size * 1.6));
            let ac = hex(a.color).join(',');
            glow.addColorStop(0, 'rgba(' + ac + ',.55)');
            glow.addColorStop(.35, 'rgba(' + ac + ',.22)');
            glow.addColorStop(1, 'rgba(' + ac + ',0)');
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(c, c, r * (1.02 + a.size * 1.6), 0, Math.PI * 2);
            ctx.fill();
            ctx.drawImage(sphere, c - map.w / 2, c - map.w / 2);
            drawRing(r, true);
        }

        let last = 0;
        function loop(now) {
            // 30 images par seconde suffisent pour une rotation lente
            if (now - last > 32) {
                last = now;
                frame(now);
            }
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);

        function reveal(keys) {
            keys = (Array.isArray(keys) ? keys : [keys]).filter(k => LAYERS.includes(k) && !shown.has(k));
            if (!keys.length)
                return;
            prevTex = tex;
            keys.forEach(k => shown.add(k));
            tex = paint(fields, s, shown);
            fromScale = baseR ? (map ? map.r / baseR : scale) : scale;
            scale = radiusScale(s, shown);
            rotSpeed = spin();
            sweepStart = performance.now();
        }

        return {reveal, revealAll: () => reveal(LAYERS)};
    }

    window.PlanetView = {create, LAYERS};

    // Branchement automatique : <canvas data-planet-view> + window.PLANET_DATA
    document.addEventListener('DOMContentLoaded', () => {
        let canvas = document.querySelector('canvas[data-planet-view]');
        if (!canvas || !window.PLANET_DATA)
            return;
        let view = create(canvas, {
            modules: PLANET_DATA.modules,
            seed: PLANET_DATA.id,
            revealed: canvas.dataset.planetView === 'all' ? 'all' : []
        });
        window.planetView = view;
        document.addEventListener('planet-reveal', (e) => view.reveal(e.detail));
        document.addEventListener('planet-reveal-all', () => view.revealAll());
    });
})();
