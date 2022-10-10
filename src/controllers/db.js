const Sequelize = require('sequelize');

// module.exports.init = function () {
//     const sequelize =  new Sequelize('database', '', '', {
//         host: 'localhost',
//         dialect: 'sqlite',
//         logging: false,
//         storage: 'database.sqlite'
//     });
//
//     const DB = sequelize.define('pokedex', {
//         word: {
//             type: Sequelize.STRING,
//             unique: true
//         },
//         ban_time: {
//             type: Sequelize.INTEGER,
//             defaultValue: 0,
//             allowNull: false
//         },
//         founder: {
//             type: Sequelize.STRING,
//             defaultValue: '',
//             allowNull: false
//         }
//     });
// }

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
            }
        });

        let card_details = this.sequelize.define('card_details', {
            card_id: {
                type: Sequelize.INTEGER,
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
                type: Sequelize.ENUM('choice',
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
                allowNull: false
            },
            value: {
                type: Sequelize.INTEGER,
                defaultValue: 0,
                allowNull: false
            }
        })

        this.tables = {
            cards: cards,
            card_details: card_details,
            card_modules: card_modules
        };

        for (let table in this.tables) {
            await this.tables[table].sync();
            console.log('synchro ' + table)
        }
    }
}

module.exports = {DB}