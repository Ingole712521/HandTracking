import React, { useRef, useEffect, useState } from 'react';
import { Hands, HAND_CONNECTIONS, Results as HandsResults, NormalizedLandmarkList } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';

const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;
const BUTTON_WIDTH = 90;
const BUTTON_HEIGHT = 40;
const BUTTON_X = CANVAS_WIDTH - BUTTON_WIDTH - 16;
const BUTTON_Y = CANVAS_HEIGHT - BUTTON_HEIGHT - 16;

function isFingerInButton(x: number, y: number): boolean {
  return (
    x > BUTTON_X && x < BUTTON_X + BUTTON_WIDTH &&
    y > BUTTON_Y && y < BUTTON_Y + BUTTON_HEIGHT
  );
}

type Point = { x: number; y: number };

const HandCanvas: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pathRef = useRef<Point[]>([]);
  const drawing = useRef<boolean>(false);
  const [showClear, setShowClear] = useState(false);

  // Clear only the drawing path
  const handleClear = () => {
    pathRef.current = [];
    // Do not clear the whole canvas here; just reset the path
  };

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
        try {
          // Draw the video frame as the background
          canvasCtx.save();
          canvasCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          if (videoElement.readyState === 4) {
            canvasCtx.drawImage(videoElement, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          }
          canvasCtx.restore();

          if (!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0)) {
            drawing.current = false;
            setShowClear(false);
            drawClearButton(canvasCtx);
            // Draw the path if any (should be empty if just cleared)
            drawPath(canvasCtx, pathRef.current);
            return;
          }
          const landmarks: NormalizedLandmarkList = results.multiHandLandmarks[0];
          // Draw hand landmarks
          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
          drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1 });
          // Index finger tip is landmark 8
          const tip = landmarks[8];
          const x = tip.x * CANVAS_WIDTH;
          const y = tip.y * CANVAS_HEIGHT;

          // Check if finger tip is inside the clear button area
          if (isFingerInButton(x, y)) {
            setShowClear(true);
            handleClear();
          } else {
            setShowClear(false);
          }

          // Start drawing if not already
          if (!drawing.current) {
            pathRef.current = [{ x, y }];
            drawing.current = true;
          } else {
            pathRef.current.push({ x, y });
          }

          // Draw the path
          drawPath(canvasCtx, pathRef.current);
          // Draw the current point (pen tip)
          canvasCtx.beginPath();
          canvasCtx.arc(x, y, 8, 0, 2 * Math.PI);
          canvasCtx.fillStyle = '#2196f3';
          canvasCtx.fill();
          // Draw the clear button
          drawClearButton(canvasCtx, showClear);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Error in onResults:', err);
        }
      });

      if (typeof videoElement !== 'undefined' && videoElement !== null) {
        camera = new Camera(videoElement, {
          onFrame: async () => {
            try {
              await hands!.send({ image: videoElement });
            } catch (err) {
              // eslint-disable-next-line no-console
              console.error('Error in camera onFrame:', err);
            }
          },
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
        });
        camera.start();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error initializing hand tracking:', err);
    }

    // Clean up
    return () => {
      try {
        if (camera) camera.stop();
        if (hands && (hands as any).close) (hands as any).close();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error during cleanup:', err);
      }
    };
  }, [showClear]);

  // Draw the clear button
  function drawClearButton(ctx: CanvasRenderingContext2D, highlight = false) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(BUTTON_X, BUTTON_Y, BUTTON_WIDTH, BUTTON_HEIGHT);
    ctx.fillStyle = highlight ? '#f44336' : '#2196f3';
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = highlight ? '#b71c1c' : '#1976d2';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.font = 'bold 18px Segoe UI, Arial';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Clear', BUTTON_X + BUTTON_WIDTH / 2, BUTTON_Y + BUTTON_HEIGHT / 2);
    ctx.restore();
  }

  // Draw the path
  function drawPath(ctx: CanvasRenderingContext2D, path: Point[]) {
    if (path.length > 1) {
      ctx.beginPath();
      ctx.moveTo(path[0].x, path[0].y);
      for (let i = 1; i < path.length; i++) {
        ctx.lineTo(path[i].x, path[i].y);
      }
      ctx.strokeStyle = '#2196f3';
      ctx.lineWidth = 4;
      ctx.stroke();
    }
  }

  // Mouse click handler for clear button
  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement, MouseEvent>) {
    try {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (isFingerInButton(x, y)) {
        handleClear();
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Error in handleCanvasClick:', err);
    }
  }

  return (
    <div style={{ position: 'relative', width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}>
      <video
        ref={videoRef}
        style={{ position: 'absolute', left: 0, top: 0, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, zIndex: 0, opacity: 0 }}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        playsInline
        autoPlay
        muted
      />
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ position: 'absolute', left: 0, top: 0, border: '2px solid #333', borderRadius: 8, zIndex: 1 }}
        onClick={handleCanvasClick}
      />
    </div>
  );
};

export default HandCanvas; 