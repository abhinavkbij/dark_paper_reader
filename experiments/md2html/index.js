import {marked} from 'marked';
import showdown from 'showdown';
import * as fs from 'fs/promises';
import DOMPurify from 'dompurify';
import { JSDOM } from 'jsdom';

async function readFile(path="/Users/abhinavkbij/Downloads/moltz2009 (2).md", encoding='utf-8') {
    const markdown = await fs.readFile(path, encoding);
    return markdown;
}

const markdown = await readFile();
// const html = marked.parse(markdown.toString());
const converter = new showdown.Converter();
const html = converter.makeHtml(markdown);

async function writeFile(path, content) {
    await fs.writeFile(path, content);
}

const window = new JSDOM('').window;
const purify = DOMPurify(window);
const clean = purify.sanitize(html);
// const clean = DOMPurify.sanitize(html);
await writeFile("./moltz2009.html", clean);