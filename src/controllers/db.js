const Sequelize = require('sequelize');
const {Player} = require("./../models/player");


const DB_VERSION = 6; // increment when structure changes are added
const DB_FOLDER = 'storage/databases/';

class DB {
    sequelize;
    tables;
    constructor() {}
    async init(test = false) {

        if (process.env.DB_URL === '') {
            let db_name = test ? 'test_db' : 'database' + DB_VERSION;
            log('Using local DB', "#666666")
            this.sequelize =  new Sequelize(db_name, '', '', {
                host: 'localhost',
                dialect: 'sqlite',
                logging: false,
                storage: DB_FOLDER + db_name + '.sqlite'
            });
        }
        else {
            log('Using remote DB')
            this.sequelize = new Sequelize(process.env.DB_URL)
        }
        await this.registerDatabases();
        // this.test();
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
            },
            shuffle: {
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
                    'flo_cost',
                    'flo_val',
                    'civ_cost',
                    'civ_val',
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
                            'flo_cost',
                            'flo_val',
                            'civ_cost',
                            'civ_val',
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
            },
            next: {
                type: Sequelize.STRING,
                defaultValue: '',
                allowNull: false
            },
            reveal: {
                type: Sequelize.TEXT,
                defaultValue: '',
                allowNull: false
            }
        })

        let players = this.sequelize.define('players', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            discord_id: {
                type: Sequelize.STRING,
                defaultValue: '',
                allowNull: false
            },
            name: {
                type: Sequelize.STRING,
                defaultValue: '',
                allowNull: false
            },
            race: {
                type: Sequelize.STRING,
                defaultValue: '',
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
                defaultValue: 100,
                allowNull: false
            }
        });

        let ship = this.sequelize.define('ship', {
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
            cryopods: {
                type: Sequelize.INTEGER,
                defaultValue: 1000,
                allowNull: false
            },
            scanner: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            proximity: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            motors: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            shield: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            oxygen: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            energy: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            gravity: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            landing: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            dbscience: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            dbhistory: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            construction: {
                type: Sequelize.INTEGER,
                defaultValue: 100,
                allowNull: false
            },
            scanner_up: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            oxygen_up: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            energy_up: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            gravity_up: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
        })

        let deck = this.sequelize.define('deck', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            deck_id: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            card_id: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            },
            played: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            }
        })

        let items = this.sequelize.define('items', {
            id: {
                type: Sequelize.INTEGER,
                primaryKey: true,
                autoIncrement: true
            },
            owners: {
                type: Sequelize.STRING,
                defaultValue: null,
                allowNull: true
            },
            slug: {
                type: Sequelize.STRING,
                defaultValue: '',
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
            pool: {
                type: Sequelize.STRING,
                defaultValue: '',
                allowNull: false
            },
            race: {
                type: Sequelize.STRING,
                defaultValue: '',
                allowNull: false
            },
            quantity: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            }
        })

        let statuses = this.sequelize.define('statuses', {
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
            desc: {
                type: Sequelize.TEXT,
                defaultValue: '',
                allowNull: false
            },
            slug: {
                type: Sequelize.STRING,
                defaultValue: '',
                allowNull: false
            },
            duration: {
                type: Sequelize.INTEGER,
                defaultValue: '',
                allowNull: false
            }
        })

        let config = this.sequelize.define('config', {
            key: {
                type: Sequelize.STRING,
                primaryKey: true,
                defaultValue: '',
                allowNull: false
            },
            val: {
                type: Sequelize.STRING,
                defaultValue: '',
                allowNull: false
            }
        });

        this.tables = {
            config: config,
            cards: cards,
            card_modules: card_modules,
            players: players,
            ship: ship,
            deck: deck,
            items: items,
            statuses: statuses
        };

        for (let table in this.tables) {
            await this.tables[table].sync();
            log('synchro ' + table, '#666666')
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
                reveal: 'Reveal' +i+i+i+i+i+i+i+i+i+i+i+i+i+i+i+i+i+i,
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

        await this.tables.ship.create();
    }
}

module.exports = {DB}