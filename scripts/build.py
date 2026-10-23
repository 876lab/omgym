"""Build the app from src/ into two files.

index.html             the GitHub Pages site (full page with Home Screen icon and app name)
dist/artifact.html     the same app as a claude.ai artifact body (the artifact host adds the page wrapper)
Run: python3 scripts/build.py
"""
import os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
read = lambda p: open(os.path.join(root, p), encoding="utf-8").read()
body = read("src/shell.html") + '\n<script id="core">\n' + read("src/core.js") + '</script>\n<script id="ui">\n' + read("src/ui.js") + "</script>\n"
head = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#1D5B48">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="OMGym">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="description" content="45-minute workouts and budget meal plans with local food prices.">
<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="icons/favicon-32.png">
<link rel="manifest" href="manifest.webmanifest">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{-webkit-text-size-adjust:100%}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>
</head>
<body>
"""
open(os.path.join(root, "index.html"), "w", encoding="utf-8").write(head + body + "</body>\n</html>\n")
os.makedirs(os.path.join(root, "dist"), exist_ok=True)
open(os.path.join(root, "dist/artifact.html"), "w", encoding="utf-8").write(body)
print("built index.html and dist/artifact.html")
