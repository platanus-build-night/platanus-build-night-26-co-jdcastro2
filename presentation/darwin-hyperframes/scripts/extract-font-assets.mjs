import fs from "node:fs";
import path from "node:path";

const sourcePath = path.resolve("../darwin-pitch-v1.html");
const outputDirectory = path.resolve("assets/fonts");
const source = fs.readFileSync(sourcePath, "utf8");
const faces = [...source.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)];
const names = [
  "archivo-variable.ttf",
  "instrument-serif-regular.ttf",
  "instrument-serif-italic.ttf",
  "ibm-plex-mono-regular.ttf",
  "ibm-plex-mono-medium.ttf",
];

if (faces.length !== names.length) {
  throw new Error(`Expected ${names.length} embedded fonts, found ${faces.length}.`);
}

fs.mkdirSync(outputDirectory, { recursive: true });

faces.forEach((match, index) => {
  const payload = match[1].match(/base64,([^"')]+)/)?.[1];
  if (!payload) {
    throw new Error(`Embedded font ${index + 1} has no base64 payload.`);
  }
  fs.writeFileSync(path.join(outputDirectory, names[index]), Buffer.from(payload, "base64"));
});

console.log(
  names
    .map((name) => `${name}: ${fs.statSync(path.join(outputDirectory, name)).size} bytes`)
    .join("\n"),
);
