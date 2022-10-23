class ShipModule{
    name;
    desc;
    integrity = 100;
    upgraded = false;
    repairable = false;
    upgradable = false;

    constructor(name) {
        this.name = name;
        switch (name){
            case name.match(/.*Scanner.*/).length > 0:
                this.repairable = true;
                this.upgradable = true;
                break;
            case name.match(/.*Proximity.*/).length > 0:
                this.repairable = true;
                break;
            case name.match(/.*Motors.*/).length > 0:
                this.repairable = true;
                break;
            case name.match(/.*Shield.*/).length > 0:
                this.repairable = true;
                break;
            // case name.match(/.*Oxygen.*/).length > 0:
            //     this.repairable = true;
            //     break;
            // case name.match(/.*Electricity.*/).length > 0:
            //     this.repairable = true;
            //     break;
            // case name.match(/.*Gravity.*/).length > 0:
            //     this.repairable = true;
            //     break;
            case name.match(/.*Landing.*/).length > 0:
                this.repairable = true;
                break;
            case name.match(/.*Construction.*/).length > 0:
                this.repairable = true;
                break;
        }
    }

    repair(amount){
        if (this.repairable)
            this.integrity += amount;
        else
            console.log("This module cannot be repaired");
        if (this.integrity > 100)
            this.integrity = 100;
    }

    upgrade(){
        if (this.upgraded)
            console.log("This module is already upgraded");
        else if (this.upgradable)
            this.upgraded = true;
            //then apply upgrade modifications
        else
            console.log("This Module cannot be upgraded");
    }
}

module.exports = {ShipModule}