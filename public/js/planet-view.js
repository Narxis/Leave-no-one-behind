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
                let wx = fbm(x * 1.2 + off[5][0], y * 1.2 + off[5][1], z * 1.2 + off[5][2], 1) * .6;
                f.elev[i] = fbm(x * 1.25 + off[0][0] + wx, y * 1.25 + off[0][1] + wx, z * 1.25 + off[0][2], 2);
                f.moist[i] = fbm(x * 1.6 + off[1][0], y * 1.6 + off[1][1], z * 1.6 + off[1][2], 2);
                f.detail[i] = fbm(x * 4 + off[2][0], y * 4 + off[2][1], z * 4 + off[2][2], 1);
                f.ridge[i] = 1 - Math.abs(fbm(x * 2 + off[3][0], y * 2 + off[3][1], z * 2 + off[3][2], 2)) * 2.2;
                // Voile nuageux, étiré en longitude comme des bandes de vent
                f.cloud[i] = fbm(x * 1.6 + wx, y * 2.6, z * 1.6 + wx, 2);
                f.city[i] = fbm(x * 10 + off[4][0], y * 10 + off[4][1], z * 10 + off[4][2], 1);
            }
        }
        // Relief remis à plat (rang de 0 à 1) : la part de liquide est réglée au pourcentage près
        f.elev = toRank(f.elev);
        f.cloud = toRank(f.cloud);
        // Humidité aussi : la part de terres couverte de végétation est réglée au pourcentage près
        f.moist = toRank(f.moist);
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
    // Roche aux tons naturels (gris, bruns, ocre) : les minerais sont
    // montrés par les montagnes et les scintillements, pas par la couleur
    const RES_PALETTE = [
        ['#9a9286', '#857e73'],
        ['#a07a62', '#8a6852'],
        ['#a08c72', '#8a7860'],
        ['#958775', '#807364'],
        ['#a39073', '#8c7b61']
    ];
    const UNKNOWN_ROCK = ['#8d8fa3', '#7b7d92', '#a2a4b6'];
    // Couleur du gaz par palier d'oxygène ; dense = halo plus épais
    const ATMOS = [
        {color: '#f0cd6a', dense: .06},
        {color: '#8fe0a8', dense: .02},
        {color: '#9fd4ff', dense: 0},
        {color: '#c9adff', dense: 0},
        {color: '#7cc0ff', dense: 0},
        {color: '#5fe6ff', dense: .02}
    ];
    const UNKNOWN_ATMOS = null;
    const LIQUID_COVER = [0.34, 0.16, 0.10, 0.22, 0.50, 0.72];
    // Part des terres couverte de végétation, par palier de flore
    const VEG_COVER = [0, .45, .65, .85];
    const SHADOW = 0.85;
    const VEIL_ALPHA = .45;    // voile nuageux translucide : on voit le sol à travers
    // Formes reprises des anciennes illustrations SVG (template-planet.ejs)
    const MOUNTAIN_PATH = typeof Path2D !== 'undefined' ? new Path2D('M20.79,166.85H169.34a20.77,20.77,0,0,0,17.76-31.56L109,6.68a13.89,13.89,0,0,0-23.57-.27L3.28,134.87a20.78,20.78,0,0,0,17.51,32Z') : null;
    const TREE_PATH = typeof Path2D !== 'undefined' ? new Path2D('M210.6 5.9L62 169.4c-3.9 4.2-6 9.8-6 15.5C56 197.7 66.3 208 79.1 208H104L30.6 281.4c-4.2 4.2-6.6 10-6.6 16C24 309.9 34.1 320 46.6 320H80L5.4 409.5C1.9 413.7 0 419 0 424.5c0 13 10.5 23.5 23.5 23.5H192v32c0 17.7 14.3 32 32 32s32-14.3 32-32V448H424.5c13 0 23.5-10.5 23.5-23.5c0-5.5-1.9-10.8-5.4-15L368 320h33.4c12.5 0 22.6-10.1 22.6-22.6c0-6-2.4-11.8-6.6-16L344 208h24.9c12.7 0 23.1-10.3 23.1-23.1c0-5.7-2.1-11.3-6-15.5L237.4 5.9C234 2.1 229.1 0 224 0s-10 2.1-13.4 5.9z') : null;
    const CLOUD_PATH = typeof Path2D !== 'undefined' ? new Path2D('M0 336c0 79.5 64.5 144 144 144H512c70.7 0 128-57.3 128-128c0-61.9-44-113.6-102.4-125.4c4.1-10.7 6.4-22.4 6.4-34.6c0-53-43-96-96-96c-19.7 0-38.1 6-53.3 16.2C367 64.2 315.3 32 256 32C167.6 32 96 103.6 96 192c0 2.7 .1 5.4 .2 8.1C40.2 219.8 0 273.2 0 336z') : null;
    const STAR_PATH = typeof Path2D !== 'undefined' ? new Path2D('M512 255.1c0 11.34-7.406 20.86-18.44 23.64l-171.3 42.78l-42.78 171.1C276.7 504.6 267.2 512 255.9 512s-20.84-7.406-23.62-18.44l-42.66-171.2L18.47 279.6C7.406 276.8 0 267.3 0 255.1c0-11.34 7.406-20.83 18.44-23.61l171.2-42.78l42.78-171.1C235.2 7.406 244.7 0 256 0s20.84 7.406 23.62 18.44l42.78 171.2l171.2 42.78C504.6 235.2 512 244.6 512 255.1z') : null;

    // Cratères tirés de la graine : centre sur la sphère et rayon angulaire
    function makeCraters(seed) {
        let rng = mulberry32(seed ^ 0x5bd1e995);
        let list = [];
        for (let i = 0; i < 4; i++) {
            let z = rng() * 2 - 1, a = rng() * Math.PI * 2, s = Math.sqrt(1 - z * z);
            let c = norm([s * Math.cos(a), z * .85, s * Math.sin(a)]);
            list.push({x: c[0], y: c[1], z: c[2], r: .1 + rng() * .2});
        }
        return list;
    }

    // Couleurs à plat selon les couches révélées. emit : pixels qui gardent
    // leur couleur dans l'ombre (lave, lumières des villes). clouds : voile
    // nuageux translucide, en plus des nuages flottants (drawSprites)
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

        // [bord, large] : liquide inconnu, lacs gelés, eau
        let liquid = !hasW ? null : wT === 0
            ? [hex('#a8762f'), hex('#5e3c14')]
            : (wT === 1 ? [hex('#eaf8fc'), hex('#bfe2f0')] : [hex('#46d3d6'), hex('#1b7fa6')]);
        // Monde volcanique : la planète est découpée en zones qui ne se
        // superposent pas (lave dans les régions sèches, plantes dans les
        // humides), avec moins de végétation, ternie par la roche sombre
        let harsh = hasC && cT === 0;
        let veg = !hasF ? null : [null, [hex('#a43fbf'), hex('#8a2fa3')], [hex('#6fb04a'), hex('#5c9a3c')], [hex('#2f9a3a'), hex('#227826')]][fT];
        let vegThresh = 1 - VEG_COVER[fT] * (harsh ? .5 : 1);
        let lights = !hasF ? null : [{c: hex('#ff6a4a'), t: .27}, {c: hex('#ffb35c'), t: .36}, null, {c: hex('#ffd54a'), t: .3}][vT];
        // Cratères : planète encore inconnue, ou sans eau ni végétation
        let craters = (!hasW || wT <= 1) && !(veg && fT >= 2) ? f.craters : [];
        let ice = hex('#f4fbff');
        let basalt = hex('#3b3035');
        let lava = hex('#ff8a1f');
        let vegCol = veg && (harsh ? mix(veg[1], basalt, .35) : veg[1]);
        const LAVA_DRY = .4;    // la lave ne coule que dans les 40 % les plus secs

        // Part du ciel voilée : plus d'eau, plus de voile ; dense avec les tempêtes
        let cover = hasC ? (cT === 1 ? .22 : .07 + (hasW ? wT * .026 : .05)) : 0;
        let cloudCol = hasC && cT === 0 ? hex('#9a918c') : (cT === 1 ? hex('#c9ccd4') : hex('#ffffff'));

        for (let i = 0; i < n; i++) {
            // Léger bruit sur les seuils : contours irréguliers mais aplats nets
            let e = f.elev[i], m = f.moist[i];
            let x = f.px[i], y = f.py[i], z = f.pz[i];
            let latDeg = Math.abs(f.lat[i]) * 57.3;
            let k = i * 3, j = i * 4;
            let c;

            if (liquid && e < sea) {
                // Bord translucide (on devine le sol), puis de plus en plus sombre vers le large
                let depth = (sea - e) / sea;
                c = mix(liquid[0], liquid[1], smooth(.06, .7, depth));
                if (depth < .07)
                    c = mix(rock[0], c, .45 + depth / .07 * .35);
            }
            else {
                let land = (e - sea) / (1 - sea + 1e-6);
                // Planète inconnue : un seul aplat, comme l'ancien disque
                c = hasR && land > .62 ? rock[1] : rock[0];
                let lavaZone = harsh && m < LAVA_DRY;
                if (harsh) {
                    c = basalt;
                    // Les veines s'amincissent puis s'éteignent en approchant des régions humides
                    if (lavaZone && f.ridge[i] > .88 + .1 * m / LAVA_DRY) {
                        emit[j] = lava[0]; emit[j + 1] = lava[1]; emit[j + 2] = lava[2]; emit[j + 3] = 255;
                    }
                }
                if (veg && fT > 0 && land < .95 && m > vegThresh)
                    c = vegCol;
                // Pas de villes dans les champs de lave : on ne confond pas leurs lumières
                if (lights && !lavaZone && f.city[i] > lights.t && land < .85) {
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
            if (latDeg > capLat)
                c = ice;

            albedo[k] = c[0]; albedo[k + 1] = c[1]; albedo[k + 2] = c[2];

            if (cover && f.cloud[i] > 1 - cover) {
                clouds[j] = cloudCol[0]; clouds[j + 1] = cloudCol[1]; clouds[j + 2] = cloudCol[2]; clouds[j + 3] = 245;
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
        let spin = () => 1;

        let fields = buildFields(seed);
        fields.craters = makeCraters(seed);
        let tex = paint(fields, s, shown), prevTex = null;
        let scale = radiusScale(s, shown), fromScale = scale;
        let rippleStart = 0, rippleScan = null, scans = [];
        let rot = (seed % 628) / 100, cloudRot = rot;
        // Vents propres à chaque planète (tirés de la graine) : les nuages
        // tournent entre 0,75 et 1,6 fois la vitesse du sol, plus une dérive
        // dans un sens ou l'autre, qui les fait bouger même sur un monde figé
        let windRng = mulberry32(seed ^ 0x9e3779b9);
        let cloudFactor = .75 + windRng() * .85;
        let cloudDrift = (windRng() < .5 ? -1 : 1) * (.0003 + windRng() * .0007);
        let rotSpeed = spin();

        let cssSize = options.size || canvas.clientWidth || 340;
        let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        let size = Math.round(cssSize * dpr);
        canvas.width = canvas.height = size;
        let ctx = canvas.getContext('2d');
        let sphere = document.createElement('canvas');
        let sctx = sphere.getContext('2d');
        // Rayon de base de la planète (px CSS) ; le canvas est plus grand pour
        // laisser la place à l'atmosphère, aux montagnes et à l'anneau orbital
        let baseR = (options.radius || cssSize * .3) * dpr;

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
                        // Seuil sur la valeur interpolée : bord net, puis translucide
                        ca = clamp01((ca - .35) * 4) * VEIL_ALPHA;
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

        // Montagnes, arbres et scintillements, comme les anciennes illustrations
        // (mêmes formes SVG) : posés sur la surface, ils tournent avec la planète
        // et se dressent vers l'extérieur ; vus de face ils sont raccourcis, au
        // bord ils dépassent en silhouette
        let sprites = [];
        let revealing = new Set();
        function buildSprites() {
            let rng = mulberry32(seed ^ 0x2545f491);
            let wT = tier(s.wtr, TABS.wtr), rT = tier(s.res, TABS.res), fT = tier(s.flo, TABS.flo);
            // Emplacements réels (eau comprise), pour qu'ils ne bougent pas aux scans suivants
            let sea = LIQUID_COVER[wT];
            let n = TEX_W * TEX_H;
            let pick = (test) => {
                for (let tries = 0; tries < 4000; tries++) {
                    let i = Math.floor(rng() * n);
                    if (Math.abs(fields.lat[i]) < 1.2 && test(i))
                        return {lat: fields.lat[i], lon: ((i % TEX_W) + .5) / TEX_W * Math.PI * 2};
                }
                return null;
            };
            let land = (i) => fields.elev[i] >= sea;
            let high = (i) => land(i) && (fields.elev[i] - sea) / (1 - sea + 1e-6) > .45;
            let list = [];
            let rock = hex((RES_PALETTE[rT] || RES_PALETTE[0])[1]);
            if (shown.has('res')) {
                for (let k = 0, count = 6 + rT; k < count; k++) {
                    let at = pick(high);
                    if (at)
                        list.push(Object.assign(at, {layer: 'res', type: 'mountain', h: .18 + rng() * .13, color: mix(rock, [0, 0, 0], .25 + rng() * .15)}));
                }
                for (let k = 0, count = [1, 3, 4, 6, 9][rT]; k < count; k++) {
                    let at = pick(land);
                    if (at)
                        list.push(Object.assign(at, {layer: 'res', type: 'star', h: .11 + rng() * .07, phase: rng() * 6.28,
                            color: rT === 3 && k % 2 ? [120, 230, 255] : [255, 158, 0]}));
                }
            }
            if (shown.has('ff') && fT > 0) {
                let vegThresh = 1 - VEG_COVER[fT];
                let base = hex([null, '#8a2fa3', '#5c9a3c', '#227826'][fT]);
                // Petites forêts : des bosquets d'arbres serrés, plus grands au centre
                // qu'en bordure, avec une teinte propre à chaque bosquet à peine variée
                for (let k = 0, count = [0, 9, 13, 18][fT]; k < count; k++) {
                    let at = pick((i) => land(i) && fields.moist[i] > vegThresh);
                    if (!at)
                        continue;
                    let tone = mix(base, [0, 0, 0], .22 + rng() * .25);
                    let spread = .13 + rng() * .08;
                    let tall = .15 + rng() * .06;
                    let trees = [];
                    for (let t = 0, n = 6 + Math.floor(rng() * 6); t < n; t++) {
                        // Le premier arbre est au centre, les autres autour (√ : répartition uniforme sur le disque)
                        let d = t ? Math.sqrt(rng()) : 0, ang = rng() * Math.PI * 2;
                        let lat = at.lat + Math.sin(ang) * d * spread;
                        let lon = at.lon + Math.cos(ang) * d * spread / Math.max(.3, Math.cos(at.lat));
                        trees.push({lat, lon, d, layer: 'ff', type: 'tree',
                            h: tall * (1 - .45 * d) * (.88 + rng() * .24),
                            color: mix(tone, rng() < .5 ? [0, 0, 0] : [255, 255, 255], rng() * .07)});
                    }
                    // Bordure dessinée d'abord : les grands arbres du centre passent devant
                    trees.sort((p, q) => q.d - p.d).forEach(tr => list.push(tr));
                }
            }
            if (shown.has('cli')) {
                // Comme les anciens nuages (.cl-cloud) : ils flottent au-dessus de la
                // surface. Nombre, taille et gris selon le climat, plus avec beaucoup d'eau
                let cT = tier(s.cli, TABS.cli);
                let style = [
                    {count: 7, size: 1, gray: [175, 205], tint: [10, 6, -14]},   // pluies acides : jaunâtres
                    {count: 11, size: 1.3, gray: [125, 175], tint: [0, 0, 0]},   // tempêtes permanentes
                    {count: 6, size: 1, gray: [190, 225], tint: [0, 0, 0]},
                    {count: 4, size: .9, gray: [215, 245], tint: [0, 0, 0]}
                ][cT];
                let count = style.count + Math.round(wT * .6) + Math.floor(rng() * 3);
                for (let k = 0; k < count; k++) {
                    let g = style.gray[0] + rng() * (style.gray[1] - style.gray[0]);
                    list.push({
                        layer: 'cli', type: 'cloud',
                        lat: (rng() * 2 - 1) * 1.1, lon: rng() * Math.PI * 2,
                        alt: 1.1 + rng() * .12, speed: .8 + rng() * .4,
                        h: (.12 + rng() * .16) * style.size,
                        color: [g + style.tint[0], g + style.tint[1], g + style.tint[2]]
                    });
                }
            }
            sprites = list;
        }

        // Position à l'écran (pixels du canvas) et orientation d'un élément
        function spriteScreen(sp, r) {
            let cloud = sp.type === 'cloud';
            let lon = sp.lon - (cloud ? cloudRot * sp.speed : rot), cl = Math.cos(sp.lat);
            let nx = cl * Math.sin(lon), ny = Math.sin(sp.lat), nz = cl * Math.cos(lon);
            let c = size / 2, a = cloud ? sp.alt : 1;
            return {x: c + nx * r * a, y: c - ny * r * a, sx: c + nx * r, sy: c - ny * r, nz,
                angle: Math.atan2(nx, ny), tilt: Math.sqrt(Math.max(0, 1 - nz * nz))};
        }

        function drawSprites(r, front, ripple, now) {
            for (let sp of sprites) {
                let p = spriteScreen(sp, r);
                let back = sp.type === 'cloud' ? -.45 : -.3;
                if (sp.type === 'star' ? (!front || p.nz < .15) : (front ? p.nz < 0 : (p.nz >= 0 || p.nz < back)))
                    continue;
                // Pendant le scan de sa couche : il surgit au passage de l'onde
                let grow = 1;
                if (ripple && revealing.has(sp.layer))
                    grow = clamp01((ripple.radius - Math.hypot(p.x - ripple.x, p.y - ripple.y)) / (14 * dpr));
                if (grow <= 0)
                    continue;
                let h = sp.h * r;
                ctx.save();
                ctx.translate(p.x, p.y);
                if (sp.type === 'star') {
                    // Scintillement : pulsation et rotation, comme .magic-star
                    let tw = .55 + .45 * Math.sin(now / 260 + sp.phase);
                    let sz = h * tw * grow;
                    ctx.rotate(now / 1000 * Math.PI * 2 / 1.6 + sp.phase);
                    ctx.scale(sz / 512, sz / 512);
                    ctx.translate(-256, -256);
                    ctx.globalAlpha = .85;
                    ctx.fillStyle = 'rgb(' + sp.color.join(',') + ')';
                    ctx.fill(STAR_PATH);
                }
                else if (sp.type === 'cloud') {
                    // Nuage plat orienté vers l'extérieur, avec son ombre sur le sol
                    let w = h * 1.25 * grow, hh = h * Math.max(.55, Math.pow(p.tilt, .6)) * grow;
                    if (front) {
                        ctx.save();
                        ctx.translate(p.sx - p.x + 2 * dpr, p.sy - p.y + 2 * dpr);
                        ctx.rotate(p.angle);
                        ctx.scale(w / 640, hh / 512);
                        ctx.translate(-320, -256);
                        ctx.fillStyle = 'rgba(0, 0, 0, .14)';
                        ctx.fill(CLOUD_PATH);
                        ctx.restore();
                    }
                    ctx.rotate(p.angle);
                    ctx.scale(w / 640, hh / 512);
                    ctx.translate(-320, -256);
                    ctx.fillStyle = 'rgb(' + sp.color.map(v => Math.round(Math.min(255, v))).join(',') + ')';
                    ctx.fill(CLOUD_PATH);
                }
                else {
                    let mountain = sp.type === 'mountain';
                    let vw = mountain ? 190.12 : 448, vh = mountain ? 166.85 : 512;
                    let w = h * (mountain ? 1.14 : .875);
                    ctx.rotate(p.angle);
                    // Arbres jamais complètement écrasés : les forêts restent visibles de face
                    let lean = mountain ? Math.pow(p.tilt, .8) : Math.max(.55, Math.pow(p.tilt, .8));
                    ctx.scale(w / vw * grow, h * lean / vh * grow);
                    ctx.translate(-vw / 2, -vh * .92);
                    ctx.fillStyle = 'rgb(' + sp.color.map(Math.round).join(',') + ')';
                    ctx.fill(mountain ? MOUNTAIN_PATH : TREE_PATH);
                }
                ctx.restore();
            }
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
            cloudRot += .0021 * rotSpeed * cloudFactor + cloudDrift;
            let c = size / 2;
            let ripple = null;
            if (prevTex) {
                // Onde partie du point de contact, assez grande pour couvrir tout le disque
                let o = rippleOrigin();
                let reach = Math.hypot(o.x - c, o.y - c) + r + 6 * dpr;
                let off = c - map.w / 2;
                ripple = {x: o.x - off, y: o.y - off, radius: (1 - Math.pow(1 - k, 2.2)) * reach};
            }
            let rippleCanvas = ripple ? {x: ripple.x + c - map.w / 2, y: ripple.y + c - map.w / 2, radius: ripple.radius} : null;
            drawSphere(ripple);
            if (k >= 1 && prevTex) {
                prevTex = null;
                rippleStart = 0;
                revealing.clear();
            }

            ctx.clearRect(0, 0, size, size);
            let a = atmos();
            drawRing(r, false);
            // Atmosphère, dès qu'il y a de l'oxygène : halo en dégradé qui
            // s'estompe vers l'espace, d'autant plus épais que l'oxygène est présent
            let thick = a ? r * (.16 + .1 * s.oxy / 100 + a.dense) : 0;
            let ac = a ? hex(a.color).join(',') : '';
            if (a) {
                let g = ctx.createRadialGradient(c, c, r * .9, c, c, r + thick);
                g.addColorStop(0, 'rgba(' + ac + ',.7)');
                g.addColorStop((r * .1) / (r * .1 + thick), 'rgba(' + ac + ',.6)');
                g.addColorStop(.6, 'rgba(' + ac + ',.35)');
                g.addColorStop(1, 'rgba(' + ac + ',0)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(c, c, r + thick, 0, Math.PI * 2);
                ctx.fill();
            }
            // Éléments derrière l'horizon : la planète cache leur base
            drawSprites(r, false, rippleCanvas, now);
            ctx.drawImage(sphere, c - map.w / 2, c - map.w / 2);
            // …et le même gaz qui voile le bord du disque, en dégradé vers l'intérieur
            if (a) {
                let g = ctx.createRadialGradient(c, c, r - thick * .6, c, c, r + 1);
                g.addColorStop(0, 'rgba(' + ac + ',0)');
                g.addColorStop(1, 'rgba(' + ac + ',.6)');
                ctx.fillStyle = g;
                ctx.beginPath();
                ctx.arc(c, c, r + 1, 0, Math.PI * 2);
                ctx.fill();
            }
            drawSprites(r, true, rippleCanvas, now);
            drawRing(r, true);
        }

        buildSprites();

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
                revealing = new Set(keys);
                buildSprites();
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

    // Lunes : de 0 à 3 par planète, tirées de sa graine. Même style que la
    // planète encore inconnue (aplats gris, cratères, ombre en croissant)
    const MOON_TEX_W = 128, MOON_TEX_H = 64;
    const MOON_PALETTES = [
        ['#8d8fa3', '#7b7d92'],
        ['#a39a8e', '#8c8377'],
        ['#8fa0b0', '#7a8a9b'],
        ['#b4b4bc', '#9a9aa4']
    ];
    // Orbite de référence : l'ancienne lune (250px) faisait un tour en 30 s
    const MOON_REF_ORBIT = 250, MOON_REF_PERIOD = 30;

    function moonTexture(rng) {
        let pal = MOON_PALETTES[Math.floor(rng() * MOON_PALETTES.length)].map(hex);
        let craters = [];
        for (let i = 0, n = 2 + Math.floor(rng() * 2); i < n; i++) {
            let z = rng() * 2 - 1, a = rng() * Math.PI * 2, s = Math.sqrt(1 - z * z);
            let c = norm([s * Math.cos(a), z * .85, s * Math.sin(a)]);
            craters.push({x: c[0], y: c[1], z: c[2], r: .2 + rng() * .2});
        }
        let tex = new Uint8ClampedArray(MOON_TEX_W * MOON_TEX_H * 3);
        for (let v = 0; v < MOON_TEX_H; v++) {
            let lat = (.5 - (v + .5) / MOON_TEX_H) * Math.PI;
            for (let u = 0; u < MOON_TEX_W; u++) {
                let lon = (u + .5) / MOON_TEX_W * Math.PI * 2;
                let x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
                let c = pal[0];
                for (let cr of craters) {
                    let d = Math.acos(Math.min(1, x * cr.x + y * cr.y + z * cr.z));
                    if (d < cr.r) {
                        let rim = Math.acos(Math.min(1, x * (cr.x - .05) + y * (cr.y + .05) + z * cr.z)) > cr.r * .85;
                        c = mix(c, [0, 0, 0], rim ? .17 : .1);
                    }
                }
                let k = (v * MOON_TEX_W + u) * 3;
                tex[k] = c[0]; tex[k + 1] = c[1]; tex[k + 2] = c[2];
            }
        }
        return tex;
    }

    // Projection d'un petit disque : longitude, ligne de texture, ombre, bord
    function moonMap(r) {
        let R = Math.ceil(r), w = R * 2;
        let canvas = document.createElement('canvas');
        canvas.width = canvas.height = w;
        let ctx = canvas.getContext('2d');
        let px = [];
        for (let y = 0; y < w; y++) {
            for (let x = 0; x < w; x++) {
                let nx = (x + .5 - R) / r, ny = -(y + .5 - R) / r;
                let q = nx * nx + ny * ny;
                if (q > 1)
                    continue;
                let nz = Math.sqrt(1 - q);
                let sx = nx + .11, sy = ny - .085;
                px.push({
                    o: (y * w + x) * 4,
                    lon: Math.atan2(nx, nz) / (Math.PI * 2) * MOON_TEX_W,
                    row: Math.min(MOON_TEX_H - 1, Math.floor((.5 - Math.asin(ny) / Math.PI) * MOON_TEX_H)) * MOON_TEX_W,
                    shade: sx * sx + sy * sy > 1 ? SHADOW : 1,
                    edge: Math.min(1, (1 - Math.sqrt(q)) * r + .5) * 255
                });
            }
        }
        return {canvas, ctx, w, px, img: ctx.createImageData(w, w)};
    }

    // opts.planetRadius : rayon de la planète affichée à côté (108px sur la page
    // planète) ; opts.compact : orbites resserrées pour un petit cadre (écran de fin).
    // Le tirage ne dépend pas du cadre : ce sont les mêmes lunes partout
    const MOON_LIMIT = 416;
    function createMoons(canvas, seed, opts = {}) {
        let rng = mulberry32(seed ^ 0x6d2b79f5);
        let count = Math.floor(rng() * 4);
        let cssSize = canvas.clientWidth || 840;
        let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        let size = Math.round(cssSize * dpr);
        canvas.width = canvas.height = size;
        let ctx = canvas.getContext('2d');

        // Orbites de plus en plus lointaines, sans se toucher ; la période suit
        // la 3e loi de Kepler (T ∝ a^1,5), la rotation propre est tirée au hasard
        let moons = [];
        let edge = 200;
        for (let i = 0; i < count; i++) {
            let radius = 8 + rng() * 13;
            let orbit = edge + radius + (i ? 12 + rng() * 26 : rng() * 25);
            if (orbit + radius > MOON_LIMIT)
                break;
            let k = (opts.planetRadius || 108) / 108;
            let shownOrbit = (opts.compact ? 171 + (orbit - 171) * .45 : orbit) * k;
            moons.push({
                orbit, radius, shownOrbit,
                period: MOON_REF_PERIOD * Math.pow(orbit / MOON_REF_ORBIT, 1.5),
                spin: (rng() < .5 ? -1 : 1) * (6 + rng() * 24),
                phase: rng() * Math.PI * 2,
                tex: moonTexture(rng),
                map: moonMap(Math.max(4, radius * k) * dpr)
            });
            edge = orbit + radius;
        }

        function drawMoon(m, t) {
            let u0 = (t / m.spin) * MOON_TEX_W;
            let data = m.map.img.data;
            for (let p of m.map.px) {
                let u = Math.floor(p.lon + u0) % MOON_TEX_W;
                if (u < 0) u += MOON_TEX_W;
                let k = (p.row + u) * 3;
                data[p.o] = m.tex[k] * p.shade;
                data[p.o + 1] = m.tex[k + 1] * p.shade;
                data[p.o + 2] = m.tex[k + 2] * p.shade;
                data[p.o + 3] = p.edge;
            }
            m.map.ctx.putImageData(m.map.img, 0, 0);
            let a = m.phase + t / m.period * Math.PI * 2;
            let c = size / 2;
            let x = c + Math.cos(a) * m.shownOrbit * dpr, y = c + Math.sin(a) * m.shownOrbit * dpr;
            ctx.drawImage(m.map.canvas, x - m.map.w / 2, y - m.map.w / 2);
        }

        let last = 0;
        function loop(now) {
            if (now - last > 32) {
                last = now;
                let t = now / 1000;
                ctx.clearRect(0, 0, size, size);
                ctx.strokeStyle = 'rgba(176, 166, 255, .18)';
                ctx.lineWidth = dpr;
                for (let m of moons) {
                    ctx.beginPath();
                    ctx.arc(size / 2, size / 2, m.shownOrbit * dpr, 0, Math.PI * 2);
                    ctx.stroke();
                }
                moons.forEach(m => drawMoon(m, t));
            }
            requestAnimationFrame(loop);
        }
        if (moons.length)
            requestAnimationFrame(loop);
        return moons.map(m => ({orbit: m.orbit, radius: m.radius, period: m.period, spin: m.spin}));
    }

    window.PlanetView = {create, createMoons, LAYERS};

    // Branchement automatique : <canvas data-planet-view> + window.PLANET_DATA
    document.addEventListener('DOMContentLoaded', () => {
        let canvas = document.querySelector('canvas[data-planet-view]');
        if (!canvas || !window.PLANET_DATA)
            return;
        let planetRadius = Number(canvas.dataset.planetRadius) || canvas.clientWidth * .3;
        let view = create(canvas, {
            radius: planetRadius,
            modules: PLANET_DATA.modules,
            seed: PLANET_DATA.id,
            revealed: canvas.dataset.planetView === 'all' ? 'all' : []
        });
        window.planetView = view;
        let moonsCanvas = document.querySelector('canvas[data-planet-moons]');
        if (moonsCanvas) {
            // Écran de fin : petite planète, orbites resserrées autour d'elle
            let compact = moonsCanvas.dataset.planetMoons === 'compact';
            window.planetMoons = createMoons(moonsCanvas, Number(PLANET_DATA.id) || hashSeed(PLANET_DATA.modules || {}),
                compact ? {compact: true, planetRadius: planetRadius} : {});
        }
        // Préfixe des éléments du trait de chaque scan (template-planet.ejs)
        const LINES = {oxy: 'o2', ff: 'ff', cli: 'cl', wtr: 'eau', res: 're', grv: 'gr'};
        document.addEventListener('planet-reveal', (e) => {
            let k = LINES[e.detail], q = (sel) => k && document.querySelector('.' + k + sel);
            view.reveal(e.detail, {first: q('-line'), line: q('-line2'), dot: q('-linedot')});
        });
        document.addEventListener('planet-reveal-all', () => view.revealAll());
    });
})();
