// ============================================
// THE 1969 Bot - Fake Interaction Proof Generator
// ============================================
// Generates realistic mouse movement / drag telemetry
// to pass the server-side botScore check.
//
// Key insights from reverse engineering:
// - pathEntropy = min(1, (varX + varY) / 200) of mouse deltas
// - dragVarX/Y = sqrt(variance) of drag gesture deltas
// - moveCount = total mouse moves since page load
// - windowOpenMs = time since page opened
// - armedMs = time since arm button pressed
//
// Human-like ranges (from observation):
// - moveCount: 50-500
// - pathEntropy: 0.15-0.85
// - dragVarX: 2-15
// - dragVarY: 2-15
// - windowOpenMs: 30000-600000 (30s to 10min)
// - armedMs: 1500-5000 (after notValidBeforeMs)

import type { InteractionProof } from "./types.js";

function rand(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max));
}

/**
 * Generate a fake mouse path and compute pathEntropy
 * matching the real xku() function logic
 */
function generatePathEntropy(): { moveCount: number; pathEntropy: number } {
  const moveCount = randInt(80, 400);

  // Generate realistic mouse deltas
  const points: { x: number; y: number }[] = [];
  let x = randInt(200, 800);
  let y = randInt(200, 600);

  for (let i = 0; i < moveCount; i++) {
    // Mix of small jitters and larger movements
    const isLargeMove = Math.random() < 0.15;
    const dx = isLargeMove ? randInt(-80, 80) : randInt(-8, 8);
    const dy = isLargeMove ? randInt(-60, 60) : randInt(-6, 6);
    x += dx;
    y += dy;
    points.push({ x, y });
  }

  // Compute pathEntropy exactly like the real code
  if (points.length < 3) return { moveCount, pathEntropy: 0 };

  const deltasX: number[] = [];
  const deltasY: number[] = [];
  for (let i = 1; i < points.length; i++) {
    deltasX.push(points[i].x - points[i - 1].x);
    deltasY.push(points[i].y - points[i - 1].y);
  }

  const mean = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = (arr: number[]) => {
    const m = mean(arr);
    return mean(arr.map((v) => (v - m) * (v - m)));
  };

  const varX = variance(deltasX);
  const varY = variance(deltasY);
  const pathEntropy = Math.min(1, (varX + varY) / 200);

  return { moveCount, pathEntropy };
}

/**
 * Generate drag variance values (simulating drag gesture on claim button)
 */
function generateDragVariance(): { dragVarX: number; dragVarY: number } {
  // Server rejects "proof_drag_too_short" if values too low
  // "Drag the handle across the rail" = long horizontal drag gesture
  // Need high X variance (main drag axis), moderate Y variance (wobble)
  const dragVarX = Math.round(rand(20, 50) * 10) / 10;
  const dragVarY = Math.round(rand(8, 25) * 10) / 10;
  return { dragVarX, dragVarY };
}

/**
 * Build a complete interaction proof that mimics human behavior
 */
export function buildInteractionProof(
  nonce: string,
  windowOpenMs: number,
  armedMs: number
): InteractionProof {
  const { moveCount, pathEntropy } = generatePathEntropy();
  const { dragVarX, dragVarY } = generateDragVariance();

  return {
    nonce,
    windowOpenMs,
    moveCount,
    pathEntropy: Math.round(pathEntropy * 1000) / 1000,
    dragVarX,
    dragVarY,
    armedMs,
  };
}

/**
 * Calculate a random human-like delay for claiming after arm
 * Must be > notValidBeforeMs but not instant
 */
export function getHumanClaimDelay(minMs: number, maxMs: number): number {
  // Gaussian-ish distribution centered around middle
  const mid = (minMs + maxMs) / 2;
  const spread = (maxMs - minMs) / 4;
  const gaussian =
    Math.sqrt(-2 * Math.log(Math.random())) *
    Math.cos(2 * Math.PI * Math.random());
  return Math.max(minMs, Math.min(maxMs, mid + gaussian * spread));
}
