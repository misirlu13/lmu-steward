interface Point {
  x: number;
  y: number;
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface TrackPoints {
  x: number;
  y: number;
  z: number;
  type?: number | string;
}

export interface SVGOptions {
  width?: number;
  height?: number;
  padding?: number;
  stroke?: string;
  pitStroke?: string;
  strokeWidth?: number;
  smooth?: boolean;
  breakThreshold?: number;
  viewBoxSize?: number;
}

export const getTrackMapBounds = (
  trackPoints: TrackPoints[],
): Bounds | null => {
  if (!Array.isArray(trackPoints) || trackPoints.length < 2) {
    return null;
  }

  const xs = trackPoints.map((point) => point.x);
  const ys = trackPoints.map((point) => point.z);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
    return null;
  }

  return { minX, maxX, minY, maxY };
};

export const normalizeTrackWorldPointToSvg = (
  point: { x: number; z: number },
  bounds: Bounds,
  viewBoxSize = 1000,
  padding = 0,
) => {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  if (!isFinite(width) || !isFinite(height) || width === 0 || height === 0) {
    return null;
  }

  const clampedPadding = Math.max(0, Math.min(viewBoxSize / 4, padding));
  const drawableSize = viewBoxSize - clampedPadding * 2;

  if (!isFinite(drawableSize) || drawableSize <= 0) {
    return null;
  }

  const normalizedX =
    clampedPadding + ((point.x - bounds.minX) / width) * drawableSize;
  const normalizedY =
    viewBoxSize -
    (clampedPadding + ((point.z - bounds.minY) / height) * drawableSize);

  if (!isFinite(normalizedX) || !isFinite(normalizedY)) {
    return null;
  }

  return {
    x: Math.max(clampedPadding, Math.min(viewBoxSize - clampedPadding, normalizedX)),
    y: Math.max(clampedPadding, Math.min(viewBoxSize - clampedPadding, normalizedY)),
  };
};

export const trackMapToSVG = (
  trackPoints: TrackPoints[],
  options: SVGOptions = {},
) => {
  const {
    stroke = 'white',
    strokeWidth = 4,
    viewBoxSize = 1000,
    padding: paddingOption,
  } = options;

  const padding = Math.max(
    0,
    Math.min(viewBoxSize / 4, paddingOption ?? Math.ceil(strokeWidth)),
  );

  if (!Array.isArray(trackPoints) || trackPoints.length < 2) {
    return `
      <svg style="width: 100%; height: 100%;" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" xmlns="http://www.w3.org/2000/svg"></svg>
    `;
  }

  const primaryTrackPoints = trackPoints.filter((point) => {
    const pointType = Number(point?.type);
    return !Number.isFinite(pointType) || pointType === 0;
  });

  if (primaryTrackPoints.length < 2) {
    return `
      <svg style="width: 100%; height: 100%;" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" xmlns="http://www.w3.org/2000/svg"></svg>
    `;
  }

  const rawPoints: Point[] = primaryTrackPoints.map((p) => ({ x: p.x, y: p.z }));

  // -----------------------------
  // Normalize
  // -----------------------------
  const bounds = getTrackMapBounds(primaryTrackPoints);

  if (!bounds) {
    return `
      <svg style="width: 100%; height: 100%;" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" xmlns="http://www.w3.org/2000/svg"></svg>
    `;
  }

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;

  if (!isFinite(width) || !isFinite(height) || width === 0 || height === 0) {
    return `
      <svg style="width: 100%; height: 100%;" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" xmlns="http://www.w3.org/2000/svg"></svg>
    `;
  }

  const drawableSize = viewBoxSize - padding * 2;

  if (!isFinite(drawableSize) || drawableSize <= 0) {
    return `
      <svg style="width: 100%; height: 100%;" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" xmlns="http://www.w3.org/2000/svg"></svg>
    `;
  }

  const normalize = (p: Point): Point => ({
    x: padding + ((p.x - bounds.minX) / width) * drawableSize,
    y: padding + ((p.y - bounds.minY) / height) * drawableSize,
  });

  const points = rawPoints.map(normalize);

  // -----------------------------
  // Distance helper
  // -----------------------------
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

  // -----------------------------
  // Break into polylines
  // -----------------------------
  const MAX_GAP = 40;

  let segments: Point[][] = [];
  let current: Point[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    if (dist(points[i], points[i - 1]) > MAX_GAP) {
      segments.push(current);
      current = [];
    }
    current.push(points[i]);
  }
  segments.push(current);

  // -----------------------------
  // Remove tiny fragments
  // -----------------------------
  segments = segments.filter((s) => s.length > 20);

  // -----------------------------
  // Score loops by perimeter
  // Largest = main track
  // -----------------------------
  const perimeter = (seg: Point[]) => {
    let sum = 0;
    for (let i = 1; i < seg.length; i++) {
      sum += dist(seg[i], seg[i - 1]);
    }
    return sum;
  };

  segments.sort((a, b) => perimeter(b) - perimeter(a));

  const mainTrack = segments[0] || [];

  // -----------------------------
  // SVG Path Generator
  // -----------------------------
  const pathFromPoints = (pts: Point[], closePath = false) => {
    if (!pts.length) return '';
    let d = `M ${pts[0].x} ${viewBoxSize - pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x} ${viewBoxSize - pts[i].y}`;
    }
    if (closePath) {
      d += ' Z';
    }
    return d;
  };

  const mainPath = pathFromPoints(mainTrack, false);

  return `
    <svg style="width: 100%; height: 100%;" viewBox="0 0 ${viewBoxSize} ${viewBoxSize}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
      <path d="${mainPath}" fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
};
