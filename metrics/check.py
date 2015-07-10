#!/usr/bin/env python

import io
import json
import os
import os.path
import re
import subprocess
import sys
import unicodedata
from fontTools.ttLib import TTFont

needNoMetrics = (0x20, 0xA0, 0xEFFD, 0xEFFE, 0xEFFF)

exitStatus = 0
def fail(msg, *args):
    global exit_status
    sys.stdout.write(" ! " + msg.format(*args) + "\n")
    exit_status = 1

with io.open("../src/fontMetricsData.json", "r") as f:
    metrics = json.load(f)

mapping = json.loads(subprocess.check_output([
    os.getenv("PERL", "perl"), "mapping.pl"]));

cmFonts = set(c["font"] for f in mapping.itervalues() for c in f.itervalues())
pfbNames = dict()
reMapLine = re.compile(r"^dup (\d+) /([^ ]+) put$", re.M)
for font in cmFonts:
    names = [".notdef"] * 256
    pfbNames[font] = names
    pfb = subprocess.check_output(["kpsewhich", font + ".pfb"]).rstrip()
    with io.open(pfb, "rb") as f:
        pfb = f.read()
    pos = pfb.index("/Encoding")
    for match in reMapLine.finditer(pfb[pos:]):
        names[int(match.group(1))] = match.group(2)

charts = "../build/charts"
if not os.path.exists(charts):
    os.makedirs(charts)

variantMap = {
    "Regular": ("normal", "normal"),
    "Italic": ("normal", "italic"),
    "Bold": ("bold", "normal"),
    "BoldItalic": ("bold", "italic"),
}

for font in sorted(mapping):
    family, variant = font.split("-")
    weight, style = variantMap[variant]
    html = io.open(os.path.join(charts, font + ".html"), "w", encoding="utf-8")
    html.write(u"""<!DOCTYPE html>
<html>
    <head>
        <meta charset="UTF-8">
        <title>KaTeX {} font chart</title>
        <link href="../katex.min.css" rel="stylesheet" type="text/css">
        <style type="text/css">
            table td:nth-child(2) {{
                font-family: KaTeX_{};
                font-weight: {};
                font-style: {};
                padding-left: 1em;
            }}
        </style>
    </head>
    <body>
        <table>
            <tr>
                <th>Code</th>
                <th>KaTeX</th>
                <th>Def.</th>
                <th>TTF name</th>
                <th>PFB name</th>
                <th>TeX font</th>
                <th>Unicode name</th>
            </tr>
""".format(font, family, weight, style))

    glyphs = metrics[font]
    cmChars = mapping[font]
    fontInfo = TTFont("../static/fonts/KaTeX_" + font + ".ttf")
    cmap = [t.cmap for t in fontInfo["cmap"].tables
            if (t.platformID == 0)
            or (t.platformID == 3 and t.platEncID in (1, 10))]
    assert cmap
    codepoints = set(map(int, glyphs.iterkeys()))
    codepoints.update(*[t.iterkeys() for t in cmap])
    for code in sorted(codepoints):
        uname = unicodedata.name(unichr(code), "???")
        names = set(t.get(code) for t in cmap)
        if names and not all(n.startswith("uni") for n in names):
            name = ", ".join(sorted(names))
        else:
            name = uname
        if not names:
            fail("Codepoint U+{:04x} of font {} maps to no name", code, font)
        elif len(names) != 1:
            fail("Codepoint U+{:04x} of font {} maps to multiple names: {}",
                 code, font, name)
        if str(code) not in glyphs:
            if code not in needNoMetrics:
                fail("Codepoint U+{:04x} of font {} has no metrics ({})",
                     code, font, name)
        cmChar = cmChars.get(str(code))
        if cmChar:
            cmFont = cmChar["font"]
            cmCode = int(cmChar["char"])
            pfbName = pfbNames[cmFont][cmCode]
            if len(names) == 1 and name != uname and name != pfbName:
                fail("Verify name {0} of KaTeX_{1} glyph U+{2:04x} "
                     "matches {3} of {4} glyph {5:d}=0x{5:02x}",
                     name, font, code, pfbName, cmFont, cmCode)
        else:
            cmFont = pfbName = u"\u2014"
        row = [
            "\\u{:04x}".format(code),
            unichr(code),
            unichr(code),
            ", ".join(names),
            pfbName,
            cmFont,
            uname,
        ]
        row = [c.replace("<", "&lt;") for c in row]
        row = ["                <td>" + c + "</td>\n" for c in row]
        row = u"            <tr>\n" + "".join(row) + "            </tr>\n"
        html.write(row)
    html.write(u"        </table>\n    </body>\n</html>\n")
    html.close()
    print("{}: checked {} codepoints".format(font, len(codepoints)))

sys.exit(exitStatus)
