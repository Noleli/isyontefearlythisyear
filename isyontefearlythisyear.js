"use strict";

let outerWidth, outerHeight,
    width, height;

let margin = { top: 0, right: 0, bottom: 0, left: 0 };

let svg = d3.select("#vis-container").append("svg");
let g = svg.append("g").attr("transform", "translate(" + margin.left + ", " + margin.top + ")");

d3.json("agg_data.json").then(dataCallback);

let x = d3.scalePoint()
    .domain(makeDateRange());

let aggData, byEvent;
function dataCallback(data) {
    aggData = data;
    aggData.forEach(d => d.date = d.month + "-" + d.day);

    byEvent = d3.nest()
        .key(d => d.event)
        .map(aggData);
}

function update() {

}

function size() {
    outerWidth = window.innerWidth,
    outerHeight = window.innerHeight;

    width = outerWidth - margin.left - margin.right,
    height = outerHeight - margin.top - margin.bottom;

    x.range([0, width]);
    svg.attr("width", outerWidth).attr("height", outerHeight);

    update();
}
size();

function makeDateRange(start, stop) {
    let startMonth, startDay,
        stopMonth, stopDay;
    if(start) {
        startMonth = +start.split("-")[0] - 1,
        startDay = +start.split("-")[1];
    }
    else {
        startMonth = 0,
        startDay = 1;
    }

    if(stop) {
        stopMonth = +stop.split("-")[0] - 1,
        stopDay = +stop.split("-")[1] + 1; // this function should be inclusive, so add 1 to stop
    }
    else {
        stopMonth = 11,
        stopDay = 32;
    }
    // pick a gregorian leap year (2016) and use D3 to do the hard work
    let range = d3.utcDay.range(Date.UTC(2016, startMonth, startDay), Date.UTC(2016, stopMonth, stopDay));

    // scale domains have to be numeric or strings, so using m-d strings (no leading zeros)
    return range.map(d => (d.getUTCMonth() + 1) + "-" + d.getUTCDate());
}
