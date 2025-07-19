/** @format */

import React, { useRef, useEffect, useState } from "react";
import {
  Hands,
  HAND_CONNECTIONS,
  Results as HandsResults,
  NormalizedLandmarkList,
} from "@mediapipe/hands";
import { Camera } from "@mediapipe/camera_utils";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";
import {
  drawBird,
  drawGameInfo,
  drawClouds,
  drawPop,
  drawCanvasInfo,
  drawHandOverlay,
} from "./handDrawingUtils";
import { randomBird, dist, isOnlyOneFingerUp, Bird } from "./handGameUtils";

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;
const GAME_DURATION = 60;
const BIRD_RADIUS = 28;
const BIRD_SPEED = 4.5;
const BIRD_SPAWN_INTERVAL = 1200;

const HandCanvas: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(GAME_DURATION);
  const [gameOver, setGameOver] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string>(
    "Show one finger (OK) to hit birds!"
  );
  const [started, setStarted] = useState(false);
  const [pop, setPop] = useState<
    { x: number; y: number; value: number; time: number }[]
  >([]);
  const birdsRef = useRef<Bird[]>([]);
  const lastBirdSpawn = useRef(Date.now());
  const gameInterval = useRef<NodeJS.Timeout | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const [_, setForceRerender] = useState(0); // for rerender
  const lastHandLandmarks = useRef<NormalizedLandmarkList | null>(null);
  const [canvasDims, setCanvasDims] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  // Fullscreen resize
  useEffect(() => {
    const onResize = () =>
      setCanvasDims({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleClear = () => {
    setScore(0);
    setTimer(GAME_DURATION);
    setGameOver(false);
    birdsRef.current = [];
    setInfoMessage("Show one finger to hit birds!");
    setForceRerender((x) => x + 1);
  };

  // Timer logic
  useEffect(() => {
    if (!started || gameOver) return () => {};
    timerInterval.current && clearInterval(timerInterval.current);
    timerInterval.current = setInterval(() => {
      setTimer((t) => {
        if (t <= 1) {
          setGameOver(true);
          setInfoMessage("Game Over! Your score: " + score);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => {
      if (timerInterval.current) clearInterval(timerInterval.current);
    };
  }, [gameOver, started]);

  // Bird movement and game loop
  useEffect(() => {
    if (!started || gameOver) return () => {};
    let animationId: number;
    const animate = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      const video = videoRef.current;
      if (!canvas || !ctx) return;
      // Draw mirrored video background
      if (video && video.readyState === 4) {
        ctx.save();
        ctx.setTransform(-1, 0, 0, 1, canvasDims.width, 0);
        ctx.drawImage(video, 0, 0, canvasDims.width, canvasDims.height);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.restore();
      } else {
        ctx.clearRect(0, 0, canvasDims.width, canvasDims.height);
      }
      birdsRef.current.forEach((bird) => {
        if (!bird.hit) drawBird(ctx, bird);
      });
      // Draw hand overlay if available
      if (lastHandLandmarks.current) {
        drawHandOverlay(
          ctx,
          lastHandLandmarks.current,
          canvasDims.width,
          canvasDims.height
        );
      }
      // Draw score/timer
      drawGameInfo(ctx, score, timer, canvasDims.width);
      // Draw pop effects
      setPop((pops) => pops.filter((p) => Date.now() - p.time < 700));
      pop.forEach((p) => drawPop(ctx, p));
      // Draw info message on canvas
      drawCanvasInfo(ctx, "Show one finger to hit the bird", canvasDims.width);
      animationId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationId);
  }, [score, timer, gameOver, started, canvasDims, pop]);

  // Bird spawn and movement logic
  useEffect(() => {
    if (!started || gameOver) return () => {};
    gameInterval.current && clearInterval(gameInterval.current);
    gameInterval.current = setInterval(() => {
      // Move birds
      birdsRef.current.forEach((bird) => {
        bird.x += bird.vx;
        bird.y += bird.vy;
      });
      // Remove birds out of bounds
      birdsRef.current = birdsRef.current.filter(
        (b) =>
          b.x > -BIRD_RADIUS &&
          b.x < canvasDims.width + BIRD_RADIUS &&
          b.y > -BIRD_RADIUS &&
          b.y < canvasDims.height + BIRD_RADIUS &&
          !b.hit
      );
      // Spawn new bird
      if (Date.now() - lastBirdSpawn.current > BIRD_SPAWN_INTERVAL) {
        birdsRef.current.push(randomBird(canvasDims.width, canvasDims.height));
        lastBirdSpawn.current = Date.now();
      }
      setForceRerender((x) => x + 1);
    }, 30);
    return () => {
      if (gameInterval.current) clearInterval(gameInterval.current);
    };
  }, [gameOver, started, canvasDims]);

  // Hand tracking and hit detection
  useEffect(() => {
    let camera: Camera | null = null;
    let hands: Hands | null = null;
    try {
      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;
      if (!videoElement || !canvasElement) return;
      const canvasCtx = canvasElement.getContext("2d");
      if (!canvasCtx) return;
      hands = new Hands({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });
      hands.onResults((results: HandsResults) => {
        if (!started || gameOver) return;
        if (
          !(results.multiHandLandmarks && results.multiHandLandmarks.length > 0)
        ) {
          lastHandLandmarks.current = null;
          return;
        }
        const landmarks: NormalizedLandmarkList = results.multiHandLandmarks[0];
        lastHandLandmarks.current = landmarks;
        const isOneFinger = isOnlyOneFingerUp(landmarks);
        if (isOneFinger) {
          const tip = landmarks[8];
          const x = (1 - tip.x) * canvasDims.width; // mirror
          const y = tip.y * canvasDims.height;
          // Check for hit
          birdsRef.current.forEach((bird) => {
            if (!bird.hit && dist(x, y, bird.x, bird.y) < bird.radius + 18) {
              bird.hit = true;
              setScore((s) => s + 1);
              setPop((pops) => [
                ...pops,
                { x: bird.x, y: bird.y, value: 1, time: Date.now() },
              ]);
            }
          });
        }
      });
      if (typeof videoElement !== "undefined" && videoElement !== null) {
        camera = new Camera(videoElement, {
          onFrame: async () => {
            try {
              await hands!.send({ image: videoElement });
            } catch (err) {}
          },
          width: canvasDims.width,
          height: canvasDims.height,
        });
        camera.start();
      }
    } catch (err) {}
    return () => {
      try {
        if (camera) camera.stop();
        if (hands && (hands as any).close) (hands as any).close();
      } catch (err) {}
    };
  }, [gameOver, started, canvasDims]);

  // --- UI ---
  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        width: "100vw",
        height: "100vh",
        background: "#b3e0ff",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "relative",
          width: canvasDims.width,
          height: canvasDims.height,
          background: "transparent",
          border: "none",
          borderRadius: 0,
          boxShadow: "none",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          transition: "all 0.3s",
        }}
      >
        <video
          ref={videoRef}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: canvasDims.width,
            height: canvasDims.height,
            zIndex: 0,
            opacity: 0,
            transform: "scaleX(-1)",
          }}
          width={canvasDims.width}
          height={canvasDims.height}
          playsInline
          autoPlay
          muted
        />
        <canvas
          ref={canvasRef}
          width={canvasDims.width}
          height={canvasDims.height}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            border: "none",
            borderRadius: 0,
            zIndex: 1,
            background: "transparent",
            transition: "all 0.3s",
          }}
        />
        {!started && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              background: "rgba(179,224,255,0.96)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
              fontWeight: 700,
              fontSize: 44,
              color: "#1976d2",
              letterSpacing: 1,
            }}
          >
            <div style={{ marginBottom: 32 }}>Bird Hit Game</div>
            <button
              onClick={() => {
                setStarted(true);
                handleClear();
              }}
              style={{
                marginTop: 12,
                padding: "18px 56px",
                fontSize: 28,
                fontWeight: 700,
                color: "#fff",
                background: "#1976d2",
                border: "none",
                borderRadius: 12,
                boxShadow: "0 2px 12px rgba(25,118,210,0.10)",
                cursor: "pointer",
                letterSpacing: 2,
                transition: "background 0.2s",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.background = "#1565c0")
              }
              onMouseOut={(e) => (e.currentTarget.style.background = "#1976d2")}
            >
              Start Game
            </button>
          </div>
        )}
        {gameOver && started && (
          <div
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: "100%",
              height: "100%",
              background: "rgba(255,255,255,0.92)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 2,
              fontWeight: 700,
              fontSize: 36,
              color: "#1976d2",
              letterSpacing: 1,
            }}
          >
            <div>Game Over!</div>
            <div style={{ fontSize: 24, marginTop: 12 }}>
              Your score: {score}
            </div>
            <button
              onClick={() => {
                setStarted(false);
                handleClear();
              }}
              style={{
                marginTop: 32,
                padding: "12px 36px",
                fontSize: 20,
                fontWeight: 600,
                color: "#fff",
                background: "#1976d2",
                border: "none",
                borderRadius: 8,
                boxShadow: "0 2px 8px rgba(25,118,210,0.10)",
                cursor: "pointer",
                letterSpacing: 1,
                transition: "background 0.2s",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.background = "#1565c0")
              }
              onMouseOut={(e) => (e.currentTarget.style.background = "#1976d2")}
            >
              Play Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default HandCanvas;
