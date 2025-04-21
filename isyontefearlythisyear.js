import * as d3 from "d3";
import "bootstrap/dist/css/bootstrap.min.css";
import data from './static/data.json';

const earlyLateDirection = location.hostname.includes("late") ? "late" : "early";
const yontefSpelling = location.hostname.includes("yontef") ? "yontef" : "yom tov";

d3.select("title").text(`Is ${yontefSpelling} ${earlyLateDirection} this year dot com`);

let outerHeight;
let width;
let height;

const margin = {
    top: 12, right: 16, bottom: 20, left: 16,
};

const belowAxisHeight = 100;
const freqRectHeight = 30;
const belowFreqRectOffset = 42;
const belowThresholdsOffest = 20;

const freqArrowWidth = 10;

const container = d3.select("#vis-container");

const earlyLateThresholds = d3.scaleThreshold()
    .domain([1 / 3, 2 / 3])
    .range(["early", "ontime", "late"]);

// Define percentFormat earlier
const percentFormat = d3.format(".1%");

// Helper: traverse up until xTime scale is found
function getXTimeScale(node) {
    let n = node;
    while (n && !xTime.get(n)) {
        n = n.parentNode;
    }

    return n ? xTime.get(n) : undefined;
}

// Replace d3.local() with WeakMap
const x = new WeakMap();
const xTime = new WeakMap();
const histY = d3.scaleLinear();

// Declare module-level variables before calling dataCallback
let aggData;
let rawData;
let upcomingData;
let upcomingPoint;
let currentDate;

// Now call the dataCallback with the imported data
dataCallback(data);

function dataCallback(data) {
    const eventMap = {
        tb: "Tu BiShvat",
        pu: "Purim",
        pe: "Pesach",
        sh: "Shavuot",
        ta: "Tisha B’Av",
        r: "Rosh Hashana",
        y: "Yom Kippur",
        su: "Sukkot",
        c: "Chanukah",
    };

    rawData = [];
    for (const d of data) {
        rawData.push({
            event: eventMap[d.e],
            year: d.y,
            month: d.m,
            day: d.d,
            hebYear: d.hy,
            leap: d.l,
            date: new Date(Date.UTC(2016, d.m - 1, d.d)),
            actualDate: new Date(Date.UTC(d.y, d.m - 1, d.d)),
        });
    }

    rawData = rawData.sort((a, b) => a.month === b.month ? d3.ascending(a.day, b.day) : d3.ascending(a.month, b.month));

    aggregateData();
    sortByUpcoming(new Date());

    update();
    d3.select(".container").classed("invisible", false);
}

function update(transition) {
    if (!upcomingPoint) {
        // No upcoming event found, clear UI or skip rendering
        d3.select("#big-question").text("No upcoming event found.");
        d3.select("#big-answer").text("");
        d3.select("#answer-description").text("");
        return;
    }

    const duration = transition ? 400 : 0;

    let events = container.selectAll(".event").data(Array.from(upcomingData.entries()), d => d[0]);
    events.exit().remove();
    const eventsEnter = events.enter().append("div").attr("class", "event");

    eventsEnter.append("h2").attr("class", "label");
    eventsEnter.append("p").attr("class", "date lead text-muted");
    const svg = eventsEnter.append("svg");
    const g = svg.append("g").attr("transform", `translate(${margin.left}, ${margin.top})`);
    g.append("g").attr("class", "main"); // MainG
    g.append("g").attr("class", "xAxis"); // XAxisG
    const belowAxis = g.append("g").attr("class", "belowAxis");
    const freqLine = belowAxis.append("g").attr("class", "freqLine");
    freqLine.append("polygon")
        .attr("points", "0,0 " + freqArrowWidth + "," + (freqRectHeight / 2) + " 0," + freqRectHeight);
    freqLine.append("rect");
    freqLine.append("text");
    const overlayG = g.append("g").attr("class", "overlays");
    const yearLine = overlayG.append("g").attr("class", "yearLine");
    yearLine.append("line");

    if (eventsEnter.nodes().length > 0) {
        size();
    }

    eventsEnter.each(function (d) {
        const dates = Array.from(aggData.get(d[0]).values()).map(dd => dd.date);
        const dateRange = makeDateRange(dates[0], dates.at(-1), true);

        // Ensure xTime is set for all nodes
        x.set(this, d3.scaleBand()
            .domain(dateRange)
            .paddingInner(0.3));

        xTime.set(this, d3.scaleUtc()
            .domain([dateRange[0], dateRange.at(-1)]));
    });

    events = eventsEnter.merge(events);
    events.order();
    events.select("h2.label").text(d => {
        // Find the point in aggData using valueOf lookup
        const dateValue = d[1].date.valueOf();
        const eventData = aggData.get(d[0]);
        let point;

        // Find matching date by value
        for (const [dateKey, p] of eventData.entries()) {
            if (dateKey.valueOf() === dateValue) {
                point = p;
                break;
            }
        }

        return d[0] + " " + d[1].year + "/" + d[1].hebYear
            + ((d[1].actualDate - currentDate) > 0 ? " will be " : " is ")
            + formatOntimeness(earlyLateThresholds(point.cumFreq));
    });
    events.select("p.date").text(d => d3.utcFormat("%B %e")(upcomingData.get(d[0]).actualDate));

    events.each(function (d) {
        const thisEvent = d3.select(this);

        const tx = x.get(this).range([0, width]);
        // Adjust txTime range: right bound now properly computed instead of dividing by 2.
        const txTime = xTime.get(this).range([tx.range()[0] + tx.bandwidth() / 2, tx.range()[1] - tx.bandwidth() / 2]);

        const xAxis = d3.axisBottom()
            .tickSizeOuter(0)
            .tickFormat(d3.utcFormat("%m/%d"));

        thisEvent.select(".xAxis")
            .call(xAxis.scale(txTime).ticks(width <= 768 ? d3.utcWeek.every(1) : d3.utcDay.every(1)));

        // Correct the value accessor for d3.stack
        const stacked = d3.stack().keys(["nonLeapCount", "leapCount"]).value((dd, k) => dd[1][k])(Array.from(aggData.get(d[0]).entries()));
        let bars = thisEvent.select(".main").selectAll("g.bars").data(stacked, dd => dd.key);
        bars.exit().remove();
        bars = bars.enter().append("g")
            .attr("class", "bars")
            .classed("leap", dd => dd.key === "leapCount")
            .merge(bars);
        let bar = bars.selectAll("rect.bar").data(dd => dd, dd => dd.data[0]); // Use Date object (dd.data[0]) as key
        bar.exit().remove();
        bar = bar.enter().append("rect").attr("class", "bar")
            .attr("x", dd => tx(dd.data[0])) // Use Date object (dd.data[0]) for x scale
            .attr("y", () => histY(0))
            .attr("width", tx.bandwidth())
            .attr("height", 0)
            .merge(bar);
        bar.transition().duration(duration)
            .attr("x", dd => tx(dd.data[0])) // Use Date object (dd.data[0]) for x scale
            .attr("y", dd => histY(dd[1]))
            .attr("width", tx.bandwidth())
            .attr("height", dd => histY(dd[0]) - histY(dd[1]));

        const eventDrag = d3.drag()
            .on("start drag", event => {
                const thisDate = txTime.invert(event.x);
                // Find the closest date in the scale domain
                const domainDates = tx.domain();
                let closestDate = domainDates[0];
                let closestDiff = Math.abs(domainDates[0] - thisDate);

                for (let i = 1; i < domainDates.length; i++) {
                    const diff = Math.abs(domainDates[i] - thisDate);
                    if (diff < closestDiff) {
                        closestDiff = diff;
                        closestDate = domainDates[i];
                    }
                }

                // Find the point in aggData using valueOf lookup
                const dateValue = closestDate.valueOf();
                const eventData = aggData.get(d[0]);
                let thisPoint;
                for (const [dateKey, p] of eventData.entries()) {
                    if (dateKey.valueOf() === dateValue) {
                        thisPoint = p;
                        break;
                    }
                }

                if (thisPoint) {
                    onHover(thisPoint, thisEvent);
                }
            })
            .on("end", () => onUp(thisEvent));

        let overlays = thisEvent.select("g.overlays").selectAll("g.dateOverlay").data(Array.from(aggData.get(d[0]).values()), dd => dd.date);
        overlays.exit().remove();
        const overlaysEnter = overlays.enter().append("g").attr("class", "dateOverlay");
        overlaysEnter.append("rect").attr("class", "hover");
        overlaysEnter.append("text").attr("class", "overbar");
        overlaysEnter
            .on("mouseover", (event, dd) => onHover(dd, thisEvent))
            .on("mouseout", () => onUp(thisEvent));
        thisEvent.select("g.overlays").call(eventDrag);
        overlays = overlays.merge(overlaysEnter);
        overlays.attr("transform", dd => `translate(${tx(dd.date)})`);
        overlays.select("rect.hover")
            .attr("y", -margin.top)
            .attr("width", tx.step())
            .attr("height", outerHeight);
        overlays.select("text.overbar")
            .text(dd => percentFormat(dd.freq))
            .attr("y", dd => histY(dd.count))
            .attr("dx", function () {
                return (-this.getBBox().width / 2) + (tx.bandwidth() / 2);
            })
            .attr("dy", -3);

        onUp(thisEvent);

        const thresholdData = makeThresholdData(Array.from(aggData.get(d[0]).values()));
        thisEvent.select("g.belowAxis").attr("transform", `translate(0, ${(height + margin.bottom + 2)})`);
        let thresholdLabels = thisEvent.select("g.belowAxis").selectAll("g.thresholdLabel").data(thresholdData, dd => dd);
        thresholdLabels.exit().remove();
        const thresholdLabelsEnter = thresholdLabels.enter().append("g").attr("class", "thresholdLabel");
        thresholdLabelsEnter.append("line");
        thresholdLabelsEnter.append("text");
        thresholdLabels = thresholdLabels.merge(thresholdLabelsEnter);
        thresholdLabels.select("line")
            .attr("x1", dd => txTime(dd.start))
            .attr("x2", dd => txTime(dd.end));
        thresholdLabels.select("text")
            .text(dd => formatOntimeness(dd.range, true))
            .attr("x", dd => (txTime(dd.end) + txTime(dd.start)) / 2)
            .attr("dx", function () {
                return -this.getBBox().width / 2;
            })
            .attr("dy", 13);
    });

    d3.select("#big-question").text(`Is ${upcomingPoint.event} ${earlyLateDirection} this year?`);
    d3.select("#big-answer").text(makeBigAnswer());
    d3.select("#answer-description").html(makeAnswerDescription());
}

function onHover(d, thisEvent) {
    const yl = thisEvent.select("g.overlays").select(".yearLine");
    placeYearLine(yl, d);

    const fl = thisEvent.select("g.belowAxis").select(".freqLine");
    placeFreqLine(fl, d);

    thisEvent.select(".overlays").selectAll(".dateOverlay").classed("touching", dd => dd.date.valueOf() === d.date.valueOf());
}

function onUp(thisEvent) {
    const d = thisEvent.datum();
    // Find the point in aggData using valueOf lookup
    const dateValue = d[1].date.valueOf();
    const eventData = aggData.get(d[0]);
    let point;

    // Find matching date by value
    for (const [dateKey, p] of eventData.entries()) {
        if (dateKey.valueOf() === dateValue) {
            point = p;
            break;
        }
    }

    onHover(point, thisEvent);
    thisEvent.select(".overlays").selectAll(".dateOverlay").classed("touching", false);
}

function placeFreqLine(s, d) {
    // Use the helper to get the scale from node or its parent
    const scale = getXTimeScale(s.node());
    if (!scale) {
        console.error("Scale not found for node in placeFreqLine:", s.node());
        return; // Exit if the scale is not set
    }

    s.attr("transform", `translate(0,${belowThresholdsOffest})`);
    s.select("rect")
        .attr("y", 0)
        .attr("height", freqRectHeight);
    s.select("text").attr("dy", 20);

    if (d.cumFreq < 0.5) {
        s.select("rect")
            .attr("x", scale(d.date) + freqArrowWidth)
            .attr("width", scale.range()[1] - scale(d.date) - freqArrowWidth);
        s.select("polygon").attr("transform", `translate(${(scale(d.date) + freqArrowWidth)}) scale(-1 1)`);
        s.select("text")
            .text(d3.utcFormat("%B %e")(d.date) + ": earlier than " + percentFormat(1 - d.cumFreq))
            .attr("x", scale(d.date) + freqArrowWidth + 3);
    } else {
        s.select("rect")
            .attr("x", scale.range()[0])
            .attr("width", scale(d.date) - scale.range()[0] - freqArrowWidth);
        s.select("polygon").attr("transform", "translate(" + (scale(d.date) - freqArrowWidth) + ")");
        s.select("text")
            .text(d3.utcFormat("%B %e")(d.date) + ": later than " + percentFormat(d.cumFreq - d.freq))
            .attr("x", function () {
                const bbox = (typeof this.getBBox === "function") ? this.getBBox() : {width: 0};
                return scale(d.date) - bbox.width - 3 - freqArrowWidth;
            });
    }
}

function placeYearLine(s, d) {
    const scale = getXTimeScale(s.node());
    if (!scale) {
        console.error("Scale not found for node in placeYearLine:", s.node());
        return; // Exit if the scale is not set
    }

    s.attr("transform", "translate(" + scale(d.date) + ")");

    const dateFlagText = [];
    const thisEventOnDate = rawData.filter(dd => dd.date.valueOf() === d.date.valueOf() && dd.event === d.event);
    const currentUpcoming = upcomingData.get(d.event);
    const currentUpcomingYear = currentUpcoming ? currentUpcoming.year : null;

    const thisYearIndex = currentUpcomingYear === null ? -1 : thisEventOnDate.findIndex(dd => dd.year - currentUpcomingYear >= 0);

    if (thisYearIndex === -1) {
        if (thisEventOnDate.length > 0) {
            dateFlagText.push("Last time: " + thisEventOnDate.at(-1).year);
        }
    } else if (thisEventOnDate[thisYearIndex].year === currentUpcomingYear) {
        dateFlagText.push("This year");
        if (thisYearIndex > 0) {
            dateFlagText.push("Last time: " + thisEventOnDate[thisYearIndex - 1].year);
        }

        if (thisYearIndex < thisEventOnDate.length - 1) {
            dateFlagText.push("Next time: " + thisEventOnDate[thisYearIndex + 1].year);
        }
    } else {
        if (thisYearIndex > 0) {
            dateFlagText.push("Last time: " + thisEventOnDate[thisYearIndex - 1].year);
        }

        dateFlagText.push("Next time: " + thisEventOnDate[thisYearIndex].year);
    }

    let text = s.selectAll("text").data(dateFlagText, t => t);
    text.exit().remove();
    text = text.enter().append("text").merge(text)
        .text(t => t)
        .classed("thisYear", t => t === "This year")
        .attr("y", (_, i) => (height + margin.bottom + belowThresholdsOffest + belowFreqRectOffset + 10 + i * 15))
        .attr("dy", -4);

    text.attr("dx", function () {
        return -this.getBBox().width / 2;
    });

    s.select("line")
        .attr("y1", height)
        .attr("y2", height + margin.bottom + belowThresholdsOffest + belowFreqRectOffset + 10 + (dateFlagText.length - 1) * 15);
}

function makeBigAnswer(asBool) {
    const answer = earlyLateThresholds(upcomingPoint.cumFreq) === earlyLateDirection;
    if (asBool) {
        return answer;
    }

    if (answer) {
        return "Yes!";
    }

    return "No.";
}

function makeAnswerDescription() {
    let outString = "";

    if (makeBigAnswer(true) === false) {
        const ontimeness = formatOntimeness(earlyLateThresholds(upcomingPoint.cumFreq));
        outString = `It’s ${(ontimeness === "on time" ? "right " : " ")}${ontimeness} this year. `;
    }

    outString = outString + upcomingPoint.event
        + " starts on <strong>" + d3.utcFormat("%A, %B %e, %Y")(upcomingPoint.actualDate)
        + "</strong>, which is ";

    if ((upcomingPoint.cumFreq) < 0.5) { //  - upcomingPoint.freq
        outString = outString
            + "earlier than "
            + percentFormat(1 - upcomingPoint.cumFreq);
    } else {
        outString = outString
            + "later than "
            + percentFormat(upcomingPoint.cumFreq - upcomingPoint.freq);
    }

    outString += " of years.";
    return outString;
}

function size() {
    const containerContainer = d3.select(container.node().parentNode);
    const outerWidth = Number.parseFloat(containerContainer.style("width"))
        - Number.parseFloat(containerContainer.style("padding-left"))
        - Number.parseFloat(containerContainer.style("padding-right"));
    // OuterHeight = 140;
    height = 100;
    outerHeight = height + margin.top + margin.bottom + belowAxisHeight;

    width = outerWidth - margin.left - margin.right;
    // Height = outerHeight - margin.top - margin.bottom;

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
    const eventHoldover = {
        "Tu BiShvat": 1,
        Purim: 2,
        Pesach: 9,
        Shavuot: 3,
        "Tisha B’Av": 2,
        "Rosh Hashana": 3,
        "Yom Kippur": 2,
        Sukkot: 10,
        Chanukah: 9,
    };

    currentDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

    const filtered = rawData.filter(d => {
        const diff = (d.actualDate - currentDate) / 1000 / 3600 / 24;
        return diff > -eventHoldover[d.event];
    });

    upcomingData = new Map(
        Array.from(
            d3.group(
                filtered.sort((a, b) => d3.ascending(a.actualDate, b.actualDate)),
                d => d.event,
            ),
            ([key, values]) => [key, values[0]],
        ),
    );

    const firstUpcoming = Array.from(upcomingData.values())[0];
    if (firstUpcoming) {
        const dateValue = firstUpcoming.date.valueOf();
        let foundPoint;

        const eventData = aggData.get(firstUpcoming.event);
        if (eventData) {
            for (const [dateKey, point] of eventData.entries()) {
                if (dateKey.valueOf() === dateValue) {
                    foundPoint = point;
                    break;
                }
            }
        }

        upcomingPoint = foundPoint;
        if (upcomingPoint) {
            upcomingPoint.actualDate = firstUpcoming.actualDate;
        } else {
            console.log("No matching point found for:", firstUpcoming.event, new Date(dateValue).toISOString());
        }
    } else {
        upcomingPoint = undefined;
    }
}

function aggregateData(startYear, endYear) {
    startYear = startYear === undefined ? d3.min(rawData, d => d.year) : startYear;
    endYear = endYear === undefined ? d3.max(rawData, d => d.year) : endYear;

    const totalYears = endYear - startYear + 1;

    aggData = new Map(
        Array.from(
            d3.group(
                rawData.filter(d => d.year >= startYear && d.year <= endYear),
                d => d.event,
                d => d.date.valueOf(),
            ),
            ([event, dateMap]) => [
                event,
                new Map(
                    Array.from(dateMap, ([date, array]) => [
                        new Date(Number(date)),
                        {
                            event: array[0].event,
                            date: array[0].date,
                            count: array.length,
                            leapCount: array.filter(dd => dd.leap).length,
                            nonLeapCount: array.filter(dd => !dd.leap).length,
                            freq: array.length / totalYears,
                        },
                    ]),
                ),
            ],
        ),
    );

    for (const ex of aggData.values()) {
        let cumFreq = 0;
        for (const d of Array.from(ex.values())) {
            cumFreq += d.freq;
            d.cumFreq = cumFreq;
            d.ontimeness = earlyLateThresholds(cumFreq);
        }
    }

    histY.domain([0, d3.max(Array.from(aggData.values()).map(d => d3.max(Array.from(d.values()), dd => dd.count)))]); // Renormalize
}

function makeThresholdData(data) {
    const thresholdPairs = d3.pairs(data).filter(dd => dd[0].ontimeness !== dd[1].ontimeness);
    const thresholdData = [];
    thresholdData.push({
        range: earlyLateThresholds.range()[0],
        start: data[0].date,
        end: thresholdPairs[0][0].date,
    });
    for (const [index, t] of earlyLateThresholds.range().entries()) {
        if (index !== 0 && index !== earlyLateThresholds.range().length - 1) {
            thresholdData.push({
                range: t,
                start: thresholdPairs[index - 1][1].date,
                end: thresholdPairs[index][0].date,
            });
        }
    }

    thresholdData.push({
        range: earlyLateThresholds.range()[earlyLateThresholds.range().length - 1],
        start: thresholdPairs.at(-1)[1].date,
        end: data.at(-1).date,
    });
    return thresholdData;
}

function formatOntimeness(string, caps) {
    let map;
    if (caps) {
        map = {
            early: "Early",
            ontime: "On time",
            late: "Late",
        };
    } else {
        map = {
            early: "early",
            ontime: "on time",
            late: "late",
        };
    }

    return map[string];
}

function makeDateRange(start, stop, dates) {
    let startMonth;
    let startDay;
    let stopMonth;
    let stopDay;
    if (start) {
        startMonth = start.getUTCMonth();
        startDay = start.getUTCDate();
    } else {
        startMonth = 0;
        startDay = 1;
    }

    if (stop) {
        stopMonth = stop.getUTCMonth();
        stopDay = stop.getUTCDate() + 1; // This function should be inclusive, so add 1 to stop
    } else {
        stopMonth = 11;
        stopDay = 32;
    }
    // Pick a gregorian leap year (2016) and use D3 to do the hard work

    const range = d3.utcDay.range(Date.UTC(2016, startMonth, startDay), Date.UTC(2016, stopMonth, stopDay));
    if (dates) {
        return range;
    }

    return range.map(d => (d.getUTCMonth() + 1) + "-" + d.getUTCDate());
}
