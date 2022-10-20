var width = 400,
    height = 400,
    timePassed = 0,
    timeLimit = 30;
var fields = [{
  value: timeLimit,
  size: timeLimit,
  update: function() {
    return timePassed = timePassed + 1;
  }
}];

var nilArc = d3.svg.arc()
  .innerRadius(width / 3 - 133)
  .outerRadius(width / 3 - 133)
  .startAngle(0)
  .endAngle(2 * Math.PI);

var arc= d3.svg.arc()
  .innerRadius(width / 3 - 55)
  .outerRadius(width / 3 - 25)
  .startAngle(0)
  .endAngle(function(d) {
    return ((d.value / d.size) * 2 * Math.PI);
  });

var svg = d3.select(".container").append("svg")
  .attr('width', width)
  .attr('height', height);

var field = svg.selectAll('.field')
  .data(fields)
  .enter().append('g')
  .attr("transform", "translate(" + width / 2 + "," + height / 2 + ")")
  .attr('class', "field");

var back = field.append("path")
  .attr("class", "path path--background")
  .attr("d", arc);

var path = field.append("path")
  .attr("class", "path path--foreground");

var label = field.append("text")
  .attr("class", "label")
  .attr("dy", ".35em");

(function update() {
  
  field
    .each(function(d) {
    d.previous = d.value, d.value = d.update(timePassed);
  });
  
  path.transition()
    .ease("elastic")
    .duration(500)
    .attrTween("d", arcTween);
  
  if ((timeLimit - timePassed) <= 10)
    pulseText();
  else
     label
     .text(function(d) {
       return d.size - d.value;
     });
  if (timePassed <= timeLimit)
    setTimeout(update, 1000 - (timePassed % 1000));
  else
    destroyTimer();
})();

function pulseText() {
  back.classed("pulse", true);
  label.classed("pulse", true);
  
  if ((timeLimit - timePassed) >= 0) {
    label.style("font-size", "120px")
      .attr("transform", "translate(0,"+ +4 +")")
      .text(function(d) {
      return d.size - d.value;
    });
  }
  
  label.transition()
    .ease("elastic")
    .duration(900)
    .style("font-size", "90px")
    .attr("transform", "translate(0," + -10 +")");
}

function destroyTimer() {
  label.transition()
    .ease("back")
    .duration(700)
    .style("opacity", "0")
    .style("font-size", "5")
    .attr("transform", "translate(0," + -40 +")")
    .each("end", function() {
      field.selectAll("text").remove()
  });
  
  path.transition()
    .ease("back")
    .duration(700)
    .attr("d", nilArc);
  
  back.transition()
    .ease("back")
    .duration(700)
    .attr("d", nilArc)
    .each("end", function() {
      field.selectAll("path").remove()
  });
}

function arcTween(b) {
  var i = d3.interpolate({
    value: b.previous
  }, b);
  return function(t) {
    return arc(i(t));
  };
}