import React, { useEffect, useMemo, useRef, useState } from "react";

// Single-file React app that mimics a Polysphere-like puzzle.
// Mechanics: pieces are scrambled in 2D. As you rotate (drag/scroll)
// the angle approaches a hidden target; when near it, pieces smoothly
// interpolate back into perfect alignment to reveal the image.
// No TypeScript, no extra CSS files.

// HOW TO USE
// 1) Drop this into your React project as src/App.js
// 2) Run your app. Click & drag horizontally (or use the slider / mouse wheel)
// 3) Swap image by entering a URL, or pick from the presets.
//    To add your own assets, put them in public/ and reference
//    them like "/my-photo.jpg".

const PRESETS = [
  // Public domain / example images; replace or add your own.
  { label: "Portrait (provided)", url: "/assets/HoChiMinh1.jpg" },
  {
    label: "Mountains",
    url: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?w=1200",
  },
  {
    label: "City",
    url: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?w=1200",
  },
  {
    label: "Sea",
    url: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200",
  },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function useImageSize(src) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!src) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => setSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = src;
  }, [src]);
  return size;
}

export default function App() {
  const [imgUrl, setImgUrl] = useState(PRESETS[0].url);
  const { w: imgW, h: imgH } = useImageSize(imgUrl);

  const containerRef = useRef(null);
  const [angle, setAngle] = useState(0); // user-controlled angle (radians)
  const [dragging, setDragging] = useState(false); // track pointer drag
  const rafRef = useRef(null); // for snapback animation
  const secretAngle = useMemo(() => Math.random() * Math.PI * 2, []);

  const grid = 22; // number of tiles per side
  const [scrambleSeed] = useState(() => Math.random());

  // Build tiles w/ deterministic scramble (based on scrambleSeed)
  const tiles = useMemo(() => {
    const tiles = [];
    const rng = mulberry32(Math.floor(scrambleSeed * 2 ** 31));
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        tiles.push({ x, y, r1: rng(), r2: rng(), r3: rng() });
      }
    }
    return tiles;
  }, [grid, scrambleSeed]);

  // drag to rotate
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let isDown = false;
    let lastX = 0;

    const onDown = (e) => {
      isDown = true;
      setDragging(true);
      lastX = getX(e);
    };
    const onMove = (e) => {
      if (!isDown) return;
      const x = getX(e);
      const dx = x - lastX;
      lastX = x;
      setAngle((a) => a + dx * 0.01); // sensitivity
    };
    const onUp = () => {
      isDown = false;
      setDragging(false);
    };

    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);

    // Wheel/scroll intentionally disabled to avoid accidental solves

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // interpolation factor: t in [0,1]; close to 1 when angle ~= secret
  const t = useMemo(() => {
    const d = wrapAngle(angle - secretAngle);
    // a steep bell function so it "clicks" into place near the target
    const c = Math.cos(d);
    const shaped = Math.pow(clamp((c + 1) / 2, 0, 1), 6);
    return shaped;
  }, [angle, secretAngle]);

  // completion check
  const solved = t > 0.985;

  // Snapback assist: when close enough and not dragging, gently ease angle to the secret
  useEffect(() => {
    // Only assist if near solution and not actively dragging
    if (dragging || solved || t < 0.965) return;

    cancelAnimationFrame(rafRef.current);

    const step = () => {
      setAngle((a) => {
        const d = wrapAngle(secretAngle - a); // shortest path delta
        const done = Math.abs(d) < 0.0015;
        if (done) return secretAngle;
        // critically damped ease toward the target
        return a + d * 0.18;
      });
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [t, dragging, solved, secretAngle]);

  // layout sizes (responsive, preserve aspect of image area)
  const outerW = 720;
  const outerH = 540;
  const { drawW, drawH } = fitContain(imgW || 4, imgH || 3, outerW, outerH);

  // compute positions for each tile
  const tileW = drawW / grid;
  const tileH = drawH / grid;

  const pieces = tiles.map((tile, idx) => {
    // target location (assembled)
    const tx = tile.x * tileW;
    const ty = tile.y * tileH;

    // scrambled location (deterministic random but visually spherical)
    const angleRnd = tile.r1 * Math.PI * 2;
    const radius = (0.15 + 0.85 * tile.r2) * Math.max(drawW, drawH) * 0.7;
    const sx = drawW / 2 + Math.cos(angleRnd) * radius - tileW / 2;
    const sy = drawH / 2 + Math.sin(angleRnd) * radius - tileH / 2;

    // interpolate based on t and also add a little wobble using sin(angle)
    const wobble = Math.sin(angle * 2 + tile.r3 * 10) * (1 - t) * 6;
    const x = lerp(sx, tx, t) + wobble;
    const y = lerp(sy, ty, t) + wobble;

    const bgX = -tile.x * tileW + "px";
    const bgY = -tile.y * tileH + "px";

    return (
      <div
        key={idx}
        style={{
          position: "absolute",
          left: x,
          top: y,
          width: tileW,
          height: tileH,
          backgroundImage: `url(${imgUrl})`,
          backgroundSize: `${drawW}px ${drawH}px`,
          backgroundPosition: `${bgX} ${bgY}`,
          borderRadius: 0,
          boxShadow: solved ? "none" : "0 2px 6px rgba(0,0,0,0.25)",
          transition: solved ? "box-shadow 0.4s ease" : undefined,
          imageRendering: "auto",
          willChange: "transform,left,top",
        }}
      />
    );
  });

  return (
    <div style={styles.appRoot}>
      <h1 style={styles.title}>Polysphere-like Puzzle (React, single file)</h1>
      <Controls
        imgUrl={imgUrl}
        setImgUrl={setImgUrl}
        angle={angle}
        setAngle={setAngle}
        t={t}
      />

      <div style={styles.stageWrap}>
        <div
          ref={containerRef}
          style={{
            position: "relative",
            width: outerW,
            height: outerH,
            background: solved
              ? "#111"
              : "radial-gradient(circle at 50% 50%, #1b1b1b, #0d0d0d)",
            borderRadius: 16,
            overflow: "hidden",
            cursor: "grab",
            userSelect: "none",
          }}
          title="Drag to rotate; pieces reassemble when you find the sweet spot"
        >
          {/* center the image area */}
          <div
            style={{
              position: "absolute",
              left: (outerW - drawW) / 2,
              top: (outerH - drawH) / 2,
              width: drawW,
              height: drawH,
              filter: solved ? "none" : "contrast(1.05) saturate(1.08)",
            }}
          >
            {pieces}
            {solved && (
              <div style={styles.solvedBanner}>
                <span>Perfect!</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer style={styles.footer}>
        <span>
          Tip: drag or scroll to change the angle. When the shimmer meter is
          full, you solved it.
        </span>
      </footer>
    </div>
  );
}

function Controls({ imgUrl, setImgUrl, angle, setAngle, t }) {
  const [urlInput, setUrlInput] = useState(imgUrl);
  useEffect(() => setUrlInput(imgUrl), [imgUrl]);

  return (
    <div style={styles.controls}>
      <div style={styles.row}>
        <label style={styles.label}>Angle</label>
        <input
          type="range"
          min="0"
          max={Math.PI * 2}
          step="0.001"
          value={wrapAngle(angle) + Math.PI} // keep slider continuous
          onChange={(e) => setAngle(parseFloat(e.target.value) - Math.PI)}
          style={{ flex: 1 }}
        />
        <div style={{ width: 80, textAlign: "right" }}>
          {wrapAngle(angle).toFixed(2)} rad
        </div>
      </div>
      <div style={styles.row}>
        <label style={styles.label}>Image</label>
        <select
          value={imgUrl}
          onChange={(e) => setImgUrl(e.target.value)}
          style={styles.select}
        >
          {PRESETS.map((p) => (
            <option key={p.url} value={p.url}>
              {p.label}
            </option>
          ))}
        </select>
      </div>
      <div style={styles.row}>
        <label style={styles.label}>Custom URL</label>
        <input
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://.../my-image.jpg"
          style={styles.input}
        />
        <button onClick={() => setImgUrl(urlInput)} style={styles.button}>
          Use
        </button>
      </div>
      <div style={styles.row}>
        <label style={styles.label}>Shimmer</label>
        <div style={styles.meterBox}>
          <div
            style={{ ...styles.meterFill, width: `${(t * 100).toFixed(1)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ------- util & styles -------
function fitContain(srcW, srcH, maxW, maxH) {
  if (!srcW || !srcH) return { drawW: maxW, drawH: maxH };
  const r = Math.min(maxW / srcW, maxH / srcH);
  return { drawW: Math.round(srcW * r), drawH: Math.round(srcH * r) };
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function getX(e) {
  return e.touches ? e.touches[0].clientX : e.clientX;
}
function wrapAngle(a) {
  // wrap to [-PI, PI]
  let x =
    ((((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)) - Math.PI;
  return x;
}
// Tiny deterministic RNG so the scramble stays the same until refresh
function mulberry32(a) {
  return function () {
    var t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const styles = {
  appRoot: {
    minHeight: "100vh",
    background: "linear-gradient(180deg,#0b0f12,#141a20)",
    color: "#e8eef8",
    padding: 24,
    boxSizing: "border-box",
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
  },
  title: { fontWeight: 700, margin: "0 0 16px", fontSize: 20 },
  controls: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
    maxWidth: 720,
    margin: "0 auto 16px auto",
    background: "rgba(255,255,255,0.04)",
    padding: 12,
    borderRadius: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
    backdropFilter: "blur(4px)",
  },
  row: { display: "flex", alignItems: "center", gap: 12 },
  label: { width: 100, opacity: 0.9 },
  input: {
    flex: 1,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #2e3a46",
    background: "#0f1419",
    color: "#e8eef8",
    outline: "none",
  },
  select: {
    flex: 1,
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #2e3a46",
    background: "#0f1419",
    color: "#e8eef8",
    outline: "none",
  },
  button: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #445566",
    background: "#1a2633",
    color: "#e8eef8",
    cursor: "pointer",
  },
  meterBox: {
    position: "relative",
    flex: 1,
    height: 10,
    background: "#12161a",
    border: "1px solid #2e3a46",
    borderRadius: 999,
    overflow: "hidden",
  },
  meterFill: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 0,
    background: "linear-gradient(90deg,#78e0ff,#86ffa7)",
  },
  stageWrap: { display: "flex", justifyContent: "center", margin: "16px 0" },
  solvedBanner: {
    position: "absolute",
    right: 10,
    bottom: 10,
    padding: "6px 10px",
    borderRadius: 8,
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(255,255,255,0.1)",
    fontWeight: 600,
    letterSpacing: 0.3,
  },
  footer: { opacity: 0.8, textAlign: "center", marginTop: 8 },
};
