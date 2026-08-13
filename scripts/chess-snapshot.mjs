/**
 * Pulls the three numbers the chess widget shows out of the snapshot the chess
 * repo's Action already publishes, and writes them into index.html between the
 * markers below.
 *
 * The two repos can't see each other — chess is private, this one is public and
 * builds on GitHub Pages, which has no build step to run a cross-repo checkout
 * in. So this reads the snapshot the chess site already serves publicly and
 * inlines the result. The page itself never makes a network call.
 *
 * Any failure exits non-zero and leaves the committed values alone. A slightly
 * old number beats a broken build, and the page hides the widget once the data
 * passes CHESS_MAX_AGE_DAYS anyway.
 */
import { readFile, writeFile } from "node:fs/promises";

const SOURCE = "https://chess.hassanahmad.dev/data/chess.json";
const TARGET = new URL("../index.html", import.meta.url);
const START = "/* chess:snapshot:start */";
const END = "/* chess:snapshot:end */";

const res = await fetch(SOURCE, { headers: { "User-Agent": "hassanahmad.dev build" } });
if (!res.ok) throw new Error(`${SOURCE} returned ${res.status}`);

const snap = await res.json();
const cls = snap.primary_time_class;
const block = snap.classes?.[cls];
if (!block) throw new Error(`no block for primary_time_class "${cls}"`);

const out = {
  rating: block.current,
  time_class: cls.charAt(0).toUpperCase() + cls.slice(1),
  delta_30d: block.delta_30d,
  generated_at: snap.generated_at
};
for (const k of ["rating", "delta_30d"]) {
  if (typeof out[k] !== "number") throw new Error(`${k} is not a number: ${out[k]}`);
}
if (!Number.isFinite(Date.parse(out.generated_at))) {
  throw new Error(`unparseable generated_at: ${out.generated_at}`);
}

const html = await readFile(TARGET, "utf8");
const region = new RegExp(
  `${START.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}`
);
if (!region.test(html)) throw new Error("snapshot markers not found in index.html");

// Function replacement so $-sequences in the JSON can't be interpreted.
const next = html.replace(region, () => `${START}\nvar CHESS = ${JSON.stringify(out)};\n${END}`);
if (next === html) {
  console.log("chess: unchanged");
} else {
  await writeFile(TARGET, next);
  console.log(`chess: ${out.rating} ${out.time_class}, 30d ${out.delta_30d >= 0 ? "+" : ""}${out.delta_30d} (${out.generated_at})`);
}
