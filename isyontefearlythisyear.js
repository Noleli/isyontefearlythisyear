"use strict";

let earlyLateDirection = window.location.hostname.includes("late") ? "late" : "early";

d3.select("title").text("Is yontef " + earlyLateDirection + " this year dot com");

let outerWidth, outerHeight,
    width, height;

let margin = { top: 12, right: 16, bottom: 20, left: 16 };

let belowAxisHeight = 100;
let freqRectHeight = 30,
    belowFreqRectOffset = 42,
    belowThresholdsOffest = 20;

let freqArrowWidth = 10;


let container = d3.select("#vis-container");

let earlyLateThresholds = d3.scaleThreshold()
    .domain([1/3, 2/3])
    .range(["early", "ontime", "late"]);

let x = d3.local(),
    xTime = d3.local();
let histY = d3.scaleLinear();
let selectedDate = d3.local();

d3.json("data.json").then(dataCallback);

let aggData, rawData, upcomingData, upcomingPoint, currentDate;

function dataCallback(data) {
    let eventMap = {
        tb: "Tu BiShvat",
        pu: "Purim",
        pe: "Pesach",
        sh: "Shavuot",
        ta: "Tisha B’Av",
        r: "Rosh Hashana",
        y: "Yom Kippur",
        su: "Sukkot",
        c: "Chanukah"
    };

    rawData = [];
    data.forEach(d => {
        rawData.push({
            event: eventMap[d.e],
            year: d.y,
            month: d.m,
            day: d.d,
            hebYear: d.hy,
            leap: d.l,
            date: new Date(Date.UTC(2016, d.m - 1, d.d)),
            actualDate: new Date(Date.UTC(d.y, d.m - 1, d.d))
        });
        
    });
    rawData = rawData.sort((a, b) => {
        return a.month == b.month ? d3.ascending(a.day, b.day) : d3.ascending(a.month, b.month);
    });

    aggregateData();
    sortByUpcoming(new Date());

    update();
    d3.select(".container").classed("invisible", false);
}

function update(transition) {
    let duration = transition ? 400 : 0;

    let events = container.selectAll(".event").data(upcomingData.entries(), d => d.key);
    events.exit().remove();
    let eventsEnter = events.enter().append("div").attr("class", "event");

    eventsEnter.append("h2").attr("class", "label");
    eventsEnter.append("p").attr("class", "date lead text-muted");
    let svg = eventsEnter.append("svg");
    let g = svg.append("g").attr("transform", "translate(" + margin.left + ", " + margin.top + ")");
    let mainG = g.append("g").attr("class", "main");
    // yearLine.append("text"); yearLine.append("text"); yearLine.append("text");
    // overlayG.append("g").attr("class", "overbar");
    let xAxisG = g.append("g").attr("class", "xAxis");
    let belowAxis = g.append("g").attr("class", "belowAxis");
    let freqLine = belowAxis.append("g").attr("class", "freqLine");
    freqLine.append("polygon")
        .attr("points", "0,0 " + freqArrowWidth + "," + (freqRectHeight/2) + " 0," + freqRectHeight);
    freqLine.append("rect");
    freqLine.append("text");
    let overlayG = g.append("g").attr("class", "overlays");
    let yearLine = overlayG.append("g").attr("class", "yearLine");
    yearLine.append("line");

    if(eventsEnter.nodes().length > 0) size();

    eventsEnter.each(function(d) {
        let dates = aggData.get(d.key).values().map(dd => dd.date);
        let dateRange = makeDateRange(dates[0], dates[dates.length-1], true);
        x.set(this, d3.scaleBand()
            .domain(dateRange)
            .paddingInner(.3));

        xTime.set(this, d3.scaleUtc()
            .domain([dateRange[0], dateRange[dateRange.length-1]]));

        selectedDate.set(this, null);
    });

    events = eventsEnter.merge(events);
    events.order();
    events.select("h2.label").text(d => d.key + " " + d.value.year + "/" + d.value.hebYear
        + ((d.value.actualDate - currentDate) > 0 ? " will be " : " is ")
        + formatOntimeness(earlyLateThresholds(aggData.get(d.key).get(d.value.date).cumFreq)));
    events.select("p.date").text(d => d3.utcFormat("%B %e")(upcomingData.get(d.key).actualDate));

    events.each(function(d) {
        let thisEvent = d3.select(this);
        
        let tx = x.get(this).range([0, width]);
        let txTime = xTime.get(this).range([tx.range()[0] + tx.bandwidth()/2, tx.range()[1] - tx.bandwidth()/2]);

        let xAxis = d3.axisBottom()
            .tickSizeOuter(0)
            .tickFormat(d3.utcFormat("%m/%d"));
        
        thisEvent.select(".xAxis")
            .call(xAxis.scale(txTime).ticks(width <= 768 ? d3.utcWeek.every(1) : d3.utcDay.every(1)));

        let stacked = d3.stack().keys(["nonLeapCount", "leapCount"]).value((dd, k) => dd.value[k])(aggData.get(d.key).entries());
        let bars = thisEvent.select(".main").selectAll("g.bars").data(stacked, dd => dd.key);
        bars.exit().remove();
        bars = bars.enter().append("g")
            .attr("class", "bars")
            .classed("leap", dd => dd.key == "leapCount")
            .merge(bars);
        let bar = bars.selectAll("rect.bar").data(dd => dd, dd => dd.data.key);
        bar.exit().remove();
        bar = bar.enter().append("rect").attr("class", "bar")
            .attr("x", dd => tx(dd.data.key))
            .attr("y", (dd, i) => histY(0))
            .attr("width", tx.bandwidth())
            .attr("height", 0)
            .merge(bar);
        bar.transition().duration(duration)
            .attr("x", dd => tx(dd.data.key))
            .attr("y", (dd, i) => histY(dd[1]))
            .attr("width", tx.bandwidth())
            .attr("height", dd => histY(dd[0]) - histY(dd[1]));

        let overlays = thisEvent.select("g.overlays").selectAll("g.dateOverlay").data(aggData.get(d.key).values(), dd => dd.date);
        overlays.exit().remove();
        let overlaysEnter = overlays.enter().append("g").attr("class", "dateOverlay");
        overlaysEnter.append("rect").attr("class", "hover");
        overlaysEnter.append("text").attr("class", "overbar");
        overlaysEnter
            .on("touchstart touchmove", function() { d3.select(this).classed("touching", true)})
            .on("touchend touchcancel", function() { d3.select(this).classed("touching", false)})
            .on("mouseover", (dd) => onHover(dd, thisEvent))
            .on("mouseout", (dd) => onUp(thisEvent));
        overlays = overlays.merge(overlaysEnter);
        overlays.attr("transform", dd => "translate(" + tx(dd.date) + ")");
        overlays.select("rect.hover")
            .attr("y", -margin.top)
            .attr("width", tx.step())
            .attr("height", outerHeight);
        overlays.select("text.overbar")
            .text(dd => percentFormat(dd.freq))
            .attr("y", dd => histY(dd.count))
            .attr("dx", function() { return -this.getBBox().width/2 + tx.bandwidth()/2 })
            .attr("dy", -3);

        // thisEvent.select("g.overlays").select(".yearLine").call(placeYearLine, aggData.get(d.key).get(d.value.date));
        onUp(thisEvent);

        let thresholdData = makeThresholdData(aggData.get(d.key).values());
        thisEvent.select("g.belowAxis").attr("transform", "translate(" + 0 + ", " + (height + margin.bottom + 2) + ")");
        let thresholdLabels = thisEvent.select("g.belowAxis").selectAll("g.thresholdLabel").data(thresholdData, dd => dd);
        thresholdLabels.exit().remove();
        let thresholdLabelsEnter = thresholdLabels.enter().append("g").attr("class", "thresholdLabel");
        thresholdLabelsEnter.append("line");
        thresholdLabelsEnter.append("text");
        thresholdLabels = thresholdLabels.merge(thresholdLabelsEnter);
        thresholdLabels.select("line")
            .attr("x1", dd => txTime(dd.start))
            .attr("x2", dd => txTime(dd.end));
        thresholdLabels.select("text")
            .text(dd => formatOntimeness(dd.range, true))
            .attr("x", dd => (txTime(dd.end) + txTime(dd.start))/2)
            .attr("dx", function() { return -this.getBBox().width/2 })
            .attr("dy", 13);
    });

    d3.select("#big-question").text("Is " + upcomingPoint.event + " " + earlyLateDirection + " " + " this year?");
    d3.select("#big-answer").text(makeBigAnswer());
    d3.select("#answer-description").html(makeAnswerDescription());
}

function onHover(d, thisEvent) {
    let yl = thisEvent.select("g.overlays").select(".yearLine");
    placeYearLine(yl, d);

    let fl = thisEvent.select("g.belowAxis").select(".freqLine");
    placeFreqLine(fl, d);
}

function onUp(thisEvent) {
    let d = thisEvent.datum();
    let dd = aggData.get(d.key).get(d.value.date);
    onHover(dd, thisEvent);
}

function placeFreqLine(s, d) {
    s.attr("transform", "translate(0, " + belowThresholdsOffest + ")");
    s.select("rect")
        .attr("y", 0)
        .attr("height", freqRectHeight);
    s.select("text").attr("dy", 20);

    let txTime = xTime.get(s.node());

    if(d.cumFreq < .5) {
        s.select("rect")
            .attr("x", txTime(d.date) + freqArrowWidth)
            .attr("width", txTime.range()[1] - txTime(d.date) - freqArrowWidth);
        s.select("polygon").attr("transform", "translate(" + (txTime(d.date) + freqArrowWidth) + ") scale(-1 1)");
        s.select("text")
            .text(d3.utcFormat("%B %e")(d.date) + ": earlier than " + percentFormat(1 - d.cumFreq))
            .text(function() {
                if(this.getBBox().width > s.select("rect").attr("width") - 6) {
                    return d3.utcFormat("%m/%d")(d.date) + ": earlier than " + percentFormat(1 - d.cumFreq);
                }
                else return d3.select(this).text();
            })
            .attr("x", txTime(d.date) + freqArrowWidth + 3);
    }
    else {
        s.select("rect")
            .attr("x", txTime.range()[0])
            .attr("width", txTime(d.date) - txTime.range()[0] - freqArrowWidth);
        s.select("polygon").attr("transform", "translate(" + (txTime(d.date) - freqArrowWidth) + ")");
        s.select("text")
            .text(d3.utcFormat("%B %e")(d.date) + ": later than " + percentFormat(d.cumFreq - d.freq))
            .text(function() {
                if(this.getBBox().width > s.select("rect").attr("width") - 6) {
                    return d3.utcFormat("%m/%d")(d.date) + ": later than " + percentFormat(d.cumFreq - d.freq);
                }
                else return d3.select(this).text();
            })
            .attr("x", function() { return txTime(d.date) - this.getBBox().width - 3 - freqArrowWidth });
    }

}

function placeYearLine(s, d) {
    s.attr("transform", "translate(" + xTime.get(s.node())(d.date) + ")");

    let dateFlagText = [];
    // if(d.date.valueOf() == upcomingData.get(d.event).date.valueOf()) 
    let thisEventOnDate = rawData.filter(dd => dd.date.valueOf() == d.date.valueOf() && dd.event == d.event);
    let thisYearIndex = thisEventOnDate.findIndex(dd => dd.year - upcomingData.get(d.event).year >= 0);
    if(thisYearIndex == -1) { // all in the past
        dateFlagText.push("Last time: " + thisEventOnDate[thisEventOnDate.length-1].year);
    }
    else if(thisEventOnDate[thisYearIndex].year == upcomingData.get(d.event).year) { // this year
        dateFlagText.push("This year");
        try {
            dateFlagText.push("Last time: " + thisEventOnDate[thisYearIndex - 1].year);
        }
        catch(e) {}
        try {
            dateFlagText.push("Next time: " + thisEventOnDate[thisYearIndex + 1].year);
        }
        catch(e) {}
    }
    else {
        try {
            dateFlagText.push("Last time: " + thisEventOnDate[thisYearIndex - 1].year);
        }
        catch(e) {}
        try {
            dateFlagText.push("Next time: " + thisEventOnDate[thisYearIndex].year);
        }
        catch(e) {}
    }

    let text = s.selectAll("text").data(dateFlagText, t => t);
    text.exit().remove();
    text = text.enter().append("text").merge(text)
        .text(t => t)
        .classed("thisYear", t => t == "This year")
        .attr("y", (t, i) => height + margin.bottom + belowThresholdsOffest + belowFreqRectOffset + 10 + i*15)
        .attr("dy", -4);

    let widest = d3.max(text.nodes().map(n => n.getBBox().width));

    text.attr("dx", function() {
        let padding = 3;
        let pos = xTime.get(this)(d.date);
        if(pos + widest + 2 * padding > width) {
            return -this.getBBox().width - padding;
        }
        else return padding;
    });

    s.select("line")
        .attr("y1", height)
        .attr("y2", height + margin.bottom + belowThresholdsOffest + belowFreqRectOffset + 10 + (dateFlagText.length-1)*13);
}

function makeBigAnswer(asBool) {
    let answer = earlyLateThresholds(upcomingPoint.cumFreq) == earlyLateDirection;
    if(asBool) return answer;
    else {
        if(answer) return "Yes!";
        else return "No.";
    }
}

function makeAnswerDescription() {
    let outString = "";

    if(makeBigAnswer(true) == false) {
        let ontimeness = formatOntimeness(earlyLateThresholds(upcomingPoint.cumFreq));
        outString = "It’s " + (ontimeness == "on time" ? "right " : " ") + ontimeness + " this year. ";
    }

    outString = outString + upcomingPoint.event
        + " starts on <strong>" + d3.utcFormat("%A, %B %e, %Y")(upcomingPoint.actualDate)
        + "</strong>, which is ";

    if((upcomingPoint.cumFreq) < .5) { //  - upcomingPoint.freq
        outString = outString
            + "earlier than "
            + percentFormat(1 - upcomingPoint.cumFreq);
    }
    else {
        outString = outString
            + "later than "
            + percentFormat(upcomingPoint.cumFreq - upcomingPoint.freq);
    }
    
    outString = outString + " of years.";
    return outString;
}

let percentFormat = d3.format(".1%");

function size() {
    let containerContainer = d3.select(container.node().parentNode);
    outerWidth = parseFloat(containerContainer.style("width"))
        - parseFloat(containerContainer.style("padding-left"))
        - parseFloat(containerContainer.style("padding-right")),
    // outerHeight = 140;
    height = 100;
    outerHeight = height + margin.top + margin.bottom + belowAxisHeight;

    width = outerWidth - margin.left - margin.right,
    // height = outerHeight - margin.top - margin.bottom;

    histY.range([height, 0]);
    
    container.selectAll("svg").attr("width", outerWidth).attr("height", outerHeight);
    container.selectAll("g.xAxis").attr("transform", "translate(0, " + height + ")");
}
size();
d3.select(window).on("resize", () => {
    size();
    update();
});

function sortByUpcoming(date) {
    let eventHoldover = {
        "Tu BiShvat": 1,
        "Purim": 2,
        "Pesach": 9,
        "Shavuot": 3,
        "Tisha B’Av": 2,
        "Rosh Hashana": 3,
        "Yom Kippur": 2,
        "Sukkot": 10,
        "Chanukah": 9
    };

    currentDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); // convert to naive
    upcomingData = d3.nest()
        .key(d => d.event)
        .rollup(d => d[0]) // .sort((a, b) => d3.ascending(a.actualDate, b.actualDate))
        .map(rawData
            .filter(d => (d.actualDate - currentDate)/1000/3600/24 > -eventHoldover[d.event])
            .sort((a, b) => d3.ascending(a.actualDate, b.actualDate))
        );

    upcomingPoint = aggData.get(upcomingData.values()[0].event).get(upcomingData.values()[0].date);
    upcomingPoint.actualDate = upcomingData.values()[0].actualDate;
}

function aggregateData(startYear, endYear) {
    startYear = startYear == undefined ? d3.min(rawData, d => d.year) : startYear;
    endYear = endYear == undefined ? d3.max(rawData, d => d.year) : endYear;

    let totalYears = endYear - startYear + 1;

    aggData = d3.nest()
        .key(d => d.event)
        .key(d => d.date)
        // .sortValues((a, b) => a.month == b.month ? d3.ascending(a.day, b.day) : d3.ascending(a.month, b.month))
        .rollup(d => { return { event: d[0].event, date: d[0].date, count: d.length, leapCount: d.filter(dd => dd.leap).length, nonLeapCount: d.filter(dd => !dd.leap).length, freq: d.length/totalYears } })
        .map(rawData.filter(d => d.year >= startYear && d.year <= endYear));

    aggData.values().forEach(e => {
        let cumFreq = 0;
        e.values().forEach(d => {
            cumFreq += d.freq;
            d.cumFreq = cumFreq;
            d.ontimeness = earlyLateThresholds(cumFreq);
        });
    });

    histY.domain([0, d3.max(aggData.values().map(d => d3.max(d.values(), dd => dd.count)))]); // renormalize
}

function makeThresholdData(data) {
    let thresholdPairs = d3.pairs(data).filter(dd => dd[0].ontimeness != dd[1].ontimeness);
    let thresholdData = [];
    thresholdData.push({
        range: earlyLateThresholds.range()[0],
        start: data[0].date,
        end: thresholdPairs[0][0].date
    });
    earlyLateThresholds.range().forEach((t, i) => {
        if(i != 0 && i != earlyLateThresholds.range().length-1) {
            thresholdData.push({
                range: t,
                start: thresholdPairs[i-1][1].date,
                end: thresholdPairs[i][0].date
            });
        }
    });
    thresholdData.push({
        range: earlyLateThresholds.range()[earlyLateThresholds.range().length-1],
        start: thresholdPairs[thresholdPairs.length-1][1].date,
        end: data[data.length-1].date
    });
    return thresholdData;
}

function formatOntimeness(str, caps) {
    let map;
    if(caps) {
        map = {
            early: "Early",
            ontime: "On time",
            late: "Late"
        };
    }
    else {
        map = {
            early: "early",
            ontime: "on time",
            late: "late"
        };
    }
    return map[str];
}

function makeDateRange(start, stop, dates) {
    let startMonth, startDay,
        stopMonth, stopDay;
    if(start) {
        startMonth = start.getUTCMonth(),
        startDay = start.getUTCDate();
    }
    else {
        startMonth = 0,
        startDay = 1;
    }

    if(stop) {
        stopMonth = stop.getUTCMonth(),
        stopDay = stop.getUTCDate() + 1; // this function should be inclusive, so add 1 to stop
    }
    else {
        stopMonth = 11,
        stopDay = 32;
    }
    // pick a gregorian leap year (2016) and use D3 to do the hard work

    let range = d3.utcDay.range(Date.UTC(2016, startMonth, startDay), Date.UTC(2016, stopMonth, stopDay));
    if(dates) return range;
    else return range.map(d => (d.getUTCMonth() + 1) + "-" + d.getUTCDate());
}
