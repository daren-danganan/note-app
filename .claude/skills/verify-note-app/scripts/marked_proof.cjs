#!/usr/bin/env node
// Headless proof for the markdown-preview feature (see
// features/markdown-preview.md). This exercises the exact same pure
// function app.js calls on toggle/typing -- `marked.parse(editorValue)` --
// without touching the GUI or any Tauri/DOM API, closing the "no automated
// proof" gap for this feature.
//
// Why not plain `require()`: note-app/package.json has "type": "module",
// so Node's CJS-interop loader treats the vendored UMD bundle as an ES
// module with no named exports (you get an empty namespace object, and
// `marked.parse` is undefined) even though it's really a CommonJS/UMD
// file. We sidestep that entirely by reading the file's source and running
// it in a fresh vm context with no `module`/`exports` globals defined --
// which makes the UMD wrapper fall into its browser branch
// (`g["marked"] = f()`), exactly as it does when loaded via a plain
// `<script>` tag in src/index.html. This is reading real vendored source,
// not reimplementing markdown rendering.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const MARKED_PATH = path.join(REPO_ROOT, 'src', 'vendor', 'marked.js');

const src = fs.readFileSync(MARKED_PATH, 'utf8');
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: MARKED_PATH });

assert.strictEqual(typeof sandbox.marked, 'object', 'expected global `marked` object (browser UMD branch)');
assert.strictEqual(typeof sandbox.marked.parse, 'function', 'expected marked.parse to be a function');

const input = '# Heading\n\nSome **bold** text\n\n- item1\n- item2';
const html = sandbox.marked.parse(input);

assert.ok(html.includes('<h1>Heading</h1>'), 'heading not rendered');
assert.ok(html.includes('<strong>bold</strong>'), 'bold not rendered');
assert.ok(html.includes('<li>item1</li>') && html.includes('<li>item2</li>'), 'list items not rendered');

console.log('marked.parse() rendered input correctly:');
console.log(html);
console.log('\nPASS: src/vendor/marked.js (the file loaded by src/index.html and called by');
console.log('app.js\'s updatePreview() as window.marked.parse(editorEl.value)) renders');
console.log('headings, bold, and lists as expected.');
console.log('\nNOT proven by this script: that app.js actually wires the toggle button /');
console.log('input event to call marked.parse and write the result into #preview.innerHTML');
console.log('-- that wiring is confirmed by reading src/app.js (see markdown-preview.md),');
console.log('or by the GUI drive path once Accessibility access is available.');
