"use strict";

d3.json("agg_data.json").then(dataCallback);

let x = d3.scalePoint()
    .domain(makeDateRange())
    .range([0, window.innerWidth]);

let agg_data;
function dataCallback(data) {
    agg_data = data;
}

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
