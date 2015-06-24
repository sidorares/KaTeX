"use strict";

var querystring = require("querystring");
var child_process = require("child_process");
var fs = require("fs");
var path = require("path");
var Q = require("q"); // To debug, pass Q_DEBUG=1 in the environment
var PNG = require("node-png").PNG;
var fft = require("ndarray-fft");
var ndarray = require("ndarray-fft/node_modules/ndarray");

var data = require("../../test/screenshotter/ss_data");

// ignore some tests, since they contain commands not supported by LaTeX
var blacklist = {
    Colors: "Color handling differs",
    DeepFontSizing: "\\Huge inside \\dfrac doesn't work for some reason",
    KaTeX: "Custom command, doesn't exist in LaTeX"
};
var todo;
if (process.argv.length > 2) {
    todo = process.argv.slice(2);
} else {
    todo = Object.keys(data).filter(function(key) {
        return !blacklist[key];
    });
}

// Dimensions used when we do the FFT-based alignment computation
var alignWidth = 2048; // should be at least twice the width resp. height
var alignHeight = 2048; // of the screenshots, and a power of two.

// Compute required resolution to match test.html. 16px default font,
// scaled to 4em in test.html, and to 1.21em in katex.css. Corresponding
// LaTeX font size is 10pt. There are 72.27pt per inch.
var pxPerEm = 16 * 4 * 1.21;
var pxPerPt = pxPerEm / 10;
var dpi = pxPerPt * 72.27;

var tmpDir = "/tmp/texcmp";
var ssDir = path.normalize(
    path.join(__dirname, "..", "..", "test", "screenshotter"));
var imagesDir = path.join(ssDir, "images");
var teximgDir = path.join(ssDir, "tex");
var diffDir = path.join(ssDir, "diff");
var template;

Q.all([
    Q.nfcall(fs.readFile, path.join(ssDir, "test.tex"), "utf-8"),
    mkdir(tmpDir),
    mkdir(teximgDir),
    mkdir(diffDir)
]).spread(function(data) {
    template = data;
    // dirs have been created, template has been read, now rasterize.
    return Q.all(todo.map(processTestCase));
}).done();

// Process a single test case: rasterize, then create diff
function processTestCase(key) {
    if (blacklist[key]) return;
    var url = data[key];
    var query = url.replace(/^.*?\?/, ""); // extract query string
    query = query.replace(/\+/g, "%2B"); // plus doesn't mean space here
    query = querystring.parse(query);
    var tex = "$" + query.m + "$";
    if (query.display) {
        tex = "$$" + query.m + "$$";
    }
    if (query.pre) {
        tex = query.pre.replace("<br>", "\\\\") + tex;
    }
    if (query.post) {
        tex = tex + query.post.replace("<br>", "\\\\");
    }
    tex = template.replace(/\$.*\$/, tex.replace(/\$/g, "$$$$"));
    var texFile = path.join(tmpDir, key + ".tex");
    var pdfFile = path.join(tmpDir, key + ".pdf");
    var pngFile = path.join(teximgDir, key + "-pdflatex.png");
    var browserFile = path.join(imagesDir, key + "-firefox.png");
    var diffFile = path.join(diffDir, key + ".png");

    // Step 1: write key.tex file
    var fftLatex = Q.nfcall(fs.writeFile, texFile, tex).then(function() {
        // Step 2: call "pdflatex key" to create key.pdf
        return execFile("pdflatex", [
            "-interaction", "nonstopmode", key
        ], {cwd: tmpDir});
    }).then(function() {
        console.log("Typeset " + key);
        // Step 3: call "convert ... key.pdf key.png" to create key.png
        return execFile("convert", [
            "-density", dpi, "-units", "PixelsPerInch", "-flatten",
            pdfFile, pngFile
        ]);
    }).then(function() {
        console.log("Rasterized " + key);
        // Step 4: apply FFT to that
        return fftPNG(pngFile, true);
    });
    // Step 5: apply FFT to reference image as well
    var fftBrowser = fftPNG(browserFile, false);

    return Q.all([fftBrowser, fftLatex]).spread(function(browser, latex) {
        // Now we have the FFT result from both 
        // Step 6: find alignment which maximizes overlap.
        // This uses a FFT-based correlation comoputation.
        var x, y;
        var real = newMatrix();
        var imag = newMatrix();

        // Step 6a: (real + i*imag) = latex * conjugate(browser)
        for (y = 0; y < alignHeight; ++y) {
            for (x = 0; x < alignWidth; ++x) {
                var br = browser.real.get(y, x);
                var bi = browser.imag.get(y, x);
                var lr = latex.real.get(y, x);
                var li = latex.imag.get(y, x);
                real.set(y, x, br * lr + bi * li);
                imag.set(y, x, br * li - bi * lr);
            }
        }

        // Step 6b: (real + i*imag) = inverseFFT(real + i*imag)
        fft(-1, real, imag);

        // Step 6c: find position where the (squared) absolute value is maximal
        var ox = 0;
        var oy = 0;
        var ov = -1;
        for (y = 0; y < alignHeight; ++y) {
            for (x = 0; x < alignWidth; ++x) {
                var or = real.get(y, x);
                var oi = imag.get(y, x);
                var sq = or * or + oi * oi;
                if (ov < sq) {
                    ov = sq;
                    ox = x;
                    oy = y;
                }
            }
        }

        // Step 6d: Treat negative offsets in a non-cyclic way
        if (oy > (alignHeight >>> 1)) {
            oy -= alignHeight;
        }
        if (ox > (alignWidth >>> 1)) {
            ox -= alignWidth;
        }
        console.log("Positioned " + key + ": " + ox + ", " + oy);

        // Step 7: use these offsets to compute difference illustration
        var uw = Math.max(browser.width, latex.width) + Math.abs(ox);
        var uh = Math.max(browser.height, latex.height) + Math.abs(oy);
        var bx = Math.max(ox, 0);
        var by = Math.max(oy, 0);
        var lx = Math.max(-ox, 0);
        var ly = Math.max(-oy, 0);
        return execFile("convert", [
            "(", pngFile, "-grayscale", "Rec709Luminance",
            "-extent", uw + "x" + uh + "-" + lx + "-" + ly,
            ")",
            "(", browserFile, "-grayscale", "Rec709Luminance",
            "-extent", uw + "x" + uh + "-" + bx + "-" + by,
            ")",
            "(", "-clone", "0-1", "-compose", "darken", "-composite", ")",
            "-channel", "RGB", "-combine", "-trim", diffFile
        ]);
    }).then(function() {
        console.log("Compared " + key);
    });
};

// Create a directory, but ignore error if the directory already exists.
function mkdir(dir) {
    return Q.nfcall(fs.mkdir, dir).catch(function(err) {
        if (err.code !== "EEXIST")
            throw err;
    });
}

// Execute a given command, and return a promise to its output.
function execFile(cmd, args, opts) {
    var deferred = Q.defer();
    child_process.execFile(cmd, args, opts, function(err, stdout, stderr) {
        if (err) {
            console.error("Error executing " + cmd + " " + args.join(" "));
            console.error(stdout + stderr);
            err.stdout = stdout;
            err.stderr = stderr;
            deferred.reject(err);
        } else {
            deferred.resolve(stdout);
        }
    });
    return deferred.promise;
}

// Read given file, and apply FFT transformation to it.
function fftPNG(file, convert) {
    var deferred = Q.defer();
    var onerror = deferred.reject.bind(deferred);
    var stream;
    if (convert) {
        // The depth of the result has to be 8 bit to keep png-js
        // happy, and the following seems to achieve that.
        var proc = child_process.spawn("convert", [
            file, "-flatten", "-colorspace", "RGB", "-depth", "8", "png:-"
        ], {
            env: process.env,
            stdio: ["ignore", "pipe", process.stderr]
        });
        proc.on("error", onerror);
        proc.on("exit", function(code, signal) {
            if (code === 0) {
                return;
            } else if (code !== null) {
                deferred.reject(new Error(
                    "convert exited with code " + code));
            } else {
                deferred.reject(new Error(
                    "convert killed with signal " + signal));
            }
        });
        stream = proc.stdout;
    } else {
        stream = fs.createReadStream(file);
    }
    stream.on("error", onerror);
    stream = stream.pipe(new PNG());
    stream.on("error", onerror);
    stream.on("parsed", parsed);
    return deferred.promise;

    function parsed() {
        var real = newMatrix();
        var imag = newMatrix();
        var idx = 0;
        for (var y = 0; y < this.height; ++y) {
            for (var x = 0; x < this.width; ++x) {
                var r = this.data[idx++];
                var g = this.data[idx++];
                var b = this.data[idx++];
                var a = this.data[idx++];
                real.set(y, x, 3 * 255 - r - g - b);
            }
        }
        fft(1, real, imag);
        deferred.resolve({
            real: real,
            imag: imag,
            width: this.width,
            height: this.height
        });
    }
}

// Create a new matrix of preconfigured dimensions, initialized to zero
function newMatrix() {
    var array = new Float64Array(alignWidth * alignHeight);
    return new ndarray(array, [alignWidth, alignHeight]);
}
