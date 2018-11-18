"use strict";

let outerWidth, outerHeight,
    width, height;

let margin = { top: 20, right: 12, bottom: 20, left: 12 };

let container = d3.select("#vis-container");

let thisYear = new Date().getFullYear();

let x = d3.local();
let xAxis = d3.local();
let histY = d3.scaleLinear();
let histLine = d3.local();

d3.json("data.json").then(dataCallback);

let aggData, rawData;
function dataCallback(data) {
    rawData = data;

    let totalYears = (new Set(rawData.map(d => d.year))).size;
    
    rawData.forEach(d => {
        d.date = d.month + "-" + d.day;
    });
    rawData = rawData.sort((a, b) => {
        return a.month == b.month ? d3.ascending(a.day, b.day) : d3.ascending(a.month, b.month);
    });

    aggData = d3.nest()
        .key(d => d.event)
        .key(d => d.date)
        // .sortValues((a, b) => a.month == b.month ? d3.ascending(a.day, b.day) : d3.ascending(a.month, b.month))
        .rollup(d => { return { event: d[0].event, date: d[0].date, count: d.length, freq: d.length/totalYears } })
        .map(rawData);

    histY.domain([0, d3.max(aggData.values().map(d => d3.max(d.values(), dd => dd.count)))]);

    update();
}

function update() {
    let events = container.selectAll(".event").data(aggData.entries(), d => d.key);
    events.exit().remove();
    let eventsEnter = events.enter().append("div").attr("class", "event");

    let label = eventsEnter.append("h2").text(d => d.key);
    let svg = eventsEnter.append("svg");
    let g = svg.append("g").attr("transform", "translate(" + margin.left + ", " + margin.top + ")");
    let mainG = g.append("g");
    let overlayG = mainG.append("g").attr("class", "overlays");
    let xAxisG = g.append("g").attr("class", "xAxis");
    let path = mainG.append("path").attr("class", "hist");

    eventsEnter.each(function(d) {
        histLine.set(this, d3.line()
            .x(d => x.get(this)(d.date))
            .y(d => histY(d.count)));

        xAxis.set(this, d3.axisBottom());
    });

    if(eventsEnter.nodes().length > 0) size();

    events = eventsEnter.merge(events);

    events.each(function(d) {
        let dates = d.value.values().map(dd => dd.date);
        x.set(this, d3.scalePoint().domain(makeDateRange(dates[0], dates[dates.length-1])).range([0, width]));
        d3.select(this).select(".xAxis").call(xAxis.get(this).scale(x.get(this)));
    });

    events.select("path.hist").attr("d", function(d) { return histLine.get(this)(d.value.values()) });

    // let yearLines = overlayG.selectAll("g.yearLine").data(rawData.filter(d => d.year == year));
    // yearLines.exit().remove();
    // let ylEnter = yearLines.enter().append("g").attr("class", "yearLine");
    // ylEnter.append("line")
    //     .attr("y1", 0)
    // yearLines = ylEnter.merge(yearLines);
    // yearLines.attr("transform", d => "translate(" + x(d.date) + ")");
    // yearLines.select("line").attr("y2", height);
}

function size() {
    outerWidth = window.innerWidth * .8,
    outerHeight = 100;

    width = outerWidth - margin.left - margin.right,
    height = outerHeight - margin.top - margin.bottom;

    histY.range([height, 0]);
    
    container.selectAll("svg").attr("width", outerWidth).attr("height", outerHeight);
    container.selectAll("g.xAxis").attr("transform", "translate(0, " + height + ")");
}
size();
d3.select(window).on("resize", () => {
    size();
    update();
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
