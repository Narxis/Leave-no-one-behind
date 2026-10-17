const {Op} = require("sequelize");
const fs = require("fs");

// Diverti : les pertes de moral sont divisées par 2 (arrondi vers le bas)
const DIVERTED_SLUG = 'diverti';
const DIVERTED_LOSS_DIVISOR = 2;
// Statuts créés à la volée : longueur du nom et de la description
const CUSTOM_NAME_MAX = 30;
const CUSTOM_DESC_MAX = 160;

const slugify = (text) => String(text).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

class Statuses {

    id;
    name;
    desc;
    slug;
    duration;
    accepted_datas = {
        'name': '',
        'desc': '',
        'slug': '',
        'duration': 0
    }

    constructor(id = 0) {
        this.id = id;
    }

    async create(data = {}) {

        for (let dat in this.accepted_datas)
            this[dat] = (typeof data[dat] === 'undefined' ? this.accepted_datas[dat]: data[dat]);

        await DB.tables.statuses.create({
            name: this.name,
            desc: this.desc,
            slug: this.slug,
            duration: this.duration
        }).then(result => {
            this.id = result.id;
        });

        return await this.getData();
    }

    // Durée d'un statut, pour toute l'équipe (playerId vide) ou un seul
    // joueur : la ligne du joueur reprend le nom et la description du
    // statut, elle disparaît quand sa durée tombe à 0
    async updateStatus(slug, newValue, playerId = '') {
        playerId = String(playerId || '');
        if (!playerId) {
            await DB.tables.statuses.update({duration: newValue}, {where: {slug: slug, player_id: ''}});
            return;
        }
        let row = await DB.tables.statuses.findOne({where: {slug: slug, player_id: playerId}});
        if (newValue <= 0) {
            if (row)
                await row.destroy();
            return;
        }
        if (row) {
            await row.update({duration: newValue});
            return;
        }
        let base = await DB.tables.statuses.findOne({where: {slug: slug, player_id: ''}, raw: true});
        if (base)
            await DB.tables.statuses.create({name: base.name, desc: base.desc, slug: slug, duration: newValue,
                player_id: playerId, custom: base.custom, clear_after_planet: base.clear_after_planet});
    }

    // Statut créé à la volée par le MJ (nom + description courte). Un nom
    // déjà pris par un statut créé à la volée le met à jour. Renvoie son slug,
    // ou false si le nom est vide ou celui d'un statut de base
    async createCustom(data = {}) {
        let name = String(data.name || '').trim().slice(0, CUSTOM_NAME_MAX);
        let slug = 'c-' + slugify(name);
        if (slug === 'c-')
            return false;
        let base = await DB.tables.statuses.findOne({where: {player_id: '', [Op.or]: [{slug: slug}, {name: name}]}, raw: true});
        if (base && !base.custom)
            return false;
        let fields = {
            name: name,
            desc: String(data.desc || '').trim().slice(0, CUSTOM_DESC_MAX),
            custom: true,
            clear_after_planet: data.clearAfterPlanet === undefined || data.clearAfterPlanet === null ? null : !!data.clearAfterPlanet
        };
        if (base) {
            slug = base.slug;
            await DB.tables.statuses.update(fields, {where: {slug: slug}});
        }
        else
            await DB.tables.statuses.create(Object.assign({slug: slug, duration: 0, player_id: ''}, fields));
        return slug;
    }

    async add(slug, val=1) {
        await DB.tables.statuses.increment({duration: val}, { where: { slug: slug, player_id: '' } });
    }

    async remove(slug, val=1) {
        await DB.tables.statuses.decrement({duration: val}, { where: { slug: slug, player_id: '' } });
    }

    // Fin d'une carte : ces statuts actifs perdent une carte, ou s'arrêtent
    // net (clear, après une planète). Ceux d'un joueur disparaissent à 0
    async countDown(rows, clear = false) {
        for (let row of rows) {
            let duration = clear ? 0 : Math.max(0, row.duration - 1);
            if (row.player_id && duration <= 0)
                await DB.tables.statuses.destroy({where: {id: row.id}});
            else
                await DB.tables.statuses.update({duration: duration}, {where: {id: row.id}});
        }
    }

    // Statut actif pour ce joueur : sur toute l'équipe ou sur lui
    async isActiveFor(slug, playerId) {
        return !!await DB.tables.statuses.findOne({raw: true, where: {slug: slug, duration: {[Op.gt]: 0},
            player_id: {[Op.in]: ['', String(playerId || '')]}}});
    }

    // Diverti : une perte de moral est divisée (arrondi vers le bas). Renvoie
    // la nouvelle valeur du moral
    async moralAfterLoss(playerId, oldMoral, newMoral) {
        if (!(newMoral < oldMoral) || !await this.isActiveFor(DIVERTED_SLUG, playerId))
            return newMoral;
        return oldMoral - Math.floor((oldMoral - newMoral) / DIVERTED_LOSS_DIVISOR);
    }

    async getData() {

        let status = await DB.tables.statuses.findOne({
            attributes: [
                'id',
                'name',
                'desc',
                'slug',
                'duration'
            ],
            where: {
                id: this.id
            }
        })

        if (!status) return false;

        for (let dat in status.dataValues) {
            this[dat] = status.dataValues[dat]
        }

        return this;
    }

    // Actifs : ceux de l'équipe et ceux des joueurs (avec le nom du joueur).
    // Sinon : la liste des statuts connus (de base et créés à la volée)
    async getAllStatuses(active=true) {
        if (!active)
            return (await DB.tables.statuses.findAll({where: {player_id: ''}, order: [['id', 'ASC']]})).map(r => r.dataValues);

        let result = (await DB.tables.statuses.findAll({where: {duration: {[Op.gt]: 0}}, order: [['id', 'ASC']]})).map(r => r.dataValues);
        if (result.some(s => s.player_id)) {
            let players = await DB.tables.players.findAll({attributes: ['discord_id', 'name'], raw: true});
            let names = Object.fromEntries(players.map(p => [String(p.discord_id), p.name]));
            for (let s of result)
                if (s.player_id)
                    s.player_name = names[s.player_id] || '';
        }
        return result;
    }

    async hydrateDB(cleanInstall = true) {
        if (cleanInstall) {
            await DB.tables.statuses.destroy({truncate: true});
        }
        let baseStatusRaw = fs.readFileSync(__dirname + '/../config/statuses.json');
        let baseStatuses = JSON.parse(baseStatusRaw);
        let bulkStatuses = [];
        // Sans remise à zéro : n'ajoute que les statuts de base manquants
        // (partie commencée avant l'ajout d'un statut au jeu)
        let existing = cleanInstall ? [] : (await DB.tables.statuses.findAll({attributes: ['slug'], raw: true})).map(s => s.slug);

        for (let status of baseStatuses) {
            if (!existing.includes(status.slug))
                bulkStatuses.push(status)
        }

        if (bulkStatuses.length > 0)
            await DB.tables.statuses.bulkCreate(bulkStatuses)
    }
}

module.exports = {Statuses, DIVERTED_SLUG, DIVERTED_LOSS_DIVISOR}
