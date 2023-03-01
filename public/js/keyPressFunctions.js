async function initialiseKeyListener() {
    document.addEventListener("keydown", (event) => {
        if (document.activeElement.tagName === 'INPUT') return;
        switch (event.key) {
            case "F1":
                event.preventDefault();
                document.querySelector(".plan-container").classList.toggle("mapshow")
                break;
// J'ai mis un toggle showroom sur tout les modules pour tester, à dégager si on veut rajouter quelque chose ici
            case "F2":
                event.preventDefault();
                document.querySelectorAll(".zone-active").forEach(function (e) {
                    e.classList.toggle("showroom");
                })
//            case "F5":
//                event.preventDefault();
//                break;
            case "²":
                document.querySelectorAll(".tab").forEach(function (e) {
                    e.classList.toggle("revealtooltip");
                });
                break;
            case "&":
                document.querySelector(".tab-moteurs").classList.add("revealtooltip");
                break;
            case "é":
                document.querySelector(".tab-scan").classList.add("revealtooltip");
                break;
            case '"':
                document.querySelector(".tab-detect").classList.add("revealtooltip");
                break;
            case "'":
                document.querySelector(".tab-o2").classList.add("revealtooltip");
                break;
            case "(":
                document.querySelector(".tab-elec").classList.add("revealtooltip");
                break;
            case "-":
                document.querySelector(".tab-grav").classList.add("revealtooltip");
                break;
            case "Tab":
                event.preventDefault();
                break;
            
        };
    });
    document.addEventListener("keyup", (event) => {
        if (document.activeElement.tagName === 'INPUT') return;
        switch (event.key) {
            case "Escape":
                document.getElementById("navBtn").click();
                break;
            case "F1":
                event.preventDefault();
                break;
            case "F5":
                event.preventDefault();
                break;
/*            case "²":
                document.querySelectorAll(".tab").forEach(function (e) {
                    e.classList.remove("revealtooltip");
                });
                break;*/
            case "&":
                document.querySelector(".tab-moteurs").classList.remove("revealtooltip");
                break;
            case "é":
                document.querySelector(".tab-scan").classList.remove("revealtooltip");
                break;
            case '"':
                document.querySelector(".tab-detect").classList.remove("revealtooltip");
                break;
            case "'":
                document.querySelector(".tab-o2").classList.remove("revealtooltip");
                break;
            case "(":
                document.querySelector(".tab-elec").classList.remove("revealtooltip");
                break;
            case "-":
                document.querySelector(".tab-grav").classList.remove("revealtooltip");
                break;
            case "Tab":
                event.preventDefault()
                document.querySelectorAll(".tab").forEach(function (e) {
                    e.classList.toggle("open");
                    e.classList.toggle("revealtooltip");
                });
                break;
            case "a":
                document.querySelector(".tab-moteurs").classList.toggle("open");
                break;
            case "z":
                document.querySelector(".tab-scan").classList.toggle("open");
                break;
            case "e":
                document.querySelector(".tab-detect").classList.toggle("open");
                break;
            case "r":
                document.querySelector(".tab-o2").classList.toggle("open");
                break;
            case "t":
                document.querySelector(".tab-elec").classList.toggle("open");
                break;
            case "y":
                document.querySelector(".tab-grav").classList.toggle("open");
                break;
            case "ArrowLeft":
                (async function leftKeyPress() {
                    await initialiseleLeftTabs();
                    document.querySelector(".wrapper-menu").classList.toggle("open-but");
                    document.querySelector(".consommable-tab").closest(".consommable-tab").style.animation = null;
                    document.querySelector(".consommable-tab").closest(".consommable-tab").classList.toggle("open-left");
                    document.querySelector(".consommable-tab").closest(".consommable-tab").classList.toggle("close-left");
                    document.querySelector(".left-button").nextElementSibling.firstElementChild.classList.toggle("close-mod-left");
                    document.querySelector(".left-button").nextElementSibling.nextElementSibling.firstElementChild.classList.toggle("close-mod-left");
                    document.querySelector(".left-button").nextElementSibling.firstElementChild.classList.toggle("open-mod-left");
                    document.querySelector(".left-button").nextElementSibling.nextElementSibling.firstElementChild.classList.toggle("open-mod-left");
                    await sleep(2000);
                })();
                break;
            case "ArrowUp":
                document.querySelectorAll(".player-tab").forEach(function (e) {
                    e.classList.toggle("move-up");
                });
                break;
            case "ArrowDown":
                document.querySelectorAll(".expander-item").forEach(function (e) {
                    e.lastElementChild.classList.toggle("itemshow");
                })
                break;
        };
    });
}

(function () {
    initialiseKeyListener();
})();