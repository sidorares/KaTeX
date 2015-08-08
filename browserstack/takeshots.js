"use strict";

var fs = require("fs");
var path = require("path");
var request = require("request");
var tests = require("../test/screenshotter/ss_data");
var config = require("./config");
/* ./config.json is a file that looks as follows:
{
  "user": "BROWSERSTACK_USER",
  "key": "BROWSERSTACK_ACCESS_KEY",
  "url": "http://path/to/testcases/"
}
*/

function browser(b, bv, os, osv, dev) {
    return {
        browser: b,
        browser_version: bv,
        os: os,
        os_version: osv,
        device: dev || null
    };
}

var browsers = [
    // Firefox (Windows):
    browser("firefox", "37.0", "Windows", "8.1"),
    browser("firefox", "30.0", "Windows", "8"),
    browser("firefox", "25.0", "Windows", "7"),
    browser("firefox", "20.0", "Windows", "7"),
    browser("firefox", "15.0", "Windows", "XP"),
    browser("firefox", "10.0", "Windows", "XP"),

    // Firefox (OS X):
    browser("firefox", "37.0", "OS X", "Yosemite"),
    browser("firefox", "30.0", "OS X", "Mavericks"),
    browser("firefox", "25.0", "OS X", "Mountain Lion"),
    browser("firefox", "20.0", "OS X", "Lion"),
    browser("firefox", "15.0", "OS X", "Snow Leopard"),

    // Chrome (Windows):
    browser("chrome", "42.0", "Windows", "8.1"),
    browser("chrome", "40.0", "Windows", "8"),
    browser("chrome", "35.0", "Windows", "8"),
    browser("chrome", "30.0", "Windows", "7"),
    browser("chrome", "25.0", "Windows", "7"),
    browser("chrome", "20.0", "Windows", "XP"),
    browser("chrome", "15.0", "Windows", "XP"),

    // Chrome (OS X):
    browser("chrome", "42.0", "OS X", "Yosemite"),
    browser("chrome", "40.0", "OS X", "Mavericks"),
    browser("chrome", "35.0", "OS X", "Mountain Lion"),
    browser("chrome", "30.0", "OS X", "Lion"),
    browser("chrome", "25.0", "OS X", "Snow Leopard"),

    // Internet Explorer
    browser("ie", "11.0", "Windows", "8.1"),
    browser("ie", "10.0", "Windows", "8"),
    browser("ie", "9.0", "Windows", "7"),
    browser("ie", "8.0", "Windows", "7"),
    browser("ie", "7.0", "Windows", "XP"),
    browser("ie", "6.0", "Windows", "XP"),

    // Safari:
    browser("safari", "8.0", "OS X", "Yosemite"),
    browser("safari", "7.0", "OS X", "Mavericks"),
    browser("safari", "6.1", "OS X", "Mountain Lion"),
    browser("safari", "5.1", "OS X", "Snow Leopard"),

    // Mobile:
    browser("Mobile Safari", null, "ios", "8.3", "iPad Air"),
    browser("Android Browser", null, "android", "5.0", "Google Nexus 9"),
];

var reqBasic = request.defaults({
    forever: true,
});

var reqAuth = reqBasic.defaults({
    auth: { user: config.user, pass: config.key },
});

var reqJson = reqAuth.defaults({
    baseUrl: "https://www.browserstack.com/screenshots/",
    json: true,
});

var done = {};

var testNames = Object.keys(tests);
// testNames = ["Arrays"];
fs.mkdir("results", runTests);

function runTests() {
    testNames.forEach(prepareTest);
}

function prepareTest(name) {
    fs.mkdir(path.join("results", name), queueTest.bind(null, name));
}

var jobSpecs = [];
var waitingShots = 0;
var exitStatus = 0;

function queueTest(name) {
    for (var i = 0; i < browsers.length; i += 25) {
        var jobSpec = {
            url: "/",
            body: {
                url: config.url + name + ".html",
                orientation: "landscape",
                win_res: "1280x1024",
                mac_res: "1280x1024",
                quality: "Original",
                wait_time: 5,
                browsers: browsers.slice(i, i + 25)
            }
        };
        jobSpecs.push(jobSpec);
    }
    if (waitingShots === 0) {
        process.nextTick(nextJob);
        process.nextTick(nextJob);
    }
    waitingShots += browsers.length;
}

function nextJob() {
    if (jobSpecs.length !== 0) {
        reqJson.post(jobSpecs.pop(), statusReport);
    }
}

function statusReport(err, res, body) {
    if (err) throw err;
    if (res.statusCode >= 300) {
        if (res.statusCode == 422 &&
            body.message === "Parallel limit reached") {
            // try again later on?
        }
        console.error(res.statusCode + " " + res.statusMessage);
        console.error(body);
        process.exit(2);
        return;
    }
    // console.log(body);
    var anyPending = false;
    body.screenshots.forEach(function(shot) {
        if (shot.id in done) {
            return;
        }
        if (shot.state === "pending" || shot.state === "processing") {
            // console.log("Waiting for " + fileName(shot));
            anyPending = true;
            return;
        }
        done[shot.id] = true;
        if (shot.state === "done") {
            var file = fileName(shot);
            saveImage(shot.image_url, file);
        } else {
            exitStatus = 1;
            oneShotDone();
        }
    });
    if (anyPending) {
        var pollDelay = 5000, id = body.id;
        if (!id) {
            pollDelay = 15000;
            id = body.job_id;
        }
        setTimeout(function() {
            reqJson({url: "/" + id + ".json"}, statusReport);
        }, pollDelay);
    } else {
        process.nextTick(nextJob);
    }
}

var abbr = {
    "Windows": "win",
    "OS X": "osx",
    "Snow Leopard": "10.6",
    "Lion": "10.7",
    "Mountain Lion": "10.8",
    "Mavericks": "10.9",
    "Yosemite": "10.10",
    "El Capitan": "10.11",
    "Mobile Safari": "MobSafari",
    "Android Browser": "Android",
};

function fileName(shot) {
    var test = shot.url.replace(/.*\//, "").replace(/\.html/, "");
    var file = (abbr[shot.browser] || shot.browser) +
        (shot.browser_version || "").replace(/\.0$/, "") +
        "_" +
        (abbr[shot.os] || shot.os) +
        (abbr[shot.os_version] || shot.os_version || "") +
        (shot.device
         ? "_" + (abbr[shot.device] || shot.device).replace(/ /g, "")
         : "") +
        ".png";
    return path.join("results", test, file);
}

function saveImage(url, file) {
    var out = fs.createWriteStream(file);
    reqBasic(url).pipe(out);
    out.once("finish", function() {
        console.log(file);
        oneShotDone();
    });
}

function oneShotDone() {
    if (--waitingShots === 0) {
        console.log("Done.");
        process.exit(exitStatus);
    }
}
