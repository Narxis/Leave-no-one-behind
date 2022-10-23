let module = require('shipModules')

class Ship{
    name;
    cryopods = 1000;
    modules = [];

    init(){
        this.modules.push(new module.ShipModule("Scanner"));
        this.modules.push(new module.ShipModule("Proximity"));
        this.modules.push(new module.ShipModule("Motors"));
        this.modules.push(new module.ShipModule("Shield"));
        this.modules.push(new module.ShipModule("Oxygen"));
        this.modules.push(new module.ShipModule("Electricity"));
        this.modules.push(new module.ShipModule("Gravity"));
        this.modules.push(new module.ShipModule("Landing"));
        this.modules.push(new module.ShipModule("Construction"));
    }
}