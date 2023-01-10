function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

let texto2 = "blabla Oxygène blabla planette blabla pollution bla bla ";
let textcl = "blabla Climat blabla planette blabla ouragan bla bla ";
let textff = "blabla Animal blabla planette blabla plante bla bla ";
let textre = "blabla Fer blabla planette blabla diamant bla bla ";
let texteau = "blabla Eau blabla planette blabla boire bla bla ";
let textgr = "blabla Gravité blabla planette blabla pomme bla bla ";

async function write (fulltext, place) {
    let currenttext = ''
    for (let i=0; i<fulltext.length; i++) {
        document.querySelector(place).innerText = currenttext ;
        currenttext +=fulltext.substring(i,i+1)
        await sleep(30)
    }
}

(function() {
    let tree = document.querySelectorAll('.ff-tree')
    let cloud = document.querySelectorAll('.cl-cloud')
    let cloudshadow = document.querySelectorAll('.cloudshadow')
    let mountain = document.querySelectorAll('.re-mountain')
    let mountainstar = document.querySelectorAll('.re-background')
    document.querySelector('.o2-txt').addEventListener('mouseup',function(){
        document.querySelector('#rond1').classList.add('rond1')
        document.querySelector('#rond2').classList.add('rond2')
        document.querySelector('.o2-blur').classList.add('blurring')
        document.querySelector('.o2-line').classList.add('trace-o2-line')
        document.querySelector('.o2-line2').classList.add('trace-o2-line2')
        document.querySelector('.o2-linedot').classList.add('trace-o2-linedot')
        document.querySelector('#reading-1').classList.remove('scanning')
        write(texto2,'#reading-1')
    })
    document.querySelector('.ff-txt').addEventListener('mouseup',function(){
        document.querySelector('.ff-line').classList.add('trace-ff-line')
        document.querySelector('.ff-line2').classList.add('trace-ff-line2')
        document.querySelector('.ff-linedot').classList.add('trace-ff-linedot')
        for (let i=0; i<tree.length; i++) {
            tree.item(i).classList.add('trace-tree'+i);}
        document.querySelector('#reading-3').classList.remove('scanning')
        write(textff,'#reading-3')
    })
    document.querySelector('.cl-txt').addEventListener('mouseup',function(){
        document.querySelector('.cl-line').classList.add('trace-cl-line')
        document.querySelector('.cl-line2').classList.add('trace-cl-line2')
        document.querySelector('.cl-linedot').classList.add('trace-cl-linedot')
        for (let i=0; i<cloud.length; i++) {
            cloud.item(i).classList.add('trace-cloud'+i);}
        for (let i=0; i<cloudshadow.length; i++) {
            cloudshadow.item(i).classList.add('trace-cloudshadow');}
        document.querySelector('#reading-2').classList.remove('scanning')
        write(textcl,'#reading-2')
    })
    document.querySelector('.eau-txt').addEventListener('mouseup',function(){
        document.querySelector('.eau-line').classList.add('trace-eau-line')
        document.querySelector('.eau-line2').classList.add('trace-eau-line2')
        document.querySelector('.eau-linedot').classList.add('trace-eau-linedot')
        document.querySelector('.eau-fill').classList.add('trace-eau-fill')
        document.querySelector('.eau-border').classList.add('trace-eau-border')
        document.querySelector('#reading-5').classList.remove('scanning')
        write(texteau,'#reading-5')
    })
    document.querySelector('.re-txt').addEventListener('mouseup',function(){
        document.querySelector('.re-line').classList.add('trace-re-line')
        document.querySelector('.re-line2').classList.add('trace-re-line2')
        document.querySelector('.re-linedot').classList.add('trace-re-linedot')
        for (let i=0; i<mountain.length; i++) {
            mountain.item(i).classList.add('trace-mountain'+i);}
        for (let i=0; i<mountainstar.length; i++) {
            mountainstar.item(i).classList.add('trace-re-background');}
        document.querySelector('#reading-4').classList.remove('scanning')
        write(textre,'#reading-4')
    })
    document.querySelector('.gr-txt').addEventListener('mouseup',function(){
        document.querySelector('.gr-line').classList.add('trace-gr-line')
        document.querySelector('.gr-line2').classList.add('trace-gr-line2')
        document.querySelector('.gr-linedot').classList.add('trace-gr-linedot')
        document.querySelector('.gr-circle').classList.add('trace-gr-circle')
        document.querySelector('#reading-6').classList.remove('scanning')
        write(textgr,'#reading-6')
    })

})();

(function(){
    let ptabs = document.querySelectorAll('.expander');
    for (let i=0; i<ptabs.length; i++) {
        ptabs.item(i).addEventListener('mouseup', function() {
            this.closest('.player-tab').classList.toggle('move-up')
        })
    }
  })()


  let index = 0,
    interval = 1000;

const rand = (min, max) => 
  Math.floor(Math.random() * (max - min + 1)) + min;

const animate = star => {
  star.style.setProperty("--star-left", `${rand(-10, 100)}%`);
  star.style.setProperty("--star-top", `${rand(-40, 80)}%`);

  star.style.animation = "none";
  star.offsetHeight;
  star.style.animation = "";
}

for(const star of document.getElementsByClassName("magic-star")) {
  setTimeout(() => {
    animate(star);
    
    setInterval(() => animate(star), 2500);
  }, index++ * (interval / 3))
} 

