function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
//variables cartes

var texttimeout = "Temps écoulé. lol";
var textprintednbr = 0;
var cardnbrUntilPlanet = 5;
//variables status
let svg_blackout = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 409.6 409.6"><path d="M275.27,146.76a87.17,87.17,0,0,1,19.34,38.92c2.05,9.65-3.72,18-13.37,19.57a15.59,15.59,0,0,1-17.35-10.91c-2.38-7.49-4.7-14.94-9.23-21.52-7.73-11.26-17.91-19.16-30.95-23.31-2.41-.77-4.86-1.44-7.21-2.35a16.09,16.09,0,0,1-10.12-14.94c.08-9.77,8.88-17.54,18.49-15.63C245.21,120.59,261.87,131.08,275.27,146.76ZM157.09,87.47a23.6,23.6,0,0,0,11.3-.06c29.84-7.67,59.1-6.08,88,4.39a200.8,200.8,0,0,1,49.45,26.57,271.5,271.5,0,0,1,66.65,68.9c8,11.86,7.74,25.23-.33,37.09-2.47,3.63-4.91,7.31-7.69,10.7q-9.92,12-20.12,23.81c-4.18,4.82-5.77,10.19-3.87,16.29,3.77,12.12,18.78,15.22,27.54,5.35,9.19-10.36,18.19-20.95,26.4-32.08,5.07-6.88,8.9-14.78,12.53-22.58,2-4.23,2.35-9.21,3.45-13.85V199.17c-.24-1.15-.54-2.29-.72-3.44a64.1,64.1,0,0,0-10.12-25.83c-25.36-37.59-57-68.59-96.18-91.59-35.13-20.61-72.84-31.08-113.84-27-10.55,1-21,3.41-31.38,5.75a15.42,15.42,0,0,0-11.83,14.86C146.09,79.05,150.26,85.68,157.09,87.47ZM401.24,378.59c3.5,3.49,6.13,7.85,9.16,11.81v8a20.92,20.92,0,0,1-12,12h-8c-4-3-8.29-5.69-11.81-9.16C356.69,379.58,335,357.74,313.2,336c-5.49-5.48-5.48-5.47-12.18-1.68-24.39,13.81-50.3,23.06-78.34,25.72-40.26,3.81-77.41-6.16-112.23-25.89A282.29,282.29,0,0,1,37.23,274c-9.12-10.39-17.36-21.59-25.54-32.76C5.37,232.62,2.56,222.44.8,212V199.2a20.94,20.94,0,0,0,.58-2.2c1.56-11.17,6-21.1,12.48-30.3a312.29,312.29,0,0,1,60-64.37c2.65-2.14,2.66-3.17.25-5.55Q41.88,64.82,10,32.59C6.48,29.08,3.83,24.75.8,20.8v-8a21,21,0,0,1,12-12h8c4,3,8.31,5.66,11.81,9.15Q217,194.16,401.24,378.59ZM164.3,247.78C183.18,266.1,212.54,270,234.24,257c-6.64-6.64-13.19-13.26-19.87-19.76a4.38,4.38,0,0,0-3.18-.73c-21.4,2.77-38.42-14.26-35.71-35.71a4.37,4.37,0,0,0-.75-3.18c-6.73-6.92-13.64-13.76-20.56-20.7l0,0A58.87,58.87,0,0,0,164.3,247.78Zm119.85,59.07c-8.22-8.2-16.14-15.92-23.82-23.87-2-2.11-3.34-2-5.65-.52A87.83,87.83,0,0,1,212,296.68c-47.64,3.47-90.54-31.54-96.75-78.87a89.31,89.31,0,0,1,13.66-61.44c1.39-2.19,1.44-3.44-.5-5.33-9-8.74-17.8-17.62-26.59-26.55-1.55-1.58-2.48-1.57-4.21-.2a282.69,282.69,0,0,0-58.72,62.84c-8,11.76-8.09,25.19.1,37.06,25,36.23,56.16,65.79,95.5,86.07,30.55,15.76,62.8,22.31,97.07,16C250,322.92,267.32,316.27,284.15,306.85Z"/></svg>`;
let duration_blackout = 2;
let svg_entraine = `<svg id="Calque_1" data-name="Calque 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440.26 303.15">
<path id="Dumbell" d="M409.61,230.08c-7.17,8-23.92,2.29-34.49,4-.68,40.27,5.58,49.08-40.7,46.56,3.38,29.5-30.25,21.26-48.93,22-9.92-.29-16.15-7.34-16.24-18-.14-16.68,0-33.48,0-50.19H140.42v49c0,12.93-6.48,19.29-19.47,19.31-18.79-.74-48.36,6.34-46-22.07-45.26,2.79-40.52-6.8-40.27-46.58C24,232.34,7.54,238.2,0,230.07V179c7.17-8.07,23.92-2.24,34.49-3.94.52-39.73-5.31-49.35,40.68-46.56-3.38-29.5,30.25-21.25,48.93-22,9.92.3,16.15,7.35,16.24,18,.14,16.68,0,33.48,0,50.19H269.2v-49c0-12.93,6.48-19.29,19.47-19.3,18.79.74,48.35-6.35,46,22.07,45.26-2.79,40.52,6.81,40.27,46.58,10.72,1.74,27.16-4.21,34.71,3.94ZM128.25,204.75V125.36c0-5.59-1.28-6.88-6.74-6.9q-13.79-.06-27.58,0c-5.19,0-6.66,1.49-6.66,6.66V283.91c-2.3,11.91,25.75,5,33.4,6.69,6.59,0,7.58-1,7.58-7.66Q128.26,243.85,128.25,204.75Zm153.12-.21v79.39c0,5.31,1.33,6.65,6.56,6.67q14,.06,28,0c4.94,0,6.44-1.55,6.44-6.48V124.93c2.17-11.58-26.09-4.73-33.63-6.47-6.25,0-7.35,1.12-7.35,7.49Q281.38,165.24,281.37,204.54Zm-12.43-17.1H140.68v34.18H268.94Zm-222,17.07V262c-.93,10.79,13.2,5.24,19.79,6.54,8,0,8.49-.51,8.49-8.28V146.9c.56-10.72-14.17-4.93-20.82-6.33-6.58,0-7.46.84-7.46,7.29q-.06,28.3,0,56.65Zm287.52-.41V262c-.88,10.74,13.23,5.26,19.82,6.54,8,0,8.47-.48,8.47-8.28V166.46c-1.14-23.33,7.14-27.72-21.17-25.88-6.07,0-7.08,1-7.08,7.29q-.08,28.11-.08,56.23ZM12.3,221.7H34.46V187.3H12.3Zm385,0V187.32H375.16V221.7Z"/>
<rect id="Moins" x="278.27" y="59.87" width="162" height="42.26" rx="12"/>
<rect id="Plus" x="338.14" width="42.26" height="162" rx="12"/>
</svg>`;
let svg_affaiblit = `<svg id="Calque_1" data-name="Calque 1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 440.26 303.15">
<path id="Dumbell" d="M409.61,230.08c-7.17,8-23.92,2.29-34.49,4-.68,40.27,5.58,49.08-40.7,46.56,3.38,29.5-30.25,21.26-48.93,22-9.92-.29-16.15-7.34-16.24-18-.14-16.68,0-33.48,0-50.19H140.42v49c0,12.93-6.48,19.29-19.47,19.31-18.79-.74-48.36,6.34-46-22.07-45.26,2.79-40.52-6.8-40.27-46.58C24,232.34,7.54,238.2,0,230.07V179c7.17-8.07,23.92-2.24,34.49-3.94.52-39.73-5.31-49.35,40.68-46.56-3.38-29.5,30.25-21.25,48.93-22,9.92.3,16.15,7.35,16.24,18,.14,16.68,0,33.48,0,50.19H269.2v-49c0-12.93,6.48-19.29,19.47-19.3,18.79.74,48.35-6.35,46,22.07,45.26-2.79,40.52,6.81,40.27,46.58,10.72,1.74,27.16-4.21,34.71,3.94ZM128.25,204.75V125.36c0-5.59-1.28-6.88-6.74-6.9q-13.79-.06-27.58,0c-5.19,0-6.66,1.49-6.66,6.66V283.91c-2.3,11.91,25.75,5,33.4,6.69,6.59,0,7.58-1,7.58-7.66Q128.26,243.85,128.25,204.75Zm153.12-.21v79.39c0,5.31,1.33,6.65,6.56,6.67q14,.06,28,0c4.94,0,6.44-1.55,6.44-6.48V124.93c2.17-11.58-26.09-4.73-33.63-6.47-6.25,0-7.35,1.12-7.35,7.49Q281.38,165.24,281.37,204.54Zm-12.43-17.1H140.68v34.18H268.94Zm-222,17.07V262c-.93,10.79,13.2,5.24,19.79,6.54,8,0,8.49-.51,8.49-8.28V146.9c.56-10.72-14.17-4.93-20.82-6.33-6.58,0-7.46.84-7.46,7.29q-.06,28.3,0,56.65Zm287.52-.41V262c-.88,10.74,13.23,5.26,19.82,6.54,8,0,8.47-.48,8.47-8.28V166.46c-1.14-23.33,7.14-27.72-21.17-25.88-6.07,0-7.08,1-7.08,7.29q-.08,28.11-.08,56.23ZM12.3,221.7H34.46V187.3H12.3Zm385,0V187.32H375.16V221.7Z"/>
<rect id="Moins" x="278.27" y="59.87" width="162" height="42.26" rx="12"/>
</svg>`;
let svg_anticipation = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 385.39 373.65"><path d="M174.43,318.43a7.46,7.46,0,0,0-7.46,7.46v.3a7.37,7.37,0,0,0,7.48,7.26h.37a7.33,7.33,0,0,0,7.07-7.56A7.47,7.47,0,0,0,174.43,318.43Zm-30.61-94.71c-.53-3.72-3.82-5.92-7.59-5.72a7.15,7.15,0,0,0-6.85,6.63c0,2.6,0,5.24,0,7.84a7.13,7.13,0,0,0,6.86,6.62c3.75.2,7-2,7.58-5.74A35.29,35.29,0,0,0,143.82,223.72Zm.05-50.7c-.54-3.93-3.87-6.19-7.8-5.93a7.15,7.15,0,0,0-6.71,6.78c0,2.47-.05,5,0,7.47a7.19,7.19,0,0,0,6.66,6.83c3.84.31,7.29-2,7.84-5.88A34.26,34.26,0,0,0,143.87,173Zm22,22.64c-2.46,0-5,0-7.47,0a7.52,7.52,0,0,0-6.91,7.14,7.36,7.36,0,0,0,6.34,7.61,39.69,39.69,0,0,0,8.58,0,7.42,7.42,0,0,0,6.37-7.6A7.57,7.57,0,0,0,165.89,195.66Zm-51,0c-1.24-.09-2.5,0-3.74,0v0c-1.12,0-2.25-.08-3.37,0a7.5,7.5,0,0,0-7.16,7.26,7.4,7.4,0,0,0,6.8,7.58,42.88,42.88,0,0,0,7.85,0,7.43,7.43,0,0,0-.37-14.8ZM263.7,95.42a31.32,31.32,0,0,0-4.11,0,28.19,28.19,0,0,0-4.11,0,7.31,7.31,0,0,0-6.45,7.47,7.2,7.2,0,0,0,6.63,7.29,46.77,46.77,0,0,0,7.85,0,7.33,7.33,0,0,0,6.69-7.28A7.45,7.45,0,0,0,263.7,95.42Zm-51.35,0a49.49,49.49,0,0,0-7.1,0,7.44,7.44,0,0,0,0,14.87c1.11.07,2.24,0,3.36,0v0c1.25,0,2.5.11,3.74,0a7.43,7.43,0,0,0,0-14.84ZM241.08,123c-.61-3.68-4.22-5.64-8-5.2a7.24,7.24,0,0,0-6.37,6.76c0,2.48,0,5,0,7.47a7.19,7.19,0,0,0,6.32,6.79c3.82.46,7.37-1.43,8-5.13A32.5,32.5,0,0,0,241.08,123Zm0-51c-.63-3.67-4.24-5.6-8-5.12a7.24,7.24,0,0,0-6.3,6.81c-.06,2.47,0,5-.08,7.47a7.22,7.22,0,0,0,6.38,6.73c3.85.43,7.38-1.49,8-5.2A33.06,33.06,0,0,0,241.07,72ZM174.43,318.43a7.46,7.46,0,0,0-7.46,7.46v.3a7.37,7.37,0,0,0,7.48,7.26h.37a7.33,7.33,0,0,0,7.07-7.56A7.47,7.47,0,0,0,174.43,318.43Zm89.27-223a31.32,31.32,0,0,0-4.11,0,28.19,28.19,0,0,0-4.11,0,7.31,7.31,0,0,0-6.45,7.47,7.2,7.2,0,0,0,6.63,7.29,46.77,46.77,0,0,0,7.85,0,7.33,7.33,0,0,0,6.69-7.28A7.45,7.45,0,0,0,263.7,95.42Zm-30.57,22.34a7.24,7.24,0,0,0-6.37,6.76c0,2.48,0,5,0,7.47a7.19,7.19,0,0,0,6.32,6.79c3.82.46,7.37-1.43,8-5.13a32.5,32.5,0,0,0,0-10.69C240.47,119.28,236.86,117.32,233.13,117.76Zm-.06-29.89c3.85.43,7.38-1.49,8-5.2a33.06,33.06,0,0,0,0-10.69c-.63-3.67-4.24-5.6-8-5.12a7.24,7.24,0,0,0-6.3,6.81c-.06,2.47,0,5-.08,7.47A7.22,7.22,0,0,0,233.07,87.87Zm-20.72,7.54a49.49,49.49,0,0,0-7.1,0,7.44,7.44,0,0,0,0,14.87c1.11.07,2.24,0,3.36,0v0c1.25,0,2.5.11,3.74,0a7.43,7.43,0,0,0,0-14.84ZM165.89,195.66c-2.46,0-5,0-7.47,0a7.52,7.52,0,0,0-6.91,7.14,7.36,7.36,0,0,0,6.34,7.61,39.69,39.69,0,0,0,8.58,0,7.42,7.42,0,0,0,6.37-7.6A7.57,7.57,0,0,0,165.89,195.66Zm-29.82-28.57a7.15,7.15,0,0,0-6.71,6.78c0,2.47-.05,5,0,7.47a7.19,7.19,0,0,0,6.66,6.83c3.84.31,7.29-2,7.84-5.88a34.26,34.26,0,0,0,0-9.27C143.33,169.09,140,166.83,136.07,167.09Zm.16,50.91a7.15,7.15,0,0,0-6.85,6.63c0,2.6,0,5.24,0,7.84a7.13,7.13,0,0,0,6.86,6.62c3.75.2,7-2,7.58-5.74a35.29,35.29,0,0,0,0-9.63C143.29,220,140,217.8,136.23,218Zm-21.32-22.35c-1.24-.09-2.5,0-3.74,0v0c-1.12,0-2.25-.08-3.37,0a7.5,7.5,0,0,0-7.16,7.26,7.4,7.4,0,0,0,6.8,7.58,42.88,42.88,0,0,0,7.85,0,7.43,7.43,0,0,0-.37-14.8ZM263.7,95.42a31.32,31.32,0,0,0-4.11,0,28.19,28.19,0,0,0-4.11,0,7.31,7.31,0,0,0-6.45,7.47,7.2,7.2,0,0,0,6.63,7.29,46.77,46.77,0,0,0,7.85,0,7.33,7.33,0,0,0,6.69-7.28A7.45,7.45,0,0,0,263.7,95.42Zm-30.57,22.34a7.24,7.24,0,0,0-6.37,6.76c0,2.48,0,5,0,7.47a7.19,7.19,0,0,0,6.32,6.79c3.82.46,7.37-1.43,8-5.13a32.5,32.5,0,0,0,0-10.69C240.47,119.28,236.86,117.32,233.13,117.76Zm-.06-29.89c3.85.43,7.38-1.49,8-5.2a33.06,33.06,0,0,0,0-10.69c-.63-3.67-4.24-5.6-8-5.12a7.24,7.24,0,0,0-6.3,6.81c-.06,2.47,0,5-.08,7.47A7.22,7.22,0,0,0,233.07,87.87Zm-20.72,7.54a49.49,49.49,0,0,0-7.1,0,7.44,7.44,0,0,0,0,14.87c1.11.07,2.24,0,3.36,0v0c1.25,0,2.5.11,3.74,0a7.43,7.43,0,0,0,0-14.84Zm-37.92,223a7.46,7.46,0,0,0-7.46,7.46v.3a7.37,7.37,0,0,0,7.48,7.26h.37a7.33,7.33,0,0,0,7.07-7.56A7.47,7.47,0,0,0,174.43,318.43ZM172.8,202.8a7.57,7.57,0,0,0-6.91-7.14c-2.46,0-5,0-7.47,0a7.52,7.52,0,0,0-6.91,7.14,7.36,7.36,0,0,0,6.34,7.61,39.69,39.69,0,0,0,8.58,0A7.42,7.42,0,0,0,172.8,202.8Zm-36.73-35.71a7.15,7.15,0,0,0-6.71,6.78c0,2.47-.05,5,0,7.47a7.19,7.19,0,0,0,6.66,6.83c3.84.31,7.29-2,7.84-5.88a34.26,34.26,0,0,0,0-9.27C143.33,169.09,140,166.83,136.07,167.09Zm.16,50.91a7.15,7.15,0,0,0-6.85,6.63c0,2.6,0,5.24,0,7.84a7.13,7.13,0,0,0,6.86,6.62c3.75.2,7-2,7.58-5.74a35.29,35.29,0,0,0,0-9.63C143.29,220,140,217.8,136.23,218Zm-21.32-22.35c-1.24-.09-2.5,0-3.74,0v0c-1.12,0-2.25-.08-3.37,0a7.5,7.5,0,0,0-7.16,7.26,7.4,7.4,0,0,0,6.8,7.58,42.88,42.88,0,0,0,7.85,0,7.43,7.43,0,0,0-.37-14.8Zm262.77-8.78c-6.15-3.3-12.3-6.66-18.3-10.16a10.37,10.37,0,0,1-3.62-3.53c-3.5-6-6.84-12.16-10.11-18.32a13,13,0,0,1-1.35-4.56,167.47,167.47,0,0,0-12.51-49.05A164.89,164.89,0,0,0,151.88,3.42,162.19,162.19,0,0,0,78.26,36.23l-3,2.23c-.73-1.27-1.29-2.21-1.84-3.21-1.87-3.37-3.65-6.84-5.65-10.11-3.25-5.12-9.6-5.08-12.94,0a29,29,0,0,0-1.65,2.93c-4.09,7.42-8.25,14.82-12.25,22.27a9,9,0,0,1-3.86,3.86C29,58.6,20.93,63.12,12.88,67.54,10,69.09,8.2,71.25,8.23,74.62s1.94,5.47,4.76,7Q21,86,29,90.46c4.29,2.38,3.52,1.72,1.79,5.47C15.89,128.29,11.53,162,18.18,197a162.34,162.34,0,0,0,37.67,77.58c.63.72,1.19,1.5,2.09,2.64-1.71.07-2.9.18-4.1.18a27.73,27.73,0,0,0-27,23c-.78,4.62-.5,9.43-.63,14.16-.12,4.46.53,4.09-3.94,4.09-4.24,0-8.48-.14-12.72,0-4.89.16-8,3-8,7.59q-.17,20,0,40c0,4.51,3.07,7.35,7.59,7.58H219.48c39.54,0,79.08-.07,118.61.08,5.62,0,9.52-3.2,9.38-9.38q-.39-18.34,0-36.66c.12-5.84-3.38-9.61-9.45-9.33-3.74.14-7.49,0-11.23,0-4.72,0-4.1.35-4.1-4.29v-9a28.15,28.15,0,0,0-18-26.09c-1-.41-2-.86-3.26-1.41a168.15,168.15,0,0,0,27.67-40.86,15.5,15.5,0,0,1,1.13,1.39c.34.51.62,1.08,1,1.56a7,7,0,0,0,1.62,1.6,7.36,7.36,0,0,0,10.29-1.66,18.49,18.49,0,0,0,1.54-2.56c3.57-6.42,7.19-12.83,10.65-19.31a10.13,10.13,0,0,1,4.34-4.4c6-3.22,12-6.65,18-9.89,2.75-1.48,5.3-3.11,7.08-5.75v-5.24C383,190,380.43,188.35,377.68,186.87ZM31.48,74.76a25.82,25.82,0,0,1,2.34-1.7c4.45-2.5,8.89-5,13.4-7.39a12.05,12.05,0,0,0,5.19-5.17c2.76-5.14,5.66-10.23,8.66-15.69a17.13,17.13,0,0,1,1.64,2.07c2.37,4.23,4.78,8.44,7,12.76a14.23,14.23,0,0,0,6.44,6.46c4.21,2.15,8.3,4.53,12.43,6.83.85.47,1.64,1,2.72,1.75-5.5,3-10.68,6-15.92,8.79a12.08,12.08,0,0,0-5.17,5.18c-2.31,4.41-4.79,8.72-7.22,13.07-.47.82-1,1.62-1.78,2.82-2.8-5-5.55-9.58-7.9-14.33a16.45,16.45,0,0,0-7.74-7.71C40.91,80.16,36.41,77.49,31.48,74.76ZM307.54,304.38c.22,4,0,8,.1,12,0,1.6-.52,2.29-2.14,2.16-1-.07-2,0-3,0H211.18A21.45,21.45,0,0,0,206,319a7.34,7.34,0,0,0,1.31,14.39c1.36.08,2.74.08,4.12.08H327.87c5.15,0,4.54-.59,4.54,4.62,0,6.11-.08,12.23,0,18.34,0,1.74-.45,2.57-2.3,2.37a25,25,0,0,0-3,0H174.41q-76.71,0-153.44,0c-5.22,0-4.49.7-4.49-4.6-.05-5.86,0-11.73,0-17.59.05-3.06.05-3.11,3.05-3.11H137.44c1.37,0,2.75.05,4.11-.08a7.34,7.34,0,0,0,1.3-14.4,21,21,0,0,0-5.18-.47H45.6c-5.07,0-4.34.49-4.4-4.36-.06-3-.11-6,0-9a13.15,13.15,0,0,1,12.88-13H291.7a33.63,33.63,0,0,1,4.49.12A13.07,13.07,0,0,1,307.54,304.38Zm11.23-81a156,156,0,0,1-35.65,51.67,7.44,7.44,0,0,1-5.63,2.18q-97.29-.09-194.6,0a7.82,7.82,0,0,1-5.91-2.4c-23.34-22.48-38.17-49.56-44.17-81.43C27.27,164,30.56,135.39,42,107.71c.46-1.12,1-2.2,1.74-3.71,3.66,6.61,7.12,12.81,10.55,19,1.71,3.15,4.13,4.92,7.84,4.6,3.06-.26,4.89-2.11,6.29-4.67,4.32-7.86,8.76-15.66,13-23.57A10.84,10.84,0,0,1,86,94.73c7.39-4,14.8-8.16,22.17-12.25a26.52,26.52,0,0,0,3.19-1.93,7.31,7.31,0,0,0,.08-11.88,28.74,28.74,0,0,0-3.84-2.31L85.69,54.23c-1-.54-1.87-1.15-3.26-2,2-1.68,3.66-3.14,5.41-4.48a149,149,0,0,1,80-31.21c71.23-6,137.23,40.07,156.52,109,2.28,8.12,3.29,16.59,4.88,24.91a7.9,7.9,0,0,1-1.15,5.68c-3.21,5.51-6.21,11.08-9.21,16.69a9.66,9.66,0,0,1-4.11,4.14c-6.8,3.66-13.52,7.47-20.3,11.17-2.29,1.26-4.08,2.88-4.68,5.51-.79,3.47.74,6.51,4.46,8.6,6.73,3.78,13.53,7.46,20.27,11.23a10.71,10.71,0,0,1,3.25,2.41A6.77,6.77,0,0,1,318.77,223.42Zm30.56-21.26a11.85,11.85,0,0,0-5.18,5.16c-2.18,4.06-4.49,8-7,12.54-2.28-4.13-4.45-7.85-6.4-11.68a14.21,14.21,0,0,0-6.44-6.47c-3.84-1.94-7.56-4.13-11.72-6.43,4.48-2.48,8.43-4.78,12.48-6.93a12,12,0,0,0,5.17-5.17c2.15-4.05,4.44-8,6.93-12.5v0c2.56,4.6,4.83,8.58,7.05,12.7a11.47,11.47,0,0,0,4.9,4.92c4.14,2.18,8.21,4.52,12.65,7C357.33,197.72,353.38,200,349.33,202.16Z"/></svg>`;
let duration_anticipation = 5;
let statusNameList = ['blackout', 'entrainé', 'affaiblit', 'anticipation']//liste des status possible
let statusSvgList = [svg_blackout, svg_entraine, svg_affaiblit, svg_anticipation]
var statusDurationList = [duration_blackout, cardnbrUntilPlanet, cardnbrUntilPlanet, duration_anticipation]
var statusList = []; //status present dans le html 
var statusListLength = statusList.length;
var statushtml = document.querySelector(".status");
//html bouton suivant
var nextbuttonhtml = `<button class="next-button choice move-down" id="next1">Continuer votre chemin</button>`;
//TODO remove test ternary at the end of the dev
var nextbuttonhtml2 = `<a href="`+(location.href.endsWith('/next') ? '/next' : '/template-planet')+`"><button class="next-button choice move-down" id="next2">Aller dans la salle des scanners</button></a>`;


function updatestatus() {
    statusDurationList = [duration_blackout, cardnbrUntilPlanet, cardnbrUntilPlanet, duration_anticipation] //updates to new cardnbrUntilPlanet value
    let currentStatus = document.querySelectorAll('.status-duration')
    for (let i = 0; i < currentStatus.length; i++) {
        let oldVal = parseInt(currentStatus.item(i).innerHTML)
        currentStatus.item(i).innerHTML = String(oldVal - 1)
        if (oldVal == 1) {
            currentStatus.item(i).closest('.status-line').remove()//removes status if it's duration is 0
        }
    }
}

async function initialiseChoiceTabs() {
    var choice = document.getElementById('choicetab');
    var choiceTabs = choice.getElementsByClassName('choice');

    for (let i = 0; i < choiceTabs.length; i++) {
        choiceTabs.item(i).classList.remove('move-down');
        await sleep(150);
    }
}

async function initialiseModTabs() {
    var mod = document.getElementById('modtab');
    var modTabs = mod.getElementsByClassName('tab');

    for (let i = 0; i < modTabs.length; i++) {
        await sleep(100);
        modTabs.item(i).classList.remove('move-right');
    }
}

async function initialiseTimerTab() {
    var timerTab = document.getElementsByClassName('timertab');
    console.log(timerTab.tagName);

    for (let i = 0; i < timerTab.length; i++) {
        await sleep(100);
        timerTab.item(i).classList.remove('rotate-90');
        await sleep(31000)
        timerTab.item(i).classList.add('rotate-90');
    }

}

async function initialisePlayerTab() {
    var playerTab = document.querySelectorAll('.player-tab');
    for (let i = 0; i < playerTab.length; i++) {
        playerTab.item(i).classList.remove('load-in');
        await sleep(100)
    }
}

function eventchoices() {
    var choice = document.getElementById('choicetab');
    var choiceTabs = choice.getElementsByClassName('choice');
    for (let i = 0; i < choiceTabs.length; i++) {
        document.querySelector('#choice' + String(i)).addEventListener('mouseup', async function () {
            document.querySelector('.card-text').classList.toggle('invisibility')
            document.querySelector('.answer' + (i + 1)).classList.toggle('visibility')
            for (let k = 0; k < choiceTabs.length; k++) {
                choiceTabs.item(k).disabled = 'true'
                choiceTabs.item(k).classList.add('move-down');
                choiceTabs.item(k).classList.remove('choice-hover')
            }
            await sleep(1200)
            write(answerlist[i], '.answer' + (i + 1))
        })
        document.querySelector('#choice' + String(i)).addEventListener('mouseover', function () {
            this.classList.add('choice-hover')
        })
        document.querySelector('#choice' + String(i)).addEventListener('mouseleave', function () {
            this.classList.remove('choice-hover')
        })
    }
};

async function nextoption() {
    if (textprintednbr === 1) {
        for (let i = 0; i < choicelist.length; i++) {
            let choiceshtml = `<button class="choice move-down" id="choice${i}"></button>`
            document.querySelector('.choices').innerHTML += choiceshtml
            document.querySelector('#choice' + String(i)).innerHTML = choicelist[i]
        }
        await sleep(500)
        initialiseChoiceTabs()
        eventchoices()
    }
    if (textprintednbr === 2) {
        document.querySelector('.choices').innerHTML = nextbuttonhtml
        await sleep(100)//ça marche pas sans on pose pas de question
        document.querySelector('.choice').classList.remove('move-down')
        initialiseNextButton()

    }
    if (textprintednbr === 3) {
        document.querySelector('.choices').innerHTML = nextbuttonhtml2
        await sleep(100)//ça marche pas sans on pose pas de question
        document.querySelector('.choice').classList.remove('move-down')
        initialiseNextButton()
    }
}

async function write(fulltext, place) {
    let currenttext = ''
    for (let i = 0; i <= fulltext.length; i++) {
        document.querySelector(place).innerText = currenttext;
        currenttext += fulltext.substring(i, i + 1)
        await sleep(30)
    }
    textprintednbr += 1;
    nextoption();
}

async function getNextCard (pop=false) {
    const rawResponse = await fetch('/api/'+(pop ? 'pop' : 'get')+'NextCard', {
        method: 'GET',
        headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
        },
    });
    return JSON.parse(await rawResponse.text());
}

async function initialiseNextButton() {

    document.querySelector('.next-button').addEventListener('mouseover', function () {
        this.classList.add('choice-hover')
    })
    document.querySelector('.next-button').addEventListener('mouseleave', function () {
        this.classList.remove('choice-hover')
    })
    document.querySelector('#next1').addEventListener('mouseup', async function () {

        let nextCard = await getNextCard();

        if (nextCard.type === 0) {
            console.log("NEXT IS PLANET");
            //hide text animation and 'next-button'
            document.querySelector('.next-button').disabled = 'true'
            document.querySelector('.next-button').classList.add('move-down')
            document.querySelector('.next-button').classList.remove('choice-hover')
            document.querySelector('.card-text').classList.remove('visibility')
            document.querySelector('.answer1').classList.remove('visibility')
            document.querySelector('.answer2').classList.remove('visibility')
            document.querySelector('.answer3').classList.remove('visibility')
            document.querySelector('.card-text').classList.add('invisibility')
            document.querySelector('.answer1').classList.add('invisibility')
            document.querySelector('.answer2').classList.add('invisibility')
            document.querySelector('.answer3').classList.add('invisibility')
            await sleep(1000)
            //clear text and move next button
            document.querySelector('.card-text').innerHTML = ""
            document.querySelector('.answer1').innerHTML = ""
            document.querySelector('.answer2').innerHTML = ""
            document.querySelector('.answer3').innerHTML = ""
            document.querySelector('.choices').innerHTML = ""
            //ready to show new text
            document.querySelector('.card-text').classList.remove('invisibility')
            document.querySelector('.answer1').classList.remove('invisibility')
            document.querySelector('.answer2').classList.remove('invisibility')
            document.querySelector('.answer3').classList.remove('invisibility')
            //new text
            let textPlanetEncounter = "Votre vaisseau est entrée dans l'orbite d'une planète, allez dans la salle des scanners pour voir les informations sur cette planète ";
            updatestatus();
            write(textPlanetEncounter, '.card-text');
        }
        else {
            let nextCard = await getNextCard(true);
            //hide text animation and 'next-button'
            document.querySelector('.next-button').disabled = 'true'
            document.querySelector('.next-button').classList.add('move-down')
            document.querySelector('.next-button').classList.remove('choice-hover')
            document.querySelector('.card-text').classList.remove('visibility')
            document.querySelector('.answer1').classList.remove('visibility')
            document.querySelector('.answer2').classList.remove('visibility')
            document.querySelector('.answer3').classList.remove('visibility')
            document.querySelector('.card-text').classList.add('invisibility')
            document.querySelector('.answer1').classList.add('invisibility')
            document.querySelector('.answer2').classList.add('invisibility')
            document.querySelector('.answer3').classList.add('invisibility')
            await sleep(1000)
            //clear text and move next button
            document.querySelector('.card-text').innerHTML = ""
            document.querySelector('.answer1').innerHTML = ""
            document.querySelector('.answer2').innerHTML = ""
            document.querySelector('.answer3').innerHTML = ""
            document.querySelector('.choices').innerHTML = ""

            //ready to show new text
            document.querySelector('.card-text').classList.remove('invisibility')
            document.querySelector('.answer1').classList.remove('invisibility')
            document.querySelector('.answer2').classList.remove('invisibility')
            document.querySelector('.answer3').classList.remove('invisibility')
            //set up new text
            cardtextstr = nextCard.desc;
            choicelist = nextCard.choices.map(v => v.value);
            answerlist = nextCard.choices.map(v => v.reveal);
            // answer1str = "Vous donnez la bouteille à la douane qui vous laisse passer. ";
            // answer2str = "La douane est térrifiée à l'idée de devoir gagner au tribunal contre une Nek'air et vous laissent passer. ";
            // answer3str = "Vous donnez tous vos consommables aux douanniers, ils vous laissent continuer votre route. ";
            textprintednbr = 0;
            cardnbrUntilPlanet -= 1;
            updatestatus();
            write(cardtextstr, '.card-text')
        }
    })
}

async function initialiseleLeftTabs() {
    var consommableTabVar = document.getElementsByClassName('consommable-tab');
    var todoListVar = document.getElementsByClassName('todoList');
    var modsLeftVar = document.getElementsByClassName('mods-left');
    await sleep(1000);
    consommableTabVar.item(0).classList.remove('slide-right');
    todoListVar.item(0).classList.remove('hidden');
    modsLeftVar.item(0).classList.remove('hidden');
}


const addstatus = (statusname) => {
    let index = statusNameList.findIndex(e => e === statusname)
    let svg = statusSvgList[index];
    let duration = statusDurationList[index];
    const html = ` <div class="status-line" id="line_${statusListLength}">
                        ${svg}
                        <div class="status-name">${statusname}</div>
                        <div class="status-duration">${duration}</div>
                    </div>`;
    statushtml.innerHTML += html
    statusList.push(String(statusname))
}

function applystatus(statusname) {
    if (!statusList.includes(String(statusname))) {
        statusListLength += 1;
        addstatus(statusname);
    }
    else {
        let index = statusNameList.findIndex(e => e === statusname)
        let duration = statusDurationList[index];
        let lineindex = statusList.findIndex(e => e === statusname)
        let selector = '#line_' + String(lineindex + 1)
        document.querySelector(selector).firstElementChild.nextElementSibling.nextElementSibling.innerHTML = String(duration)
    }
};






// EXECUTION AU CHARGEMENT DE LA PAGE
(function(){
    initialiseChoiceTabs();
    initialiseModTabs();
    initialiseTimerTab();
    initialisePlayerTab();
    write(cardtextstr, '.card-text');
    initialiseleLeftTabs();
})();