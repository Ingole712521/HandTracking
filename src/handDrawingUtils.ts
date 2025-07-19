import { HAND_CONNECTIONS, NormalizedLandmarkList } from "@mediapipe/hands";
import { drawConnectors, drawLandmarks } from "@mediapipe/drawing_utils";

// Draw a bird on the canvas
export function drawBird(ctx: CanvasRenderingContext2D, bird: { x: number; y: number; radius: number; hit: boolean }) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(bird.x, bird.y, bird.radius, 0, 2 * Math.PI);
  ctx.fillStyle = bird.hit ? "#aaa" : "#ffeb3b";
  ctx.shadowColor = "#333";
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#333";
  ctx.stroke();
  // Draw beak
  ctx.beginPath();
  ctx.moveTo(bird.x + bird.radius, bird.y);
  ctx.lineTo(bird.x + bird.radius + 12, bird.y - 6);
  ctx.lineTo(bird.x + bird.radius + 12, bird.y + 6);
  ctx.closePath();
  ctx.fillStyle = "#ff9800";
  ctx.fill();
  ctx.restore();
}

// Draw score and timer info
export function drawGameInfo(
  ctx: CanvasRenderingContext2D,
  score: number,
  timer: number,
  width: number
) {
  ctx.save();
  ctx.font = "bold 32px Segoe UI, Arial";
  ctx.fillStyle = "#1976d2";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("Score: " + score, 32, 24);
  ctx.textAlign = "right";
  ctx.fillText("Time: " + timer + "s", width - 32, 24);
  ctx.restore();
}

// Draw animated clouds
export function drawClouds(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const t = Date.now() / 1200;
  for (let i = 0; i < 4; i++) {
    const x = ((width / 4) * i + ((t * 60 + i * 100) % width)) % width;
    const y = 60 + 40 * Math.sin(t + i);
    ctx.save();
    ctx.globalAlpha = 0.18 + 0.08 * Math.sin(t + i);
    ctx.beginPath();
    ctx.ellipse(x, y, 90, 32, 0, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.restore();
  }
}

// Draw score pop effect
export function drawPop(
  ctx: CanvasRenderingContext2D,
  p: { x: number; y: number; value: number; time: number }
) {
  const age = (Date.now() - p.time) / 700;
  ctx.save();
  ctx.globalAlpha = 1 - age;
  ctx.font = "bold 36px Segoe UI, Arial";
  ctx.fillStyle = "#43a047";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 3;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeText("+" + p.value, p.x, p.y - 40 - age * 40);
  ctx.fillText("+" + p.value, p.x, p.y - 40 - age * 40);
  ctx.restore();
}

// Draw info message on canvas
export function drawCanvasInfo(
  ctx: CanvasRenderingContext2D,
  message: string,
  width: number
) {
  ctx.save();
  ctx.font = "bold 32px Segoe UI, Arial";
  ctx.fillStyle = "#1976d2";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 4;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.shadowColor = "#fff";
  ctx.shadowBlur = 8;
  ctx.strokeText(message, width / 2, 80);
  ctx.fillText(message, width / 2, 80);
  ctx.restore();
}

// Draw hand overlay
export function drawHandOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmarkList,
  width: number,
  height: number
) {
  ctx.save();
  ctx.setTransform(-1, 0, 0, 1, width, 0);
  drawConnectors(ctx, landmarks, HAND_CONNECTIONS, {
    color: "#00FF00",
    lineWidth: 2,
  });
  drawLandmarks(ctx, landmarks, { color: "#FF0000", lineWidth: 1 });
  ctx.restore();
} 