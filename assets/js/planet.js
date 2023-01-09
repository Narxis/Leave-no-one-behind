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
    })
    document.querySelector('.ff-txt').addEventListener('mouseup',function(){
        document.querySelector('.ff-line').classList.add('trace-ff-line')
        document.querySelector('.ff-line2').classList.add('trace-ff-line2')
        document.querySelector('.ff-linedot').classList.add('trace-ff-linedot')
        for (let i=0; i<tree.length; i++) {
            tree.item(i).classList.add('trace-tree'+i);}
    })
    document.querySelector('.cl-txt').addEventListener('mouseup',function(){
        document.querySelector('.cl-line').classList.add('trace-cl-line')
        document.querySelector('.cl-line2').classList.add('trace-cl-line2')
        document.querySelector('.cl-linedot').classList.add('trace-cl-linedot')
        for (let i=0; i<cloud.length; i++) {
            cloud.item(i).classList.add('trace-cloud'+i);}
        for (let i=0; i<cloudshadow.length; i++) {
            cloudshadow.item(i).classList.add('trace-cloudshadow');}
    })
    document.querySelector('.eau-txt').addEventListener('mouseup',function(){
        document.querySelector('.eau-line').classList.add('trace-eau-line')
        document.querySelector('.eau-line2').classList.add('trace-eau-line2')
        document.querySelector('.eau-linedot').classList.add('trace-eau-linedot')
        document.querySelector('.eau-fill').classList.add('trace-eau-fill')
        document.querySelector('.eau-border').classList.add('trace-eau-border')
    })
    document.querySelector('.re-txt').addEventListener('mouseup',function(){
        document.querySelector('.re-line').classList.add('trace-re-line')
        document.querySelector('.re-line2').classList.add('trace-re-line2')
        document.querySelector('.re-linedot').classList.add('trace-re-linedot')
        for (let i=0; i<mountain.length; i++) {
            mountain.item(i).classList.add('trace-mountain'+i);}
        for (let i=0; i<mountainstar.length; i++) {
            mountainstar.item(i).classList.add('trace-re-background');}
    })
    document.querySelector('.gr-txt').addEventListener('mouseup',function(){
        document.querySelector('.gr-line').classList.add('trace-gr-line')
        document.querySelector('.gr-line2').classList.add('trace-gr-line2')
        document.querySelector('.gr-linedot').classList.add('trace-gr-linedot')
        document.querySelector('.gr-circle').classList.add('trace-gr-circle')
    })

})()