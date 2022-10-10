class cardModule {
    cost;
    value;
    constructor(value, cost = -1) {
        this.cost = cost;
        this.value = value;
    }
}

module.exports = {cardModule}