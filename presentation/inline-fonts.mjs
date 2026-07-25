import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const deckPath = fileURLToPath(new URL("./darwin-pitch-v1.html", import.meta.url));
const fontDirectory = process.argv[2];

if (!fontDirectory) {
  throw new Error("Usage: node inline-fonts.mjs <font-directory>");
}

const fonts = [
  {
    family: "Archivo",
    file: "Archivo.ttf",
    style: "normal",
    weight: "100 900",
    stretch: "75% 125%",
  },
  {
    family: "Instrument Serif",
    file: "InstrumentSerif-Regular.ttf",
    style: "normal",
    weight: "400",
  },
  {
    family: "Instrument Serif",
    file: "InstrumentSerif-Italic.ttf",
    style: "italic",
    weight: "400",
  },
  {
    family: "IBM Plex Mono",
    file: "IBMPlexMono-Regular.ttf",
    style: "normal",
    weight: "400",
  },
  {
    family: "IBM Plex Mono",
    file: "IBMPlexMono-Medium.ttf",
    style: "normal",
    weight: "500",
  },
];

const declarations = fonts.map(font => {
  const base64 = readFileSync(join(fontDirectory, font.file)).toString("base64");
  const stretch = font.stretch ? `\n      font-stretch: ${font.stretch};` : "";
  return `@font-face {
      font-family: "${font.family}";
      src: url("data:font/ttf;base64,${base64}") format("truetype");
      font-style: ${font.style};
      font-weight: ${font.weight};${stretch}
      font-display: swap;
    }`;
}).join("\n    ");

const licenseNote = `/* Archivo, Instrument Serif and IBM Plex Mono are distributed under the SIL Open Font License 1.1. */`;
const replacement = `/* DARWIN_FONT_EMBED_START */\n    ${licenseNote}\n    ${declarations}\n    /* DARWIN_FONT_EMBED_END */`;
const block = /\/\* DARWIN_FONT_EMBED_START \*\/[\s\S]*?\/\* DARWIN_FONT_EMBED_END \*\//;
const original = readFileSync(deckPath, "utf8");

if (!block.test(original)) {
  throw new Error("Embedded font block was not found in the deck.");
}

writeFileSync(deckPath, original.replace(block, replacement));
console.log(`Embedded ${fonts.length} font files into ${deckPath}`);
