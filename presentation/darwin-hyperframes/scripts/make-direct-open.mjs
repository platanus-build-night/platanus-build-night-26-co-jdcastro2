import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(scriptDir, "..");
const entryPath = path.join(projectDir, "index.html");
const gsapPath =
  "/Users/juliancastro/.hermes/hermes-agent/node_modules/gsap/dist/gsap.min.js";
const localGsapPath = path.join(projectDir, "assets", "gsap.min.js");
const fontDir = path.join(projectDir, "assets", "fonts");
const appFontDir = path.resolve(projectDir, "../../public/assets/fonts");

const externalGsap =
  '    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>';
const standaloneStyles = `

      /* === DIRECT-OPEN MODE (file://) === */
      html.standalone,
      html.standalone body {
        width: 100%;
        height: 100%;
        min-width: 0;
        min-height: 0;
        background: #0a0a0b;
      }

      html.standalone body {
        position: fixed;
        inset: 0;
        cursor: default;
        user-select: none;
      }

      html.standalone .hf-scene {
        left: var(--standalone-left, 0px);
        top: var(--standalone-top, 0px);
        right: auto;
        bottom: auto;
        z-index: 0;
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        transform: scale(var(--standalone-scale, 1));
        transform-origin: 0 0;
      }

      html.standalone .hf-scene.is-active {
        z-index: 1;
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
      }

      .standalone-ui {
        display: none;
      }

      html.standalone .standalone-ui {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: block;
        pointer-events: none;
        font-family: "JetBrains Mono", monospace;
        color: #edeef2;
      }

      .standalone-progress {
        position: absolute;
        right: 24px;
        bottom: 21px;
        left: 24px;
        height: 2px;
        overflow: hidden;
        background: rgba(237, 238, 242, 0.12);
      }

      .standalone-progress > span {
        display: block;
        width: calc(var(--standalone-progress, 1) * 100%);
        height: 100%;
        background: #6fcf87;
        transform-origin: left center;
        transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1);
      }

      .standalone-count,
      .standalone-help {
        position: absolute;
        bottom: 31px;
        padding: 7px 10px;
        border: 1px solid #262833;
        background: rgba(13, 14, 18, 0.9);
        backdrop-filter: blur(12px);
        font-size: 10px;
        line-height: 1;
        letter-spacing: 0.13em;
        text-transform: uppercase;
      }

      .standalone-count {
        right: 24px;
      }

      .standalone-help {
        left: 24px;
        opacity: 0.72;
      }

      html.standalone.ui-hidden .standalone-ui {
        opacity: 0;
      }

      @media (max-width: 800px) {
        .standalone-help {
          display: none;
        }
      }`;

const standaloneController = `

    <script>
      /* === DIRECT-OPEN CONTROLLER — active only for file:// === */
      (function () {
        if (!document.documentElement.classList.contains("standalone")) return;

        var slideIds = [
          "darwin-cover",
          "darwin-supply",
          "darwin-revenue",
          "darwin-evidence",
          "darwin-system",
          "darwin-close",
        ];
        var starts = {
          "darwin-cover": 0,
          "darwin-supply": 8,
          "darwin-revenue": 16,
          "darwin-evidence": 24,
          "darwin-system": 33,
          "darwin-close": 43,
        };
        var scenes = slideIds.map(function (id) {
          return document.getElementById(id);
        });
        var current = 0;
        var wheelLocked = false;
        var touchX = null;
        var playbackFallback = null;

        var ui = document.createElement("div");
        ui.className = "standalone-ui";
        ui.setAttribute("aria-hidden", "true");
        ui.innerHTML =
          '<div class="standalone-help">← → navegar · F pantalla completa</div>' +
          '<div class="standalone-count"><span>01</span> / 06</div>' +
          '<div class="standalone-progress"><span></span></div>';
        document.body.appendChild(ui);

        var count = ui.querySelector(".standalone-count span");
        var progress = ui.querySelector(".standalone-progress span");

        function fit() {
          var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
          var left = (window.innerWidth - 1920 * scale) / 2;
          var top = (window.innerHeight - 1080 * scale) / 2;
          document.documentElement.style.setProperty("--standalone-scale", scale);
          document.documentElement.style.setProperty("--standalone-left", left + "px");
          document.documentElement.style.setProperty("--standalone-top", top + "px");
        }

        function revealStatic(id) {
          var scene = scenes[slideIds.indexOf(id)];
          if (!scene) return;
          scene.querySelectorAll("*").forEach(function (element) {
            if (element.style.opacity === "0") element.style.opacity = "1";
            if (element.style.visibility === "hidden") element.style.visibility = "visible";
          });
          scene.querySelectorAll("path").forEach(function (path) {
            path.style.strokeDashoffset = "0";
          });
          if (id === "darwin-cover") {
            scene.querySelectorAll(".cover-glyph").forEach(function (glyph) {
              glyph.style.transform =
                "translate3d(" +
                glyph.dataset.targetX +
                "px," +
                glyph.dataset.targetY +
                "px,0)";
            });
          }
        }

        function playScene(id) {
          window.clearTimeout(playbackFallback);
          Object.keys(window.__timelines || {}).forEach(function (key) {
            var candidate = window.__timelines[key];
            if (candidate && key !== id) candidate.pause();
          });

          var timeline = window.__timelines && window.__timelines[id];
          if (!timeline) {
            revealStatic(id);
            return;
          }
          var start = starts[id];
          var hero = Math.min(start + 3.35, timeline.duration());
          timeline.pause(start, false).timeScale(1);
          window.setTimeout(function () {
            if (slideIds[current] === id) timeline.play();
          }, 0);
          playbackFallback = window.setTimeout(function () {
            if (slideIds[current] === id && timeline.time() < start + 0.15) {
              timeline.pause(hero, false);
            }
          }, 500);
        }

        function show(index) {
          current = Math.max(0, Math.min(slideIds.length - 1, index));
          scenes.forEach(function (scene, sceneIndex) {
            if (!scene) return;
            scene.classList.toggle("is-active", sceneIndex === current);
          });
          count.textContent = String(current + 1).padStart(2, "0");
          progress.style.width = ((current + 1) / slideIds.length) * 100 + "%";
          playScene(slideIds[current]);
        }

        function next() {
          show(Math.min(current + 1, slideIds.length - 1));
        }

        function previous() {
          show(Math.max(current - 1, 0));
        }

        document.addEventListener("keydown", function (event) {
          if (["ArrowRight", "PageDown", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            next();
          } else if (["ArrowLeft", "PageUp", "Backspace"].includes(event.key)) {
            event.preventDefault();
            previous();
          } else if (event.key === "Home") {
            show(0);
          } else if (event.key === "End") {
            show(slideIds.length - 1);
          } else if (event.key.toLowerCase() === "f") {
            if (!document.fullscreenElement) {
              document.documentElement.requestFullscreen?.();
            } else {
              document.exitFullscreen?.();
            }
          } else if (event.key.toLowerCase() === "h") {
            document.documentElement.classList.toggle("ui-hidden");
          }
        });

        document.addEventListener(
          "wheel",
          function (event) {
            if (wheelLocked || Math.abs(event.deltaY) < 12) return;
            wheelLocked = true;
            event.deltaY > 0 ? next() : previous();
            window.setTimeout(function () {
              wheelLocked = false;
            }, 620);
          },
          { passive: true },
        );

        document.addEventListener("pointerup", function (event) {
          if (event.pointerType === "touch") return;
          if (event.clientX > window.innerWidth / 2) next();
          else previous();
        });

        document.addEventListener(
          "touchstart",
          function (event) {
            touchX = event.changedTouches[0].clientX;
          },
          { passive: true },
        );

        document.addEventListener(
          "touchend",
          function (event) {
            if (touchX === null) return;
            var delta = event.changedTouches[0].clientX - touchX;
            if (Math.abs(delta) > 48) delta < 0 ? next() : previous();
            touchX = null;
          },
          { passive: true },
        );

        window.addEventListener("resize", fit);
        fit();
        show(0);
      })();
    </script>`;

let html = fs.readFileSync(entryPath, "utf8");

if (fs.existsSync(gsapPath)) {
  fs.copyFileSync(gsapPath, localGsapPath);
}
if (!fs.existsSync(localGsapPath)) {
  throw new Error("GSAP source is unavailable.");
}

const embeddedStart =
  '    <script>/* GSAP 3.14.2 — vendored for offline playback */\n';
const standaloneHead =
  '    <script>\n      if (location.protocol === "file:") {\n        document.documentElement.classList.add("standalone");\n      }\n    </script>';
const localGsap = '    <script src="assets/gsap.min.js"></script>';
const gsapData =
  "data:text/javascript;base64," +
  fs.readFileSync(localGsapPath).toString("base64");
const embeddedGsap = `    <script src="${gsapData}"></script>`;

if (html.includes(embeddedStart)) {
  const start = html.indexOf(embeddedStart);
  const end = html.indexOf(standaloneHead, start);
  if (end === -1) throw new Error("Could not locate the standalone head marker.");
  html = html.slice(0, start) + localGsap + "\n" + html.slice(end);
} else if (html.includes(externalGsap)) {
  html = html.replace(externalGsap, `${localGsap}\n${standaloneHead}`);
} else if (
  !html.includes(localGsap) &&
  !html.includes('<script src="data:text/javascript;base64,')
) {
  throw new Error("Expected a known GSAP script tag in index.html.");
}

if (!html.includes("DIRECT-OPEN MODE")) {
  html = html.replace("    </style>\n  </head>", `${standaloneStyles}\n    </style>\n  </head>`);
}
if (!html.includes("DIRECT-OPEN CONTROLLER")) {
  html = html.replace("  </body>\n</html>", `${standaloneController}\n  </body>\n</html>`);
}

html = html.replace(localGsap, embeddedGsap);

const fonts = [
  "archivo-variable.ttf",
  "instrument-serif-regular.ttf",
  "instrument-serif-italic.ttf",
  "ibm-plex-mono-regular.ttf",
  "ibm-plex-mono-medium.ttf",
];

const appFonts = [
  "inter-400.woff2",
  "inter-500.woff2",
  "inter-600.woff2",
  "inter-700.woff2",
  "jetbrains-mono-400.woff2",
  "jetbrains-mono-500.woff2",
  "jetbrains-mono-700.woff2",
];

fs.mkdirSync(fontDir, { recursive: true });
appFonts.forEach((filename) => {
  const source = path.join(appFontDir, filename);
  const target = path.join(fontDir, filename);
  if (fs.existsSync(source)) fs.copyFileSync(source, target);
});

fonts.forEach((filename) => {
  const relativeUrl = `url("assets/fonts/${filename}")`;
  if (!html.includes(relativeUrl)) return;
  const fontData =
    "data:font/ttf;base64," +
    fs.readFileSync(path.join(fontDir, filename)).toString("base64");
  html = html.replace(relativeUrl, `url("${fontData}")`);
});

appFonts.forEach((filename) => {
  const relativeUrl = `url("assets/fonts/${filename}")`;
  if (!html.includes(relativeUrl)) return;
  const fontData =
    "data:font/woff2;base64," +
    fs.readFileSync(path.join(fontDir, filename)).toString("base64");
  html = html.replaceAll(relativeUrl, `url("${fontData}")`);
});

const logoSrc = 'src=".media/images/logo_002.png"';
if (html.includes(logoSrc)) {
  const logoData =
    "data:image/png;base64," +
    fs
      .readFileSync(path.join(projectDir, ".media", "images", "logo_002.png"))
      .toString("base64");
  html = html.replaceAll(logoSrc, `src="${logoData}"`);
}

fs.writeFileSync(entryPath, html);
console.log(`Built direct-open deck: ${entryPath}`);
