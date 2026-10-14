// Planète dessinée par le code à partir de ses stats et d'une graine (l'id de
// la carte) : chaque planète est unique et toujours la même d'une page à l'autre.
// Les couches n'apparaissent qu'une fois la stat scannée, pour ne rien dévoiler :
//   wtr → mers, lacs gelés ou liquide inconnu    res → couleurs de la roche
//   cli → calottes, lave, monde figé, nuages     oxy → couleur de l'atmosphère
//   grv → taille de la planète                    ff  → végétation, lumières des villes
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
    const REACH_MS = 380;      // le trait s'allonge jusqu'à la planète
    const RIPPLE_MS = 1300;    // l'onde traverse la planète
    const LIGHT = norm([-0.62, 0.42, 0.66]);

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

    // Bruit de Perlin 3D avec une table de permutation tirée de la graine
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

    // Champs de bruit calculés une fois : relief, humidité, détail, crêtes,
    // villes, nuages. Les couleurs sont recalculées à chaque scan
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
                // Relief déformé par un second bruit, pour des continents moins ronds
                let wx = fbm(x * 1.2 + off[5][0], y * 1.2 + off[5][1], z * 1.2 + off[5][2], 3);
                f.elev[i] = fbm(x * 1.7 + off[0][0] + wx, y * 1.7 + off[0][1] + wx, z * 1.7 + off[0][2], 4);
                f.moist[i] = fbm(x * 2.4 + off[1][0], y * 2.4 + off[1][1], z * 2.4 + off[1][2], 4);
                f.detail[i] = fbm(x * 9 + off[2][0], y * 9 + off[2][1], z * 9 + off[2][2], 3);
                f.ridge[i] = 1 - Math.abs(fbm(x * 3.2 + off[3][0], y * 3.2 + off[3][1], z * 3.2 + off[3][2], 4)) * 2.2;
                f.city[i] = fbm(x * 16 + off[4][0], y * 16 + off[4][1], z * 16 + off[4][2], 3);
                // Nuages étirés en longitude, comme des bandes de vent. Relief et
                // nuages sont ensuite remis à plat (rang de 0 à 1) pour régler la
                // part de liquide et de ciel couvert au pourcentage près
                f.cloud[i] = fbm(x * 2 + wx, y * 3.4, z * 2 + wx, 3);
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

    // Style cartoon, comme l'ancien disque : aplats de 2-3 tons par surface,
    // ombre en croissant à 15 %, cratères plats, atmosphère en anneau
    const RES_PALETTE = [
        ['#b7ad9e', '#9c9283', '#d3cabb'],
        ['#c0623e', '#a24e2f', '#de8a5c'],
        ['#b08655', '#94703f', '#cfa772'],
        ['#8f7a63', '#76634f', '#b39e85'],
        ['#b5783f', '#8d5aa0', '#e0b25a']
    ];
    const UNKNOWN_ROCK = ['#8d8fa3', '#7b7d92', '#a2a4b6'];
    const ATMOS = [
        {color: '#f0cd6a', size: .16},
        {color: '#8fe0a8', size: .11},
        {color: '#cfe0ee', size: .05},
        {color: '#c9adff', size: .08},
        {color: '#7cc0ff', size: .09},
        {color: '#5fe6ff', size: .12}
    ];
    const UNKNOWN_ATMOS = null;
    const LIQUID_COVER = [0.34, 0.16, 0.10, 0.22, 0.50, 0.72];
    const SHADOW = 0.85;

    // Cratères tirés de la graine : centre sur la sphère et rayon angulaire
    function makeCraters(seed) {
        let rng = mulberry32(seed ^ 0x5bd1e995);
        let list = [];
        for (let i = 0; i < 14; i++) {
            let z = rng() * 2 - 1, a = rng() * Math.PI * 2, s = Math.sqrt(1 - z * z);
            list.push({x: s * Math.cos(a), y: z * .85, z: s * Math.sin(a), r: .06 + rng() * .14});
        }
        return list;
    }

    // Couleurs à plat selon les couches révélées. emit : pixels qui gardent
    // leur couleur dans l'ombre (lave, lumières des villes)
    function paint(f, s, shown) {
        let n = TEX_W * TEX_H;
        let albedo = new Uint8ClampedArray(n * 3);
        let emit = new Uint8ClampedArray(n * 4);
        let clouds = new Uint8ClampedArray(n * 4);

        let wT = tier(s.wtr, TABS.wtr), rT = tier(s.res, TABS.res), cT = tier(s.cli, TABS.cli);
        let fT = tier(s.flo, TABS.flo), vT = tier(s.civ, TABS.civ);
        let hasW = shown.has('wtr'), hasR = shown.has('res'), hasC = shown.has('cli'), hasF = shown.has('ff');
        let sea = hasW ? LIQUID_COVER[wT] : 0;
        let rock = (hasR ? RES_PALETTE[rT] : UNKNOWN_ROCK).map(hex);
        let capLat = !hasC ? 99 : ([99, 99, 66, 74][cT] - (hasW && wT === 1 ? 22 : 0));
        let lockSide = hasC && cT === 1;

        let liquid = !hasW ? null : wT === 0
            ? [hex('#e0952f'), hex('#c4751d')]
            : (wT === 1 ? [hex('#eaf8fc'), hex('#c9eaf3')] : [hex('#46d3d6'), hex('#24a9c6')]);
        let veg = !hasF ? null : [null, [hex('#a43fbf'), hex('#8a2fa3')], [hex('#6fb04a'), hex('#5c9a3c')], [hex('#2f9a3a'), hex('#227826')]][fT];
        let vegThresh = [1, .04, .16, -.08][fT];
        let lights = !hasF ? null : [{c: hex('#ff6a4a'), t: .27}, {c: hex('#ffb35c'), t: .36}, null, {c: hex('#ffd54a'), t: .3}][vT];
        // Cratères : planète encore inconnue, ou sans eau ni végétation
        let craters = (!hasW || wT <= 1) && !(veg && fT >= 2) ? f.craters : [];
        let ice = hex('#f4fbff');
        let basalt = hex('#3b3035');
        let lava = hex('#ff8a1f');

        let cover = hasC ? (lockSide ? .26 : .07 + (hasW ? wT * .026 : .05)) : 0;
        let cloudCol = hasC && cT === 0 ? hex('#d6cc98') : (shown.has('oxy') && tier(s.oxy, TABS.oxy) === 1 ? hex('#d3e8b0') : hex('#ffffff'));

        for (let i = 0; i < n; i++) {
            // Léger bruit sur les seuils : contours irréguliers mais aplats nets
            let e = f.elev[i] + f.detail[i] * .025, m = f.moist[i];
            let x = f.px[i], y = f.py[i], z = f.pz[i];
            let latDeg = Math.abs(f.lat[i]) * 57.3 + f.detail[i] * 9;
            let k = i * 3, j = i * 4;
            let c;

            if (liquid && e < sea) {
                c = wT === 1 ? (sea - e < .05 ? liquid[1] : liquid[0]) : (sea - e < .05 ? liquid[0] : liquid[1]);
            }
            else {
                let land = (e - sea) / (1 - sea + 1e-6);
                c = land > .9 ? rock[2] : (land > .55 ? rock[1] : rock[0]);
                if (hasR && rT === 3 && f.detail[i] > .36)
                    c = m > 0 ? hex('#78e6ff') : hex('#c58cff');
                if (hasC && cT === 0) {
                    c = basalt;
                    if (f.ridge[i] > .9) {
                        emit[j] = lava[0]; emit[j + 1] = lava[1]; emit[j + 2] = lava[2]; emit[j + 3] = 255;
                    }
                }
                if (veg && fT > 0 && land < .9 && m > vegThresh)
                    c = m > vegThresh + .14 ? veg[1] : veg[0];
                if (lights && f.city[i] > lights.t && land < .85) {
                    emit[j] = lights.c[0]; emit[j + 1] = lights.c[1]; emit[j + 2] = lights.c[2]; emit[j + 3] = 255;
                }
            }
            // Cratères : disque plus sombre avec un bord d'ombre, comme .crat1/.crat2
            for (let cr of craters) {
                let d = Math.acos(Math.min(1, x * cr.x + y * cr.y + z * cr.z));
                if (d < cr.r) {
                    let rim = Math.acos(Math.min(1, x * (cr.x - .03) + y * (cr.y + .03) + z * cr.z)) > cr.r * .85;
                    c = mix(c, [0, 0, 0], rim ? .17 : .1);
                }
            }
            if (lockSide) {
                let facing = x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2] + f.detail[i] * .1;
                if (facing > .8)
                    c = hex('#f0d9a5');
                else if (facing < -.15)
                    c = ice;
            }
            if (latDeg > capLat)
                c = ice;

            albedo[k] = c[0]; albedo[k + 1] = c[1]; albedo[k + 2] = c[2];

            if (cover) {
                let cv = f.cloud[i];
                if (lockSide)
                    cv *= 1.25 - Math.abs(x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]);
                let a = cv > 1 - cover ? 245 : 0;
                clouds[j] = cloudCol[0]; clouds[j + 1] = cloudCol[1]; clouds[j + 2] = cloudCol[2]; clouds[j + 3] = a;
            }
        }
        return {albedo, emit, clouds, hasClouds: cover > 0};
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
        // Monde figé (face toujours tournée vers son étoile) : il ne tourne pas
        let spin = () => (shown.has('cli') && tier(s.cli, TABS.cli) === 1) ? 0 : 1;

        let fields = buildFields(seed);
        fields.craters = makeCraters(seed);
        let tex = paint(fields, s, shown), prevTex = null;
        let scale = radiusScale(s, shown), fromScale = scale;
        let rippleStart = 0, rippleScan = null, scans = [];
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

        // Projection de la sphère : pour chaque pixel du disque, sa longitude
        // de base, sa position verticale dans la texture et s'il est dans le
        // croissant d'ombre (recalculés si la taille change)
        let map = null;
        function buildMap(r) {
            let R = Math.ceil(r);
            let w = R * 2;
            sphere.width = sphere.height = w;
            let idx = [], lonF = [], rowF = [], shade = [], edge = [];
            for (let y = 0; y < w; y++) {
                for (let x = 0; x < w; x++) {
                    let nx = (x + .5 - R) / r, ny = -(y + .5 - R) / r;
                    let q = nx * nx + ny * ny;
                    if (q > 1)
                        continue;
                    let nz = Math.sqrt(1 - q);
                    idx.push(y * w + x);
                    lonF.push(Math.atan2(nx, nz) / (Math.PI * 2) * TEX_W);
                    rowF.push(Math.min(TEX_H - 1.001, Math.max(0, (.5 - Math.asin(ny) / Math.PI) * TEX_H - .5)));
                    // Ombre en croissant en bas à droite, comme box-shadow: inset -9px -7px
                    let sx = nx + .11, sy = ny - .085;
                    shade.push(sx * sx + sy * sy > 1 ? SHADOW : 1);
                    edge.push(Math.min(1, (1 - Math.sqrt(q)) * r + .5));
                }
            }
            map = {
                r, w, count: idx.length, idx: Int32Array.from(idx), lonF: Float32Array.from(lonF),
                rowF: Float32Array.from(rowF), shade: Float32Array.from(shade), edge: Float32Array.from(edge),
                img: sctx.createImageData(w, w)
            };
        }

        function atmos() {
            return shown.has('oxy') ? ATMOS[tier(s.oxy, TABS.oxy)] : UNKNOWN_ATMOS;
        }

        // ripple : {x, y, radius} en pixels de la sphère pendant un scan, sinon null
        function drawSphere(ripple) {
            let m = map, data = m.img.data;
            data.fill(0);
            let u0 = rot / (Math.PI * 2) * TEX_W, cu0 = cloudRot / (Math.PI * 2) * TEX_W;
            let band = 3 * dpr;
            for (let p = 0; p < m.count; p++) {
                let px = m.idx[p] % m.w;
                // Pendant un scan : la nouvelle couche à l'intérieur de l'onde, l'ancienne au-delà
                let dist = ripple ? Math.hypot(px - ripple.x, Math.floor(m.idx[p] / m.w) - ripple.y) : 0;
                let t = (ripple && dist > ripple.radius) ? prevTex : tex;
                // Lecture interpolée entre 4 texels : bords d'aplats nets mais lisses
                let fu = m.lonF[p] + u0 - .5, fv = m.rowF[p];
                let u = Math.floor(fu), v = Math.floor(fv), du = fu - u, dv = fv - v;
                u = ((u % TEX_W) + TEX_W) % TEX_W;
                let u2 = u + 1 === TEX_W ? 0 : u + 1;
                let a0 = (v * TEX_W + u) * 3, a1 = (v * TEX_W + u2) * 3, a2 = a0 + TEX_W * 3, a3 = a1 + TEX_W * 3;
                let w0 = (1 - du) * (1 - dv), w1 = du * (1 - dv), w2 = (1 - du) * dv, w3 = du * dv;
                let A = t.albedo;
                let sh = m.shade[p];
                let r = (A[a0] * w0 + A[a1] * w1 + A[a2] * w2 + A[a3] * w3) * sh;
                let g = (A[a0 + 1] * w0 + A[a1 + 1] * w1 + A[a2 + 1] * w2 + A[a3 + 1] * w3) * sh;
                let b = (A[a0 + 2] * w0 + A[a1 + 2] * w1 + A[a2 + 2] * w2 + A[a3 + 2] * w3) * sh;
                let ej = (Math.round(fv) * TEX_W + (Math.round(fu) % TEX_W + TEX_W) % TEX_W) * 4;
                if (t.emit[ej + 3]) {
                    r = t.emit[ej]; g = t.emit[ej + 1]; b = t.emit[ej + 2];
                }
                if (t.hasClouds) {
                    let cu = Math.floor(m.lonF[p] + cu0 - .5);
                    let cdu = m.lonF[p] + cu0 - .5 - cu;
                    cu = ((cu % TEX_W) + TEX_W) % TEX_W;
                    let cu2 = cu + 1 === TEX_W ? 0 : cu + 1;
                    let C = t.clouds;
                    let c0 = (v * TEX_W + cu) * 4, c1 = (v * TEX_W + cu2) * 4, c2 = c0 + TEX_W * 4, c3 = c1 + TEX_W * 4;
                    let ca = (C[c0 + 3] * (1 - cdu) * (1 - dv) + C[c1 + 3] * cdu * (1 - dv) + C[c2 + 3] * (1 - cdu) * dv + C[c3 + 3] * cdu * dv) / 255;
                    if (ca > 0) {
                        // Seuil sur la valeur interpolée : nuage plein à bord net
                        ca = clamp01((ca - .35) * 4) * .96;
                        r += (C[c0] * sh - r) * ca; g += (C[c0 + 1] * sh - g) * ca; b += (C[c0 + 2] * sh - b) * ca;
                    }
                }
                if (ripple) {
                    // Front de l'onde en cyan, suivi d'un reflet qui s'estompe
                    let gap = ripple.radius - dist;
                    if (Math.abs(gap) < band) {
                        r = 140; g = 240; b = 244;
                    }
                    else if (gap > 0 && gap < band * 6) {
                        let f = (1 - gap / (band * 6)) * .45;
                        r += (140 - r) * f; g += (240 - g) * f; b += (244 - b) * f;
                    }
                }
                let o = m.idx[p] * 4;
                data[o] = r; data[o + 1] = g; data[o + 2] = b;
                data[o + 3] = m.edge[p] * 255;
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
            ctx.lineWidth = 2.5 * dpr;
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

        // Traits de scan : le segment diagonal (…-line2) part dans son angle
        // d'origine et s'arrête au bord de la planète, où se pose le point
        // (…-linedot). Coordonnées de la page ; la planète peut changer de taille
        function lineGeometry(line) {
            let parent = line.offsetParent;
            if (!parent)
                return null;
            let pr = parent.getBoundingClientRect();
            let cs = getComputedStyle(line);
            let ang = 0;
            let m = /matrix\(([^)]+)\)/.exec(cs.transform || '');
            if (m) {
                let [a, b] = m[1].split(',').map(Number);
                ang += Math.atan2(b, a);
            }
            if (cs.rotate && cs.rotate !== 'none')
                ang += parseFloat(cs.rotate) * Math.PI / 180;
            return {
                x: pr.left + parent.clientLeft + line.offsetLeft,
                y: pr.top + parent.clientTop + line.offsetTop + line.offsetHeight / 2,
                dx: Math.cos(ang), dy: Math.sin(ang)
            };
        }

        // Longueur du segment pour toucher le bord de la planète, et point d'arrivée
        function scanReach(scan) {
            let g = lineGeometry(scan.line);
            let cr = canvas.getBoundingClientRect();
            if (!g || !cr.width || !map)
                return null;
            let cx = cr.left + cr.width / 2, cy = cr.top + cr.height / 2;
            let R = map.r * cr.width / size;
            let vx = cx - g.x, vy = cy - g.y;
            let proj = vx * g.dx + vy * g.dy;
            let miss = vx * vx + vy * vy - proj * proj;
            let len = Math.max(0, miss < R * R ? proj - Math.sqrt(R * R - miss) : proj);
            return {len, x: g.x + g.dx * len, y: g.y + g.dy * len, cr};
        }

        function placeScan(scan) {
            let reach = scanReach(scan);
            if (!reach)
                return null;
            scan.line.style.width = reach.len + 'px';
            let dp = scan.dot.offsetParent;
            if (dp) {
                let pr = dp.getBoundingClientRect();
                scan.dot.style.left = (reach.x - pr.left - dp.clientLeft - scan.dot.offsetWidth / 2) + 'px';
                scan.dot.style.top = (reach.y - pr.top - dp.clientTop - scan.dot.offsetHeight / 2) + 'px';
            }
            return reach;
        }

        function frame(now) {
            let k = rippleStart ? clamp01((now - rippleStart) / RIPPLE_MS) : 1;
            let sc = fromScale + (scale - fromScale) * smooth(0, 1, k);
            let r = baseR * sc;
            if (!map || Math.abs(map.r - r) > .25) {
                buildMap(r);
                // Les traits déjà posés suivent le bord quand la planète change de taille
                scans.forEach(placeScan);
            }
            rot += .0021 * rotSpeed;
            cloudRot += .0029 * rotSpeed + .0006;
            let c = size / 2;
            let ripple = null;
            if (prevTex) {
                // Onde partie du point de contact, assez grande pour couvrir tout le disque
                let o = rippleOrigin();
                let reach = Math.hypot(o.x - c, o.y - c) + r + 6 * dpr;
                let off = c - map.w / 2;
                ripple = {x: o.x - off, y: o.y - off, radius: (1 - Math.pow(1 - k, 2.2)) * reach};
            }
            drawSphere(ripple);
            if (k >= 1 && prevTex) {
                prevTex = null;
                rippleStart = 0;
            }

            ctx.clearRect(0, 0, size, size);
            let a = atmos();
            drawRing(r, false);
            // Atmosphère : anneau plat de la couleur du gaz, plus épais si elle est dense
            if (a) {
                let ac = hex(a.color).join(',');
                ctx.fillStyle = 'rgba(' + ac + ',.5)';
                ctx.beginPath();
                ctx.arc(c, c, r * (1 + a.size * .9), 0, Math.PI * 2);
                ctx.fill();
            }
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

        // L'onde part du point d'arrivée du dernier trait, ou du centre
        function rippleOrigin() {
            let reach = rippleScan && scanReach(rippleScan);
            if (!reach)
                return {x: size / 2, y: size / 2};
            return {x: (reach.x - reach.cr.left) * size / reach.cr.width, y: (reach.y - reach.cr.top) * size / reach.cr.height};
        }

        const wait = (ms) => new Promise(res => setTimeout(res, ms));

        // Le code prend la main sur le segment vers la planète et sur le point :
        // le premier segment (depuis le libellé) garde son animation CSS
        function holdScanLine(scan) {
            for (let el of [scan.line, scan.dot]) {
                el.style.animation = 'none';
                el.style.filter = 'none';
            }
            scan.line.style.width = '0px';
            scan.dot.style.transform = 'scale(0)';
        }

        async function drawScanLine(scan) {
            let {line, dot, first} = scan;
            // Attente de la fin du premier segment (30 % de son animation)
            let d = parseFloat(first ? getComputedStyle(first).animationDuration : '') || 1;
            await wait(d * 300);
            let reach = scanReach(scan);
            if (!reach)
                return;
            let grow = line.animate([{width: '0px'}, {width: reach.len + 'px'}], {duration: REACH_MS, easing: 'ease-out'});
            await grow.finished.catch(() => {});
            scans.push(scan);
            placeScan(scan);
            dot.style.transform = '';
            dot.animate([{transform: 'scale(0)'}, {transform: 'scale(1.5)'}, {transform: 'scale(1)'}], {duration: 260, easing: 'ease-out'});
            await wait(200);
        }

        // Les scans sont joués l'un après l'autre : trait jusqu'à la planète, puis onde
        let queue = [], busy = false;
        async function runQueue() {
            if (busy)
                return;
            busy = true;
            while (queue.length) {
                let job = queue.shift();
                if (job.scan)
                    await drawScanLine(job.scan);
                let keys = job.keys.filter(k => !shown.has(k));
                if (!keys.length)
                    continue;
                prevTex = tex;
                keys.forEach(k => shown.add(k));
                tex = paint(fields, s, shown);
                fromScale = map ? map.r / baseR : scale;
                scale = radiusScale(s, shown);
                rotSpeed = spin();
                rippleScan = job.scan && scans.includes(job.scan) ? job.scan : null;
                rippleStart = performance.now();
                await wait(RIPPLE_MS + 40);
            }
            busy = false;
        }

        // scan : {first, line, dot} éléments du trait de ce scan (template-planet.ejs)
        function reveal(keys, scan) {
            keys = (Array.isArray(keys) ? keys : [keys]).filter(k => LAYERS.includes(k) && !shown.has(k));
            if (!keys.length)
                return;
            scan = scan && scan.line && scan.dot ? scan : null;
            // Figé tout de suite, même si un scan précédent est encore en cours
            if (scan)
                holdScanLine(scan);
            queue.push({keys, scan});
            runQueue();
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
        // Préfixe des éléments du trait de chaque scan (template-planet.ejs)
        const LINES = {oxy: 'o2', ff: 'ff', cli: 'cl', wtr: 'eau', res: 're', grv: 'gr'};
        document.addEventListener('planet-reveal', (e) => {
            let k = LINES[e.detail], q = (sel) => k && document.querySelector('.' + k + sel);
            view.reveal(e.detail, {first: q('-line'), line: q('-line2'), dot: q('-linedot')});
        });
        document.addEventListener('planet-reveal-all', () => view.revealAll());
    });
})();
