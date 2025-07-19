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
  const [gesture, setGesture] = useState<'drawing' | 'closed' | 'one_finger'>('drawing');
  const [infoMessage, setInfoMessage] = useState<string>('Show your hand to start drawing!');
  const lastGesture = useRef<'drawing' | 'closed' | 'one_finger'>('drawing');

  const handleClear = () => {
    pathRef.current = [];
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
          // Mirror only the video, hand, and drawing, not the text
          canvasCtx.save();
          canvasCtx.setTransform(-1, 0, 0, 1, CANVAS_WIDTH, 0);
          canvasCtx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          if (videoElement.readyState === 4) {
            canvasCtx.drawImage(videoElement, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
          }
          // Draw hand and path in mirrored space
          if (!(results.multiHandLandmarks && results.multiHandLandmarks.length > 0)) {
            drawing.current = false;
            setShowClear(false);
            setGesture('drawing');
            setInfoMessage('Show one finger to write OK and draw!');
            drawClearButton(canvasCtx);
            drawPath(canvasCtx, pathRef.current);
            canvasCtx.restore();
            // Draw info text in normal orientation
            drawInfo(canvasCtx, infoMessage);
            return;
          }
          const landmarks: NormalizedLandmarkList = results.multiHandLandmarks[0];
          drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 2 });
          drawLandmarks(canvasCtx, landmarks, { color: '#FF0000', lineWidth: 1 });
          const tip = landmarks[8];
          const x = tip.x * CANVAS_WIDTH;
          const y = tip.y * CANVAS_HEIGHT;

          // --- Gesture detection ---
          const isClosed = isHandClosed(landmarks);
          const isOneFinger = isOnlyOneFingerUp(landmarks);

          // Set gesture state and info message
          if (isClosed) {
            setGesture('closed');
            setInfoMessage('Hand closed: Drawing paused. Show one finger to draw OK.');
            drawing.current = false;
          } else if (isOneFinger) {
            setGesture('one_finger');
            setInfoMessage('One finger up: "OK" detected. You can draw now!');
            // Drawing is allowed only in this state
          } else {
            setGesture('drawing');
            setInfoMessage('Show one finger to write OK and draw!');
            drawing.current = false;
          }

          // --- Drawing logic ---
          // Only allow drawing if one finger is up (OK gesture)
          if (isOneFinger) {
            if (!drawing.current) {
              pathRef.current = [{ x, y }];
              drawing.current = true;
            } else {
              pathRef.current.push({ x, y });
            }
          } else {
            drawing.current = false;
          }

          // Draw the path
          drawPath(canvasCtx, pathRef.current);

          // Draw finger tip
          canvasCtx.beginPath();
          canvasCtx.arc(x, y, 10, 0, 2 * Math.PI);
          canvasCtx.fillStyle = isOneFinger ? '#43a047' : gesture === 'closed' ? '#888' : '#2196f3';
          canvasCtx.globalAlpha = gesture === 'closed' ? 0.5 : 1;
          canvasCtx.shadowColor = isOneFinger ? '#fff' : 'transparent';
          canvasCtx.shadowBlur = isOneFinger ? 16 : 0;
          canvasCtx.fill();
          canvasCtx.globalAlpha = 1;
          canvasCtx.shadowBlur = 0;

          // Draw OK message if one finger up (not mirrored)
          canvasCtx.restore();
          if (isOneFinger) {
            drawOK(canvasCtx, x, y);
          }
          // Draw info text in normal orientation
          drawInfo(canvasCtx, infoMessage);
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
              console.error('Error in camera onFrame:', err);
            }
          },
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
        });
        camera.start();
      }
    } catch (err) {
      console.error('Error initializing hand tracking:', err);
    }

    // Clean up
    return () => {
      try {
        if (camera) camera.stop();
        if (hands && (hands as any).close) (hands as any).close();
      } catch (err) {
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

  // --- Gesture helpers ---
  function isHandClosed(landmarks: NormalizedLandmarkList): boolean {
    // If all fingertips are below their respective PIP joints (folded)
    // Index: 8 < 6, Middle: 12 < 10, Ring: 16 < 14, Pinky: 20 < 18 (y axis)
    // For y, higher value is lower on image
    return [8, 12, 16, 20].every(
      (tip, i) => landmarks[tip].y > landmarks[tip - 2].y + 0.03 // add margin
    );
  }

  function isOnlyOneFingerUp(landmarks: NormalizedLandmarkList): boolean {
    // Index finger up, others down
    const indexUp = landmarks[8].y < landmarks[6].y - 0.03;
    const othersDown = [12, 16, 20].every(
      (tip) => landmarks[tip].y > landmarks[tip - 2].y + 0.03
    );
    return indexUp && othersDown;
  }

  function drawOK(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.save();
    ctx.font = 'bold 54px "Fira Sans", "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffb347';
    ctx.strokeStyle = '#232526';
    ctx.lineWidth = 6;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 12;
    ctx.strokeText('OK', CANVAS_WIDTH - x, y - 50); // flip x for mirror
    ctx.fillText('OK', CANVAS_WIDTH - x, y - 50);
    ctx.restore();
  }

  function drawInfo(ctx: CanvasRenderingContext2D, message: string) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Ensure normal orientation
    ctx.font = '600 26px "Fira Sans", "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#232526';
    ctx.lineWidth = 5;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = '#ffb347';
    ctx.shadowBlur = 10;
    ctx.strokeText(message, CANVAS_WIDTH / 2, 24);
    ctx.fillText(message, CANVAS_WIDTH / 2, 24);
    ctx.restore();
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

  // Redesign canvas container for a unique, visually distinct look
  return (
    <div style={{
      position: 'relative',
      width: CANVAS_WIDTH,
      height: CANVAS_HEIGHT,
      background: 'repeating-linear-gradient(135deg, #232526 0px, #232526 40px, #414345 40px, #414345 80px)',
      border: '6px double #ffb347',
      borderRadius: '0 60px 0 60px',
      margin: '56px auto',
      boxShadow: '0 20px 60px 0 rgba(0,0,0,0.35)',
      overflow: 'hidden',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      boxSizing: 'border-box',
      transition: 'all 0.4s',
    }}>
      <video
        ref={videoRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: CANVAS_WIDTH,
          height: CANVAS_HEIGHT,
          zIndex: 0,
          opacity: 0,
          transform: 'scaleX(-1)',
        }}
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
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          border: 'none',
          borderRadius: '0 48px 0 48px',
          zIndex: 1,
          background: 'rgba(255,255,255,0.93)',
          boxShadow: '0 0 0 8px #ffb347 inset',
          transition: 'all 0.4s',
        }}
        onClick={handleCanvasClick}
      />
    </div>
  );
};

export default HandCanvas; 