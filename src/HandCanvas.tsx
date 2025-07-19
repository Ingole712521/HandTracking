import React, { useRef, useEffect, useState } from 'react';
import { Hands, HAND_CONNECTIONS, Results as HandsResults, NormalizedLandmarkList } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;
const GAME_DURATION = 60; // seconds
const BIRD_RADIUS = 28;
const BIRD_SPEED = 4.5; // Increased speed
const BIRD_SPAWN_INTERVAL = 1200; // ms

interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hit: boolean;
}

const HandCanvas: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [score, setScore] = useState(0);
  const [timer, setTimer] = useState(GAME_DURATION);
  const [gameOver, setGameOver] = useState(false);
  const [infoMessage, setInfoMessage] = useState<string>('Show one finger (OK) to hit birds!');
  const [started, setStarted] = useState(false);
  const [pop, setPop] = useState<{x: number, y: number, value: number, time: number}[]>([]);
  const birdsRef = useRef<Bird[]>([]);
  const lastBirdSpawn = useRef(Date.now());
  const gameInterval = useRef<NodeJS.Timeout | null>(null);
  const timerInterval = useRef<NodeJS.Timeout | null>(null);
  const [_, setForceRerender] = useState(0); // for rerender
  const lastHandLandmarks = useRef<NormalizedLandmarkList | null>(null);
  const [canvasDims, setCanvasDims] = useState({ width: window.innerWidth, height: window.innerHeight });

  // Fullscreen resize
  useEffect(() => {
    const onResize = () => setCanvasDims({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const handleClear = () => {
    setScore(0);
    setTimer(GAME_DURATION);
    setGameOver(false);
    birdsRef.current = [];
    setInfoMessage('Show one finger (OK) to hit birds!');
    setForceRerender(x => x + 1);
  };

  // Timer logic
  useEffect(() => {
    if (!started || gameOver) return () => {};
    timerInterval.current && clearInterval(timerInterval.current);
    timerInterval.current = setInterval(() => {
      setTimer(t => {
        if (t <= 1) {
          setGameOver(true);
          setInfoMessage('Game Over! Your score: ' + score);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => { if (timerInterval.current) clearInterval(timerInterval.current); };
  }, [gameOver, started]);

  // Bird movement and game loop
  useEffect(() => {
    if (!started || gameOver) return () => {};
    let animationId: number;
    const animate = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
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
      // (No background color or clouds)
      // Draw birds
      birdsRef.current.forEach(bird => {
        if (!bird.hit) drawBird(ctx, bird);
      });
      // Draw hand overlay if available
      if (lastHandLandmarks.current) {
        drawHandOverlay(ctx, lastHandLandmarks.current, canvasDims.width, canvasDims.height);
      }
      // Draw score/timer
      drawGameInfo(ctx, score, timer, canvasDims.width);
      // Draw pop effects
      setPop(pops => pops.filter(p => Date.now() - p.time < 700));
      pop.forEach(p => drawPop(ctx, p));
      // Draw info message on canvas
      drawCanvasInfo(ctx, 'Show one finger to hit the bird', canvasDims.width);
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
      birdsRef.current.forEach(bird => {
        bird.x += bird.vx;
        bird.y += bird.vy;
      });
      // Remove birds out of bounds
      birdsRef.current = birdsRef.current.filter(
        b => b.x > -BIRD_RADIUS && b.x < canvasDims.width + BIRD_RADIUS && b.y > -BIRD_RADIUS && b.y < canvasDims.height + BIRD_RADIUS && !b.hit
      );
      // Spawn new bird
      if (Date.now() - lastBirdSpawn.current > BIRD_SPAWN_INTERVAL) {
        birdsRef.current.push(randomBird(canvasDims.width, canvasDims.height));
        lastBirdSpawn.current = Date.now();
      }
      setForceRerender(x => x + 1);
    }, 30);
    return () => { if (gameInterval.current) clearInterval(gameInterval.current); };
  }, [gameOver, started, canvasDims]);

  // Hand tracking and hit detection
  useEffect(() => {
    let camera: Camera | null = null;
    let hands: Hands | null = null;
    try {
      const videoElement = videoRef.current;
      const canvasElement = canvasRef.current;
      if (!videoElement || !canvasElement) return;
      const canvasCtx = canvasElement.getContext('2d');
      if (!canvasCtx) return;
      hands = new Hands({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });
      hands.setOptions({
        maxNumHands: 1,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });
      hands.onResults((results: HandsResults) => {
        if (!started || gameOver) return;
        if (!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0)) {
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
          birdsRef.current.forEach(bird => {
            if (!bird.hit && dist(x, y, bird.x, bird.y) < bird.radius + 18) {
              bird.hit = true;
              setScore(s => s + 1);
              setPop(pops => [...pops, { x: bird.x, y: bird.y, value: 1, time: Date.now() }]);
            }
          });
        }
      });
      if (typeof videoElement !== 'undefined' && videoElement !== null) {
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

  // --- Drawing helpers ---
  function drawBird(ctx: CanvasRenderingContext2D, bird: Bird) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(bird.x, bird.y, bird.radius, 0, 2 * Math.PI);
    ctx.fillStyle = bird.hit ? '#aaa' : '#ffeb3b';
    ctx.shadowColor = '#333';
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#333';
    ctx.stroke();
    // Draw beak
    ctx.beginPath();
    ctx.moveTo(bird.x + bird.radius, bird.y);
    ctx.lineTo(bird.x + bird.radius + 12, bird.y - 6);
    ctx.lineTo(bird.x + bird.radius + 12, bird.y + 6);
    ctx.closePath();
    ctx.fillStyle = '#ff9800';
    ctx.fill();
    ctx.restore();
  }

  function drawGameInfo(ctx: CanvasRenderingContext2D, score: number, timer: number, width: number) {
    ctx.save();
    ctx.font = 'bold 32px Segoe UI, Arial';
    ctx.fillStyle = '#1976d2';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('Score: ' + score, 32, 24);
    ctx.textAlign = 'right';
    ctx.fillText('Time: ' + timer + 's', width - 32, 24);
    ctx.restore();
  }

  function randomBird(width: number, height: number): Bird {
    // Birds fly left to right or right to left randomly
    const fromLeft = Math.random() > 0.5;
    const y = 80 + Math.random() * (height - 160);
    return {
      x: fromLeft ? -BIRD_RADIUS : width + BIRD_RADIUS,
      y,
      vx: fromLeft ? BIRD_SPEED : -BIRD_SPEED,
      vy: (Math.random() - 0.5) * 1.2,
      radius: BIRD_RADIUS,
      hit: false,
    };
  }

  function dist(x1: number, y1: number, x2: number, y2: number) {
    return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
  }

  function isOnlyOneFingerUp(landmarks: NormalizedLandmarkList): boolean {
    const indexUp = landmarks[8].y < landmarks[6].y - 0.03;
    const othersDown = [12, 16, 20].every(
      (tip) => landmarks[tip].y > landmarks[tip - 2].y + 0.03
    );
    return indexUp && othersDown;
  }

  function drawHandOverlay(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmarkList, width: number, height: number) {
    ctx.save();
    ctx.setTransform(-1, 0, 0, 1, width, 0);
    drawConnectors(ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
    drawLandmarks(ctx, landmarks, { color: '#FF0000', lineWidth: 1 });
    ctx.restore();
  }

  // Animated clouds
  function drawClouds(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const t = Date.now() / 1200;
    for (let i = 0; i < 4; i++) {
      const x = ((width / 4) * i + (t * 60 + i * 100) % width) % width;
      const y = 60 + 40 * Math.sin(t + i);
      ctx.save();
      ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t + i);
      ctx.beginPath();
      ctx.ellipse(x, y, 90, 32, 0, 0, 2 * Math.PI);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.restore();
    }
  }

  // Score pop effect
  function drawPop(ctx: CanvasRenderingContext2D, p: {x: number, y: number, value: number, time: number}) {
    const age = (Date.now() - p.time) / 700;
    ctx.save();
    ctx.globalAlpha = 1 - age;
    ctx.font = 'bold 36px Segoe UI, Arial';
    ctx.fillStyle = '#43a047';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 3;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText('+' + p.value, p.x, p.y - 40 - age * 40);
    ctx.fillText('+' + p.value, p.x, p.y - 40 - age * 40);
    ctx.restore();
  }

  // Draw info message on canvas
  function drawCanvasInfo(ctx: CanvasRenderingContext2D, message: string, width: number) {
    ctx.save();
    ctx.font = 'bold 32px Segoe UI, Arial';
    ctx.fillStyle = '#1976d2';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 8;
    ctx.strokeText(message, width / 2, 80);
    ctx.fillText(message, width / 2, 80);
    ctx.restore();
  }

  // --- UI ---
  return (
    <div style={{
      position: 'fixed',
      left: 0,
      top: 0,
      width: '100vw',
      height: '100vh',
      background: '#b3e0ff',
      zIndex: 100,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <div style={{
        position: 'relative',
        width: canvasDims.width,
        height: canvasDims.height,
        background: 'transparent',
        border: 'none',
        borderRadius: 0,
        boxShadow: 'none',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        transition: 'all 0.3s',
      }}>
        <video
          ref={videoRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: canvasDims.width,
            height: canvasDims.height,
            zIndex: 0,
            opacity: 0,
            transform: 'scaleX(-1)',
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
            position: 'absolute',
            left: 0,
            top: 0,
            border: 'none',
            borderRadius: 0,
            zIndex: 1,
            background: 'transparent',
            transition: 'all 0.3s',
          }}
        />
        {!started && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(179,224,255,0.96)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            fontWeight: 700,
            fontSize: 44,
            color: '#1976d2',
            letterSpacing: 1,
          }}>
            <div style={{ marginBottom: 32 }}>Bird Hit Game</div>
            <button
              onClick={() => { setStarted(true); handleClear(); }}
              style={{
                marginTop: 12,
                padding: '18px 56px',
                fontSize: 28,
                fontWeight: 700,
                color: '#fff',
                background: '#1976d2',
                border: 'none',
                borderRadius: 12,
                boxShadow: '0 2px 12px rgba(25,118,210,0.10)',
                cursor: 'pointer',
                letterSpacing: 2,
                transition: 'background 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = '#1565c0')}
              onMouseOut={e => (e.currentTarget.style.background = '#1976d2')}
            >
              Start Game
            </button>
          </div>
        )}
        {gameOver && started && (
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '100%',
            background: 'rgba(255,255,255,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
            fontWeight: 700,
            fontSize: 36,
            color: '#1976d2',
            letterSpacing: 1,
          }}>
            <div>Game Over!</div>
            <div style={{ fontSize: 24, marginTop: 12 }}>Your score: {score}</div>
            <button
              onClick={() => { setStarted(false); handleClear(); }}
              style={{
                marginTop: 32,
                padding: '12px 36px',
                fontSize: 20,
                fontWeight: 600,
                color: '#fff',
                background: '#1976d2',
                border: 'none',
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(25,118,210,0.10)',
                cursor: 'pointer',
                letterSpacing: 1,
                transition: 'background 0.2s',
              }}
              onMouseOver={e => (e.currentTarget.style.background = '#1565c0')}
              onMouseOut={e => (e.currentTarget.style.background = '#1976d2')}
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