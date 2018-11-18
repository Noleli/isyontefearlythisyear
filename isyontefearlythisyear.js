d3.json("agg_data.json").then(dataCallback);

let x = d3.scalePoint()
    .domain(makeDateRange())
    .range([0, window.innerWidth]);

let agg_data;
function dataCallback(data) {
    agg_data = data;
}

function makeDateRange() {
    // pick a gregorian leap year (2016) and use D3 to do the hard work
    let range = d3.utcDay.range(Date.UTC(2016, 0, 1), Date.UTC(2017, 0, 1));
    return range.map(d => {
        return { month: d.getUTCMonth() + 1, day: d.getUTCDate() }
    });
}
