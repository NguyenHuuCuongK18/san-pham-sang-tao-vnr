import React, { useEffect, useMemo, useRef, useState } from "react";

// Minigame: Multi-stage Polysphere-like puzzle featuring Vietnamese leaders
// Players solve multiple stages, earning points based on solve speed
// Faster solves = more points

// Stages featuring Vietnamese leaders
const STAGES = [
  { id: 1, name: "Hồ Chí Minh", url: "/assets/HoChiMinh1.jpg" },
  { id: 2, name: "Võ Nguyên Giáp", url: "/assets/VoNguyenGiap.jpg" },
  { id: 3, name: "Phan Bội Châu", url: "/assets/PhanBoiChau.jpg" },
  { id: 4, name: "Lê Duẩn", url: "/assets/LeDuan.png" },
];

const MAX_POINTS_PER_STAGE = 1000; // Maximum points for instant solve
const MIN_POINTS_PER_STAGE = 100; // Minimum points for slow solve
const TIME_FOR_MIN_POINTS = 120; // Seconds before reaching minimum points

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

// Calculate points based on time taken (faster = more points)
function calculatePoints(seconds) {
  if (seconds <= 0) return MAX_POINTS_PER_STAGE;
  if (seconds >= TIME_FOR_MIN_POINTS) return MIN_POINTS_PER_STAGE;
  // Linear interpolation from max to min points
  const ratio = seconds / TIME_FOR_MIN_POINTS;
  return Math.round(
    MAX_POINTS_PER_STAGE - ratio * (MAX_POINTS_PER_STAGE - MIN_POINTS_PER_STAGE)
  );
}

export default function App() {
  // Game state
  const [gameState, setGameState] = useState("menu"); // "menu", "playing", "completed"
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [stageScores, setStageScores] = useState([]); // Array of {stage, time, points}
  const [stageStartTime, setStageStartTime] = useState(null);

  const currentStage = STAGES[currentStageIndex];
  // keep initial image URL deterministic
  const [imgUrl, setImgUrl] = useState(STAGES[0].url);
  const { w: imgW, h: imgH } = useImageSize(imgUrl);

  const containerRef = useRef(null);
  const [angle, setAngle] = useState(0); // user-controlled angle (radians)
  const [dragging, setDragging] = useState(false); // track pointer drag
  const rafRef = useRef(null); // for snapback animation
  const [stageSolved, setStageSolved] = useState(false); // record solved state per-stage
  // regenerate secret angle when the stage index changes
  const secretAngle = useMemo(() => {
    // reference currentStageIndex so the hook updates when stage changes
    void currentStageIndex;
    return Math.random() * Math.PI * 2;
  }, [currentStageIndex]);

  const grid = 22; // number of tiles per side
  const [scrambleSeed] = useState(() => Math.random());

  // Reset angle when stage changes
  useEffect(() => {
    setAngle(0);
  }, [currentStageIndex]);

  // Build tiles w/ deterministic scramble (based on scrambleSeed + stage)
  const tiles = useMemo(() => {
    const tiles = [];
    const rng = mulberry32(
      Math.floor((scrambleSeed + currentStageIndex) * 2 ** 31)
    );
    for (let y = 0; y < grid; y++) {
      for (let x = 0; x < grid; x++) {
        tiles.push({ x, y, r1: rng(), r2: rng(), r3: rng() });
      }
    }
    return tiles;
  }, [grid, scrambleSeed, currentStageIndex]);

  // drag to rotate
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let isDown = false;
    let lastX = 0;

    const onDown = (e) => {
      // don't allow starting a drag once the stage is locked/solved
      if (stageSolved) return;
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

    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // rebind listeners if stageSolved changes so onDown can block drags
  }, [stageSolved]);

  // interpolation factor: t in [0,1]; close to 1 when angle ~= secret
  const t = useMemo(() => {
    const d = wrapAngle(angle - secretAngle);
    // a steep bell function so it "clicks" into place near the target
    const c = Math.cos(d);
    const shaped = Math.pow(clamp((c + 1) / 2, 0, 1), 6);
    return shaped;
  }, [angle, secretAngle]);

  // completion check (UI-only)
  const solved = t > 0.985;

  // NOTE: we intentionally do NOT mark stageSolved here. Recording and locking
  // happen when the snapback animation finishes so that the pieces are brought
  // to the exact solved state before the stage is considered solved.

  // Snapback assist: when close enough and not dragging, gently ease angle to the secret
  useEffect(() => {
    // Only assist if near solution and not actively dragging
    // Use a softer threshold (10% away -> t >= 0.90)
    // NOTE: we allow this to run even if `solved` is true so the final micro-
    // adjustment can complete and bring the pieces to exact alignment.
    if (dragging || t < 0.9 || gameState !== "playing") return;

    cancelAnimationFrame(rafRef.current);

    const step = () => {
      rafRef.current = requestAnimationFrame(() => {
        setAngle((a) => {
          const d = wrapAngle(secretAngle - a); // shortest path delta
          const done = Math.abs(d) < 0.0015;
          if (done) {
            // snap fully into place
            // record score here (only if not already recorded)
            if (!stageSolved && stageStartTime) {
              const timeElapsed = (Date.now() - stageStartTime) / 1000;
              const points = calculatePoints(timeElapsed);
              const newScore = {
                stage:
                  currentStage?.name ||
                  STAGES[currentStageIndex]?.name ||
                  "(unknown)",
                time: timeElapsed,
                points: points,
              };
              setStageScores((prev) => [...prev, newScore]);
              setStageSolved(true);
            }
            return secretAngle;
          }
          // critically damped ease toward the target
          return a + d * 0.18;
        });
      });
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [
    t,
    dragging,
    secretAngle,
    gameState,
    stageSolved,
    stageStartTime,
    currentStage,
    currentStageIndex,
  ]);

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

  // Start game handler
  const startGame = () => {
    setGameState("playing");
    setCurrentStageIndex(0);
    setStageScores([]);
    setImgUrl(STAGES[0].url);
    setStageStartTime(Date.now());
    setAngle(0);
    setStageSolved(false);
  };

  const goToNextStage = () => {
    // advance to next stage or finish
    setStageSolved(false);
    setCurrentStageIndex((prev) => {
      if (prev < STAGES.length - 1) {
        const next = prev + 1;
        setImgUrl(STAGES[next]?.url || STAGES[0].url);
        setStageStartTime(Date.now());
        setAngle(0);
        return next;
      }
      setGameState("completed");
      return prev;
    });
  };

  // Calculate current elapsed time
  const currentElapsedTime = stageStartTime
    ? (Date.now() - stageStartTime) / 1000
    : 0;

  // Menu Screen
  if (gameState === "menu") {
    return (
      <div style={styles.appRoot}>
        <div style={styles.menuContainer}>
          <h1 style={styles.menuTitle}>Trò chơi đố ảnh hạt 3D</h1>
          <h2 style={styles.menuSubtitle}>
            {"Tìm hiểu về các nhân vật lịch sử Việt\u00A0Nam"}
          </h2>
          <div style={styles.menuDescription}>
            <p>
              {
                "Xoay hình để ghép các mảnh lại với nhau và khám phá các nhân vật lịch sử Việt\u00A0Nam!"
              }
            </p>
            <p>Giải nhanh để được nhiều điểm hơn (tối đa 1000 điểm/màn)</p>
            <p>
              <strong>{STAGES.length} màn chơi</strong>
            </p>
          </div>
          <button style={styles.startButton} onClick={startGame}>
            Bắt đầu chơi
          </button>
          <div style={styles.leadersList}>
            <h3>Các nhân vật lịch sử trong game:</h3>
            <ul>
              {STAGES.map((stage, idx) => (
                <li key={idx}>{stage.name}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Completion Screen
  if (gameState === "completed") {
    const totalScore = stageScores.reduce(
      (sum, score) => sum + score.points,
      0
    );
    const totalTime = stageScores.reduce((sum, score) => sum + score.time, 0);

    return (
      <div style={styles.appRoot}>
        <div style={styles.completionContainer}>
          <h1 style={styles.completionTitle}>🎉 Hoàn thành! 🎉</h1>
          <div style={styles.totalScore}>
            <div>
              Tổng điểm: <strong>{totalScore}</strong>
            </div>
            <div>
              Tổng thời gian: <strong>{totalTime.toFixed(1)}s</strong>
            </div>
          </div>
          <div style={styles.scoreTable}>
            <h3>Chi tiết từng màn:</h3>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Màn</th>
                  <th style={styles.th}>Nhân vật</th>
                  <th style={styles.th}>Thời gian</th>
                  <th style={styles.th}>Điểm</th>
                </tr>
              </thead>
              <tbody>
                {stageScores.map((score, idx) => (
                  <tr key={idx}>
                    <td style={styles.td}>{idx + 1}</td>
                    <td style={styles.td}>{score.stage}</td>
                    <td style={styles.td}>{score.time.toFixed(1)}s</td>
                    <td style={styles.td}>{score.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button style={styles.startButton} onClick={startGame}>
            Chơi lại
          </button>
        </div>
      </div>
    );
  }

  // Game Screen
  return (
    <div style={styles.appRoot}>
      <div style={styles.gameHeader}>
        <h1 style={styles.title}>Trò chơi đố ảnh hạt 3D</h1>
        <div style={styles.gameInfo}>
          <div style={styles.stageInfo}>
            Màn {currentStageIndex + 1}/{STAGES.length}:{" "}
            <strong>{currentStage?.name || "—"}</strong>
          </div>
          <div style={styles.scoreInfo}>
            Thời gian: <strong>{currentElapsedTime.toFixed(1)}s</strong> | Điểm
            hiện tại: <strong>{calculatePoints(currentElapsedTime)}</strong>
          </div>
        </div>
      </div>

      <div style={styles.controls}>
        <div style={styles.row}>
          <label style={styles.label}>Góc xoay</label>
          <input
            type="range"
            min="0"
            max={Math.PI * 2}
            step="0.001"
            value={wrapAngle(angle) + Math.PI}
            onChange={(e) => {
              if (stageSolved) return; // prevent slider during solved/lock
              setAngle(parseFloat(e.target.value) - Math.PI);
            }}
            disabled={stageSolved}
            style={{ flex: 1 }}
          />
          <div style={{ width: 80, textAlign: "right" }}>
            {wrapAngle(angle).toFixed(2)} rad
          </div>
        </div>
        <div style={styles.row}>
          <label style={styles.label}>Độ chính xác</label>
          <div style={styles.meterBox}>
            <div
              style={{ ...styles.meterFill, width: `${(t * 100).toFixed(1)}%` }}
            />
          </div>
          <div style={{ width: 80, textAlign: "right" }}>
            {(t * 100).toFixed(1)}%
          </div>
        </div>
      </div>

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
          title="Kéo để xoay; các mảnh sẽ ghép lại khi bạn tìm được góc đúng"
        >
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
            {stageSolved && (
              <div style={styles.solvedBanner}>
                <div style={{ marginBottom: 8, fontWeight: 700 }}>
                  Hoàn thành!
                </div>
                {currentStageIndex < STAGES.length - 1 ? (
                  <button style={styles.smallButton} onClick={goToNextStage}>
                    Sang màn tiếp theo
                  </button>
                ) : (
                  <button
                    style={styles.smallButton}
                    onClick={() => setGameState("completed")}
                  >
                    Xem kết quả
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <footer style={styles.footer}>
        <span>
          Mẹo: Kéo hoặc dùng thanh trượt để thay đổi góc xoay. Khi thanh "Độ
          chính xác" đầy, bạn đã giải xong!
        </span>
      </footer>
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
    // prefer keeping Vietnamese words together
    wordBreak: "keep-all",
  },
  title: { fontWeight: 700, margin: "0 0 16px", fontSize: 20 },
  gameHeader: {
    maxWidth: 720,
    margin: "0 auto 16px auto",
  },
  gameInfo: {
    display: "flex",
    justifyContent: "space-between",
    marginTop: 8,
    fontSize: 14,
    opacity: 0.9,
  },
  stageInfo: {
    flex: 1,
  },
  scoreInfo: {
    textAlign: "right",
  },
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
  // Menu styles
  menuContainer: {
    maxWidth: 600,
    margin: "80px auto",
    textAlign: "center",
    background: "rgba(255,255,255,0.04)",
    padding: 40,
    borderRadius: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  menuTitle: {
    fontSize: 36,
    fontWeight: 700,
    margin: "0 0 16px",
    background: "linear-gradient(90deg,#78e0ff,#86ffa7)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  menuSubtitle: {
    fontSize: 20,
    fontWeight: 400,
    margin: "0 0 24px",
    opacity: 0.9,
  },
  menuDescription: {
    fontSize: 16,
    lineHeight: 1.6,
    marginBottom: 32,
    opacity: 0.85,
  },
  startButton: {
    padding: "16px 40px",
    fontSize: 18,
    fontWeight: 600,
    borderRadius: 12,
    border: "none",
    background: "linear-gradient(90deg,#4a9eff,#5fd4a0)",
    color: "#fff",
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(74,158,255,0.3)",
    transition: "transform 0.2s, box-shadow 0.2s",
  },
  leadersList: {
    marginTop: 40,
    textAlign: "left",
    fontSize: 14,
    opacity: 0.8,
  },
  // Completion screen styles
  completionContainer: {
    maxWidth: 700,
    margin: "60px auto",
    textAlign: "center",
    background: "rgba(255,255,255,0.04)",
    padding: 40,
    borderRadius: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  },
  completionTitle: {
    fontSize: 36,
    fontWeight: 700,
    margin: "0 0 24px",
    background: "linear-gradient(90deg,#ffd700,#ffed4e)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  },
  totalScore: {
    fontSize: 20,
    marginBottom: 32,
    display: "flex",
    justifyContent: "space-around",
    flexWrap: "wrap",
    gap: 16,
  },
  scoreTable: {
    marginBottom: 32,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: 16,
  },
  th: {
    padding: "12px 8px",
    borderBottom: "2px solid rgba(255,255,255,0.2)",
    textAlign: "left",
    fontWeight: 600,
  },
  td: {
    padding: "10px 8px",
    borderBottom: "1px solid rgba(255,255,255,0.1)",
    textAlign: "left",
  },
  smallButton: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "none",
    background: "linear-gradient(90deg,#4a9eff,#5fd4a0)",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 700,
  },
};
