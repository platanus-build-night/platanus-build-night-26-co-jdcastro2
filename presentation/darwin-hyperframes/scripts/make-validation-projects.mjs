import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const projectRoot = path.resolve(".");
const source = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
const scenePattern = /<section\s+id="(darwin-[^"]+)"[\s\S]*?<\/section>/g;
const scenes = [...source.matchAll(scenePattern)].map((match) => ({
  id: match[1],
  html: match[0],
}));

if (scenes.length !== 6) {
  throw new Error(`Expected six slideshow scenes, found ${scenes.length}.`);
}

const firstSceneIndex = source.indexOf(scenes[0].html);
const withoutScenes = scenes.reduce((html, scene) => html.replace(scene.html, ""), source);

for (const target of scenes) {
  const targetDirectory = path.join(os.tmpdir(), `darwin-hf-${target.id}`);
  fs.rmSync(targetDirectory, { recursive: true, force: true });
  fs.mkdirSync(targetDirectory, { recursive: true });
  fs.cpSync(path.join(projectRoot, "assets"), path.join(targetDirectory, "assets"), {
    recursive: true,
  });
  fs.copyFileSync(
    path.join(projectRoot, "hyperframes.json"),
    path.join(targetDirectory, "hyperframes.json"),
  );
  fs.copyFileSync(path.join(projectRoot, "meta.json"), path.join(targetDirectory, "meta.json"));

  const originalStart = Number(target.html.match(/data-start="([^"]+)"/)?.[1]);
  const shiftedTarget = {
    ...target,
    html: target.html
      .replaceAll(`data-start="${originalStart}"`, 'data-start="0"')
      .replace('data-track-index="1"', 'data-track-index="99"'),
  };
  const orderedScenes = [shiftedTarget, ...scenes.filter((scene) => scene.id !== target.id)]
    .map((scene) => scene.html)
    .join("\n\n");
  let reordered =
    withoutScenes.slice(0, firstSceneIndex) +
    orderedScenes +
    withoutScenes.slice(firstSceneIndex);
  reordered = reordered.replace(
    /<script type="application\/hyperframes-slideshow\+json">[\s\S]*?<\/script>/,
    `<script type="application/hyperframes-slideshow+json">
      {"slides":[{"sceneId":"${target.id}"}],"slideSequences":[]}
    </script>`,
  );
  reordered = reordered.replace(`var start = ${originalStart};`, "var start = 0;");
  reordered = reordered.replace(
    "</head>",
    `<style>.hf-scene:not(#${target.id}){display:none!important}</style></head>`,
  );
  fs.writeFileSync(path.join(targetDirectory, "index.html"), reordered);
  console.log(`${target.id}\t${targetDirectory}`);
}
