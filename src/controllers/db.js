const Sequelize = require('sequelize');
const {Player} = require("../models/player");

class DB {
    sequelize;
    tables;
    constructor() {}
    async init() {
        this.sequelize =  new Sequelize('database', '', '', {
            host: 'localhost',
            dialect: 'sqlite',
            logging: false,
            storage: 'database.sqlite'
        });
        await this.registerDatabases();
        return this;
    }

    async registerDatabases() {
        let cards = this.sequelize.define('cards', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            type: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            value: {
                type: Sequelize.INTEGER,
                defaultValue: -1,
                allowNull: false
            },
            name: {
                type: Sequelize.STRING,
                defaultValue: '',
                allowNull: false
            },
            desc: {
                type: Sequelize.TEXT,
                defaultValue: '',
                allowNull: false
            },
            timer: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            }
        });

        let card_modules = this.sequelize.define('card_modules', {
            card_id: {
                type: Sequelize.INTEGER,
                allowNull: false
            },
            type: {
                type: Sequelize.ENUM(
                    'choice',
                    'oxy_cost',
                    'oxy_val',
                    'grv_cost',
                    'grv_val',
                    'wtr_cost',
                    'wtr_val',
                    'fau_cost',
                    'fau_val',
                    'cli_cost',
                    'cli_val',
                    'res_cost',
                    'res_val'),
                allowNull: false,
                defaultValue: 'choice',
                validate: {
                    isIn: {
                        args: [['choice',
                            'oxy_cost',
                            'oxy_val',
                            'grv_cost',
                            'grv_val',
                            'wtr_cost',
                            'wtr_val',
                            'fau_cost',
                            'fau_val',
                            'cli_cost',
                            'cli_val',
                            'res_cost',
                            'res_val'
                        ]],
                        msg: "Wrong type"
                    }
                }
            },
            value: {
                type: Sequelize.STRING,
                defaultValue: 0,
                allowNull: false
            }
        })

        let players = this.sequelize.define('players', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            name: {
                type: Sequelize.STRING,
                defaultValue: '',
                allowNull: false
            },
            race: {
                type: Sequelize.STRING,
                defaultValue: 'human',
                allowNull: false
            },
            combat: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            pilotage: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            engineering: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            survival: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            recon: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            moral: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            }
        });

        this.tables = {
            cards: cards,
            card_modules: card_modules,
            players: players
        };

        for (let table in this.tables) {
            await this.tables[table].sync();
            console.log('synchro ' + table)
        }
    }

    async test() {
        for (let i=0; i<1000; i++) {
            let type = Math.floor(Math.random()*4);
            await this.tables.cards.create({
                type: type,
                name: 'name '+i,
                desc: 'desc '+i,
                value: (type === 0 ? i : -1)
            });
            await this.tables.card_modules.create({
                card_id: Math.floor(Math.random()*8),
                value: 'CHOICE '+i,
                cost: -1,
            });
        }

        for (let i=0; i<100; i++) {
            await this.tables.players.create({
                'name': 'player ' + i,
                'race': 'human',
                'combat': Math.floor(Math.random() * 100),
                'pilotage': Math.floor(Math.random() * 100),
                'engineering': Math.floor(Math.random() * 100),
                'survival': Math.floor(Math.random() * 100),
                'recon': Math.floor(Math.random() * 100),
                'moral': Math.floor(Math.random() * 100)
            })
        }
    }
}

module.exports = {DB}