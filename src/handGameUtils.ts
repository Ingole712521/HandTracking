import { NormalizedLandmarkList } from "@mediapipe/hands";

export interface Bird {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hit: boolean;
}

const BIRD_RADIUS = 28;
const BIRD_SPEED = 4.5;

// Birds fly left to right or right to left randomly
export function randomBird(width: number, height: number): Bird {
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

export function dist(x1: number, y1: number, x2: number, y2: number) {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

export function isOnlyOneFingerUp(landmarks: NormalizedLandmarkList): boolean {
  const indexUp = landmarks[8].y < landmarks[6].y - 0.03;
  const othersDown = [12, 16, 20].every(
    (tip) => landmarks[tip].y > landmarks[tip - 2].y + 0.03
  );
  return indexUp && othersDown;
} 