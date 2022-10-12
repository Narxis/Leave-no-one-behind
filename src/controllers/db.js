const Sequelize = require('sequelize');

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
                            'res_val']],
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

        this.tables = {
            cards: cards,
            card_modules: card_modules
        };

        for (let table in this.tables) {
            await this.tables[table].sync();
            console.log('synchro ' + table)
        }
    }
}

module.exports = {DB}