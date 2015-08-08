"use strict";

var data = require("./browsers");
var widths = {};
data.forEach(function(row) {
    for (var key in row) {
        widths[key] = Math.max(
            (row[key] || "").toString().length,
            widths[key] || key.length);
    }
});
var cols = Object.keys(widths);
cols.sort();
var colNames = {};
cols.forEach(function(col) {
    colNames[col] = col;
});

function pad(s, len) {
    if (s === null || s === undefined) {
        s = "";
    } else {
        s = s.toString();
    }
    while (s.length < len) {
        s = s + " ";
    }
    return s;
}

printRow(colNames);
console.log("");
data.forEach(printRow);

function printRow(row) {
    console.log(cols.map(function(col) {
        return pad(row[col], widths[col]);
    }).join(" "));
}
