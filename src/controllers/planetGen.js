const ARCHETYPES = require('../config/planetArchetypes.json');

// Weight of each stat in a planet's score (sum = 500): the score
// goes from 1 to 1000 and puts the planet in a difficulty range
const STAT_WEIGHTS = {oxy: 85, grv: 60, wtr: 95, res: 80, fau: 30, flo: 30, civ: 65, cli: 55};
const STATS = Object.keys(STAT_WEIGHTS);
const MAX_TRIES = 3000;

// Consistency rules between stats, applied on each draw:
// strong tectonic activity and acid rain (climate ≤ 25) => no water on
// the surface, only "another liquid" (water ≤ 20)
const RULES = [
    (v) => v.cli > 25 || v.wtr <= 20
];
const isCoherent = (values) => RULES.every(rule => rule(values));

const scoreOf = (values) => Math.round(STATS.reduce((sum, s) => sum + values[s] * STAT_WEIGHTS[s], 0) / 50);

const rangesFor = (archetype, stat) => archetype[stat] || ARCHETYPES.default[stat];

const randInt = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));

// Minimum and maximum score an archetype can reach
const scoreBounds = function (archetype) {
    let low = {}, high = {};
    for (let stat of STATS) {
        let ranges = rangesFor(archetype, stat);
        low[stat] = Math.min(...ranges.map(r => r[0]));
        high[stat] = Math.max(...ranges.map(r => r[1]));
    }
    return [scoreOf(low), scoreOf(high)];
}

const rollWith = function (archetype, rng) {
    let values = {};
    for (let stat of STATS) {
        let ranges = rangesFor(archetype, stat);
        let [min, max] = ranges[Math.floor(rng() * ranges.length)];
        values[stat] = randInt(rng, min, max);
    }
    return values;
}

const pickWeighted = function (entries, rng) {
    let total = entries.reduce((sum, [, a]) => sum + (a.weight || 1), 0);
    let r = rng() * total;
    for (let entry of entries) {
        r -= entry[1].weight || 1;
        if (r < 0)
            return entry;
    }
    return entries[entries.length - 1];
}

// Draws an archetype compatible with the [min, max] range, then its stats
// until they fall within the range. Returns {archetype, values, score}
const rollPlanet = function (min, max, rng = Math.random) {
    let candidates = Object.entries(ARCHETYPES.archetypes).filter(([, a]) => {
        let [low, high] = scoreBounds(a);
        return high >= min && low <= max;
    });
    while (candidates.length) {
        let [slug, archetype] = pickWeighted(candidates, rng);
        for (let i = 0; i < MAX_TRIES; i++) {
            let values = rollWith(archetype, rng);
            let score = scoreOf(values);
            if (score >= min && score <= max && isCoherent(values))
                return {archetype: slug, values, score};
        }
        // Range too narrow for this archetype: try another one
        candidates = candidates.filter(([s]) => s !== slug);
    }
    // No archetype fits: free draw, as before archetypes
    for (;;) {
        let values = rollWith({}, rng);
        let score = scoreOf(values);
        if (score >= min && score <= max && isCoherent(values))
            return {archetype: '', values, score};
    }
}

module.exports = {rollPlanet, scoreOf, scoreBounds, isCoherent, STAT_WEIGHTS, ARCHETYPES};
