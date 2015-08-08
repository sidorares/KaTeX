"use strict";

var fs = require("fs");
var path = require("path");
var data = require("../test/screenshotter/ss_data");

var templateFile = require.resolve("../test/screenshotter/test.html");
var template = fs.readFileSync(templateFile, "utf-8");
template = template.replace(/"\/katex\./g, "\"../lib/katex/katex.min.");
var match = /((var query)[^]*?)^ *var mathNode/m.exec(template);
var head = template.substr(0, match.index + match[2].length) + " = ";
var tail = ";\n" + template.substr(match.index + match[1].length);
var dir = "testcases";

fs.mkdir(dir, function(err) {
    if (err && err.code !== "EEXIST") {
        throw err;
    }
    process.nextTick(writeThem);
});

function writeThem() {
    for (var key in data) {
        var str = head + JSON.stringify(data[key]) + tail;
        fs.writeFile(path.join(dir, key + ".html"), str, check);
    }
}

function check(err) {
    if (err) throw err;
}
