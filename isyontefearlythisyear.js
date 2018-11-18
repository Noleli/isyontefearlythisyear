"use strict";

let outerWidth, outerHeight,
    width, height;

let margin = { top: 20, right: 12, bottom: 20, left: 12 };

let svg = d3.select("#vis-container").append("svg");
let g = svg.append("g").attr("transform", "translate(" + margin.left + ", " + margin.top + ")");

let mainG = g.append("g");
let overlayG = mainG.append("g").attr("class", "overlays");

let xAxisG = g.append("g");

Promise.all([
    d3.json("agg_data.json"),
    d3.json("data.json")
]).then(dataCallback);

let thisYear = new Date().getFullYear();

let x = d3.scalePoint()
    .domain(makeDateRange());

let xAxis = d3.axisBottom(x)
    .tickValues(["1-1", "2-1", "3-1", "4-1", "5-1", "6-1", "7-1", "8-1", "9-1", "10-1", "11-1", "12-1"]);

let histY = d3.scaleLinear();

let histLine = d3.line()
    .x(d => x(d.date))
    .y(d => histY(d.count));

let aggData, byEvent, rawData;
function dataCallback(data) {
    aggData = data[0];
    rawData = data[1];

    let totalYears = d3.sum(aggData.filter(d => d.event == aggData[0].event), d => d.count);

    aggData.forEach(d => {
        d.date = d.month + "-" + d.day;
        d.freq = d.count/totalYears;
    });

    rawData.forEach(d => {
        d.date = d.month + "-" + d.day;
    });

    byEvent = d3.nest()
        .key(d => d.event)
        .map(aggData);

    histY.domain([0, d3.max(aggData, d => d.count)]);

    update();
    updateYearLine(thisYear);
}

function update() {
    let events = mainG.selectAll(".event").data(byEvent.values());
    events.exit().remove();
    let eventsEnter = events.enter().append("g").attr("class", "event");
    eventsEnter.append("path").attr("class", "hist");
    eventsEnter.append("text").attr("class", "eventLabel").text(d => d[0].event);
    events = eventsEnter.merge(events);

    events.selectAll("path.hist").attr("d", histLine);
    events.selectAll("text.eventLabel")
        .attr("x", d => x(d[0].date));

    xAxisG.call(xAxis);
}

function updateYearLine(year) {
    let yearLines = overlayG.selectAll("g.yearLine").data(rawData.filter(d => d.year == year));
    yearLines.exit().remove();
    let ylEnter = yearLines.enter().append("g").attr("class", "yearLine");
    ylEnter.append("line")
        .attr("y1", 0).attr("y2", height);
    yearLines = ylEnter.merge(yearLines);
    yearLines.attr("transform", d => "translate(" + x(d.date) + ")");
}

function size() {
    outerWidth = window.innerWidth,
    outerHeight = window.innerHeight;

    width = outerWidth - margin.left - margin.right,
    height = outerHeight - margin.top - margin.bottom;

    x.range([0, width]);
    histY.range([height, 0]);
    svg.attr("width", outerWidth).attr("height", outerHeight);

    xAxisG.attr("transform", "translate(0, " + height + ")");
}
size();
d3.select(window).on("resize", () => {
    size();
    update();
    updateYearLine(thisYear);
});

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
