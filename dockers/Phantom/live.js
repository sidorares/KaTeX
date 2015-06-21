"use strict";

var system = require("system");
var webpage = require("webpage")
var data = require("../../test/screenshotter/ss_data.json");
var toStrip = "http://localhost:7936/";
var baseURL = system.env.baseURL || toStrip;

var todo = Object.keys(data);
next();

function next() {
    if (todo.length === 0) {
        phantom.exit();
        return;
    }
    var key = todo.shift();
    var url = data[key];
    url = baseURL + url.substr(toStrip.length);
    var page = webpage.create();
    page.viewportSize = { width: 1024, height: 768 };
    page.open(url, function() {
        page.render("/KaTeX/test/screenshotter/images/" + key + "-phantom.png");
        console.log(key);
        next();
    });
}
