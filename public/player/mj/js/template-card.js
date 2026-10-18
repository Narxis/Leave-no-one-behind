// Généré par scripts/player-assets.js : ne pas modifier à la main
class parallaxTiltEffect {
  constructor({ element, tiltEffect }) {
    this.element = element;
    this.container = this.element.querySelector(".container-card");
    this.size = [778, 498];
    [this.w, this.h] = this.size;

    this.tiltEffect = tiltEffect;
    this.mouseOnComponent = false;
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseEnter = this.handleMouseEnter.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.defaultStates = this.defaultStates.bind(this);
    this.setProperty = this.setProperty.bind(this);
    this.init = this.init.bind(this);
    this.init();
  }
  handleMouseMove(event) {
    // Position relative à la carte elle-même : offsetX/offsetY dépendaient
    // de l'élément survolé (bouton, texte...) et faisaient sauter le fond
    const rect = this.element.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    let X;
    let Y;

    if (this.tiltEffect == "reverse") {
      X = (offsetX - this.w / 2) / 3 / 3;
      Y = -(offsetY - this.h / 2) / 3 / 3;
    } else if (this.tiltEffect == "normal") {
      X = -(offsetX - this.w / 2) / 3 / 3;
      Y = (offsetY - this.h / 2) / 3 / 3;
    }

    this.setProperty("--rY", X.toFixed(2));
    this.setProperty("--rX", Y.toFixed(2));

    this.setProperty("--bY", 80 - (X / 4).toFixed(2) + "%");
    this.setProperty("--bX", 80 - (Y / 4).toFixed(2) + "%");
  }
  handleMouseEnter() {
    this.mouseOnComponent = true;
    this.container.classList.add("container-card--active");
  }
  handleMouseLeave() {
    this.mouseOnComponent = false;
    this.defaultStates();
  }
  defaultStates() {
    this.container.classList.remove("container-card--active");
    this.setProperty("--rY", 0);
    this.setProperty("--rX", 0);
    this.setProperty("--bY", "79%");
    this.setProperty("--bX", "88%");
  }

  setProperty(p, v) {
    return this.container.style.setProperty(p, v);
  }

  init() {
    this.element.addEventListener("mousemove", this.handleMouseMove);
    this.element.addEventListener("mouseenter", this.handleMouseEnter);
    this.element.addEventListener("mouseleave", this.handleMouseLeave);
  }
}
const $ = (e) => document.querySelector(e);

const wrap1 = new parallaxTiltEffect({
  element: $(".wrap--1"),
  tiltEffect: "reverse"
});
// const wrap2 = new parallaxTiltEffect({
//   element: $(".wrap--2"),
//   tiltEffect: "normal"
// });
// const wrap3 = new parallaxTiltEffect({
//   element: $(".wrap--3"),
//   tiltEffect: "reverse"
// });