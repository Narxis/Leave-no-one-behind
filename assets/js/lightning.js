var c = document.getElementById("canvas");
var ctx = c.getContext("2d");
var cWidth = c.offsetWidth;
var cHeight = c.offsetHeight;
var glow = 5;
var dlt = 5;
var max = 10;
var lines = [
  {x:0, y:cHeight/2},
  {x:100, y:cHeight/2},
  {x:100, y:cHeight/2}, 
  {x:100, y:cHeight/2}, 
  {x:100, y:cHeight/2}, 
  {x:100, y:cHeight/2},
  {x:100, y:cHeight/2},
  {x:100, y:cHeight/2}, 
  {x:100, y:cHeight/2},
  {x:100, y:cHeight/2}, 
  {x:100, y:cHeight/2}, 
  {x:100, y:cHeight/2}, 
  {x:100, y:cHeight/2}
];

function doSpasme (){

  ctx.clearRect(0,0,cWidth,cHeight)
 ctx.strokeStyle = '#00ff00';
      ctx.shadowColor = '#ffffff';
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0
      ;
 
        ctx.shadowBlur =  glow;
      ctx.lineWidth = 1;
  ctx.beginPath();

lines.forEach(function(entry, index){
 var randomNumber = Math.floor(Math.random() * 101) - 50
  

  if (index === 0 || index === (lines.length - 1) ){
      ctx.lineTo(entry.x * (index * 0.5) , entry.y );

    
  }else{
      ctx.lineTo(entry.x * (index * 0.5) , randomNumber + entry.y );
  ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffffff';


  }
        ctx.stroke();


})
  
glow += dlt
if(glow <= 0 || glow >= max) dlt = -dlt;

  ctx.stroke();
  
}
setInterval(doSpasme, 50);
