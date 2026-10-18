// Lancement de la partie : synopsis puis fiche du vaisseau, comme sur les
// pages du MJ (/synopsis puis /start). Les joueurs en ligne lisent le même
// texte et votent « Continuer » ; quand tous les joueurs en ligne avec un
// perso sont prêts, la page du MJ passe à la suite (le MJ peut toujours
// cliquer « Suivant » lui-même).
const lobby = require('./lobby');

const SYNOPSIS = 'Des membres de différentes espèces extraterrestres unissent leurs forces pour sauver l’humanité de l’extinction en envoyant des vaisseaux spatiaux pour récupérer des humains cryogénisés et les emmener vers une nouvelle planète habitable.\n\nCependant, durant le voyage, le vaisseau rencontre des problèmes inattendus et l’équipage doit travailler ensemble pour trouver une solution et protéger au mieux les humains à bord.';

// Texte de la fiche du vaisseau (public/views/fiche-vaisseau.ejs)
const SHIP = [
    'Vaisseau type “Plugs” (Pretty Looking and Ultimately Glorious Ships) manufacturé par l’“Organization Legaly Independent” dans le but de sauver un maximum d’êtres humains de la 69-ième guerre d’autodestruction terrienne à échelle cosmique opposant l’”Unbound Strategic Alliance” et la “Joyful army of Protestants and Nutritionnists”.',
    'Il permet de stocker plus d’humains dans des pods cryogéniques (que le modèle “Geisha”) et de les faire entrer dans un état permettant de les transporter plus facilement vers leur nouvelle planète. Le vaisseau dispose d’un système de bouclier lui permettant de résister à une attaque, cependant il ne possède pas de système d’attaque (au cas où les humains se réveillerais et voudrais faire une révolution en prenant le contrôle du vaisseau [ils serraient contraints de faire grève]), il est donc impossible de se défendre avec.',
    'Il peut atteindre la vitesse de “à peu près un peu moins que la vitesse de la lumière” mais moins et uniquement le mercredi en descente*. Il peut atterrir sur n’importe quel surface** grâce à des bras mécaniques pénétrant dans le sol.',
    'L’intérieur à été spécifiquement organisé pour un confort optimal de l’utilisateur.',
    'Il est équipé d’un système d’autopilote en retard sur son temps mais capable d’anticiper des évènement passés. Il est recommandé de ne pas l’utiliser pour survivre avec plus de chance.',
    'Les PLUGS sont aussi équipés d’une machine à glace.',
    '*pour les années bissextiles se référé au manuel.\n**sauf sur matelas gonflables et la lave en fusion.***\n***sauf si la lave est à plus de 21°C.'
].join('\n\n');

const STEPS = {
    synopsis: {title: 'Synopsis', text: SYNOPSIS},
    ship: {title: 'Navire PLUGS', text: SHIP}
};

let step = null;          // 'synopsis' | 'ship' | null
const ready = new Set();  // joueurs prêts à continuer

// Nouvel écran : les votes repartent de zéro
const set = function (value) {
    value = STEPS[value] ? value : null;
    if (value !== step)
        ready.clear();
    step = value;
};

const clear = () => set(null);

// Joueurs attendus : en ligne et avec un perso
const expected = () => lobby.getState().players.filter(p => p.online && p.character).map(p => p.id);

const counts = function () {
    let ids = expected();
    let done = ids.filter(id => ready.has(id)).length;
    return {ready: done, expected: ids.length, all: ids.length > 0 && done === ids.length};
};

// Message pour les pages du MJ
const payload = function () {
    return {action: 'intro', error: false, data: Object.assign({step}, counts())};
};

// Un joueur est prêt (ou ne l'est plus)
const vote = function (playerId, value) {
    if (!step)
        return {error: 'Rien à valider pour l\'instant.'};
    if (value)
        ready.add(playerId);
    else
        ready.delete(playerId);
    return {payload: payload()};
};

const isReady = (playerId) => !!step && ready.has(playerId);

// L'écran tel que les joueurs le voient, comme une carte avec un seul choix
const publicCard = function () {
    if (!step)
        return null;
    let c = counts();
    return {
        id: 'intro-' + step,
        kind: 'intro',
        title: STEPS[step].title,
        desc: STEPS[step].text,
        screen: 'intro-' + step,
        choices: ['Continuer'],
        counts: [c.ready],
        expected: c.expected,
        chosen: null
    };
};

module.exports = {set, clear, payload, vote, isReady, publicCard, SYNOPSIS, step: () => step};
