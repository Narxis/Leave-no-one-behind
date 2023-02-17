async function initialiseKeyListener() {
    document.addEventListener("keydown", (event) => {
        if (event.defaultPrevented) {
            return;
        };
        switch (event.key) {
            case "a":
                document.querySelectorAll(".tab").forEach(function (e) {
                    e.classList.add("revealtooltip");
                });
                break;
        };
    });
    document.addEventListener("keyup", (event) => {
        if (event.defaultPrevented) {
            return;
        };
        switch (event.key) {
            case "a":
                document.querySelectorAll(".tab").forEach(function (e) {
                    e.classList.remove("revealtooltip");
                });
                break;
            case "ArrowRight":
                document.querySelectorAll(".tab").forEach(function (e) {
                    e.classList.toggle("open");
                });
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
            case "Escape":
                document.getElementById("navBtn").click();
        };
    });
}