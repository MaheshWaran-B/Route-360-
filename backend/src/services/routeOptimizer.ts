// ====================================================================
// Route Optimizer – rank routes by preference (fastest/balanced/safest)
// ====================================================================

const OPTIMIZATION_WEIGHTS: Record<string, { time: number; distance: number; risk: number }> = {
  fastest: { time: 0.7, distance: 0.2, risk: 0.1 },
  balanced: { time: 0.4, distance: 0.2, risk: 0.4 },
  safest: { time: 0.1, distance: 0.1, risk: 0.8 },
};

interface RouteCandidate {
  coords: [number, number][];
  distanceMeters: number;
  durationSec: number;
  riskScore: number;
  [key: string]: any;
}

/**
 * Normalize and rank routes based on user preference.
 * Returns routes sorted by final optimization score (lower = better).
 */
export function optimizeRoute(routes: RouteCandidate[], preference: string): RouteCandidate[] {
  if (routes.length === 0) return [];
  if (routes.length === 1) return routes;

  const weights = OPTIMIZATION_WEIGHTS[preference] || OPTIMIZATION_WEIGHTS.balanced;

  // Normalize time and distance to 0-1 range
  const maxTime = Math.max(...routes.map((r) => r.durationSec));
  const maxDist = Math.max(...routes.map((r) => r.distanceMeters));

  const scored = routes.map((route) => {
    const normalizedTime = maxTime > 0 ? route.durationSec / maxTime : 0;
    const normalizedDist = maxDist > 0 ? route.distanceMeters / maxDist : 0;

    const finalScore =
      weights.time * normalizedTime +
      weights.distance * normalizedDist +
      weights.risk * route.riskScore;

    return {
      ...route,
      normalizedTime,
      normalizedDistance: normalizedDist,
      finalScore: +finalScore.toFixed(4),
    };
  });

  // Sort by final score (lower = better)
  scored.sort((a, b) => a.finalScore - b.finalScore);

  return scored;
}
