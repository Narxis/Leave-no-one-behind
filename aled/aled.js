$(document).ready(function () {
    $("#switch").click(function (e) { 
        e.preventDefault();
        $("#panel").toggle("slow");
    });
});