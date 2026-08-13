import { LiveIncidentContext } from '@types';

/**
 * A real two-car contact, captured verbatim from the sidecar during a Daytona
 * Road Course session on 2026-08-02.
 *
 *   <Incident et="575.9">Antares Au(19) reported contact (1025.66) with
 *   another vehicle Lorenzo Fluxa(44)</Incident>
 *
 * Car 44 is an LMP2, car 19 a GT3 — multiclass traffic. The LMP2 arrives under
 * braking about 13 m/s faster, closes from ~15 m to ~5 m, and loses 4 m/s in a
 * single sample at contact. Trimmed to t in [-2, +0.5]; every value is exactly
 * as the game reported it.
 */
// prettier-ignore
export const daytonaContactContext: LiveIncidentContext = {
  seq: 1,
  et: 575.9,
  trackLength: 5733.8,
  anchorErrorSeconds: 0.1,
  sectorFlags: [11, 11, 11],
  cars: [
    {
      slotId: 19,
      frames: [
        {t: -2.0, x: 533.46, y: 9.39, z: -510.27, vx: 43.7, vy: 0.03, vz: 60.14, speed: 74.34, yaw: -0.2, throttle: 0.0, brake: 0.646, steering: -0.001, lapDist: 3697.7, pathLateral: 3.96, trackEdge: 5.3, flag: 0, sector: 0, lap: 2},
        {t: -1.92, x: 536.93, y: 9.39, z: -505.49, vx: 42.86, vy: 0.02, vz: 59.09, speed: 72.99, yaw: -0.8, throttle: 0.0, brake: 0.923, steering: -0.004, lapDist: 3697.7, pathLateral: 3.96, trackEdge: 5.3, flag: 0, sector: 0, lap: 2},
        {t: -1.86, x: 539.48, y: 9.39, z: -501.98, vx: 42.1, vy: 0.0, vz: 58.13, speed: 71.78, yaw: -1.1, throttle: 0.0, brake: 0.962, steering: -0.003, lapDist: 3697.7, pathLateral: 3.96, trackEdge: 5.3, flag: 0, sector: 0, lap: 2},
        {t: -1.78, x: 542.8, y: 9.39, z: -497.37, vx: 41.04, vy: -0.0, vz: 56.81, speed: 70.09, yaw: -1.2, throttle: 0.0, brake: 0.961, steering: -0.002, lapDist: 3712.2, pathLateral: 3.89, trackEdge: 5.28, flag: 0, sector: 0, lap: 2},
        {t: -1.7, x: 546.05, y: 9.39, z: -492.88, vx: 39.99, vy: -0.01, vz: 55.51, speed: 68.42, yaw: -1.6, throttle: 0.0, brake: 0.964, steering: -0.004, lapDist: 3712.2, pathLateral: 3.89, trackEdge: 5.28, flag: 0, sector: 0, lap: 2},
        {t: -1.62, x: 549.21, y: 9.39, z: -488.49, vx: 38.91, vy: -0.01, vz: 54.23, speed: 66.74, yaw: -1.9, throttle: 0.0, brake: 0.96, steering: -0.009, lapDist: 3712.2, pathLateral: 3.89, trackEdge: 5.28, flag: 0, sector: 0, lap: 2},
        {t: -1.54, x: 552.28, y: 9.39, z: -484.2, vx: 37.82, vy: -0.04, vz: 52.98, speed: 65.09, yaw: -3.0, throttle: 0.0, brake: 0.965, steering: -0.012, lapDist: 3725.9, pathLateral: 3.76, trackEdge: 5.2, flag: 0, sector: 0, lap: 2},
        {t: -1.46, x: 555.26, y: 9.39, z: -480.01, vx: 36.69, vy: -0.07, vz: 51.74, speed: 63.43, yaw: -4.3, throttle: 0.0, brake: 0.96, steering: -0.016, lapDist: 3725.9, pathLateral: 3.76, trackEdge: 5.2, flag: 0, sector: 0, lap: 2},
        {t: -1.38, x: 558.15, y: 9.38, z: -475.91, vx: 35.54, vy: -0.09, vz: 50.55, speed: 61.79, yaw: -5.2, throttle: 0.0, brake: 0.956, steering: -0.013, lapDist: 3738.8, pathLateral: 3.54, trackEdge: 5.11, flag: 0, sector: 0, lap: 2},
        {t: -1.32, x: 560.26, y: 9.37, z: -472.9, vx: 34.66, vy: -0.11, vz: 49.67, speed: 60.56, yaw: -5.8, throttle: 0.0, brake: 0.959, steering: -0.017, lapDist: 3738.8, pathLateral: 3.54, trackEdge: 5.11, flag: 0, sector: 0, lap: 2},
        {t: -1.24, x: 562.98, y: 9.36, z: -468.97, vx: 33.41, vy: -0.11, vz: 48.54, speed: 58.93, yaw: -7.8, throttle: 0.0, brake: 0.954, steering: -0.021, lapDist: 3738.8, pathLateral: 3.54, trackEdge: 5.11, flag: 0, sector: 0, lap: 2},
        {t: -1.16, x: 565.61, y: 9.35, z: -465.13, vx: 32.16, vy: -0.12, vz: 47.49, speed: 57.35, yaw: -8.5, throttle: 0.314, brake: 0.978, steering: -0.021, lapDist: 3750.8, pathLateral: 3.21, trackEdge: 5.01, flag: 0, sector: 0, lap: 2},
        {t: -1.08, x: 568.13, y: 9.34, z: -461.37, vx: 30.88, vy: -0.14, vz: 46.41, speed: 55.74, yaw: -9.7, throttle: 0.0, brake: 0.971, steering: -0.015, lapDist: 3750.8, pathLateral: 3.21, trackEdge: 5.01, flag: 0, sector: 0, lap: 2},
        {t: -1.0, x: 570.56, y: 9.33, z: -457.7, vx: 29.57, vy: -0.16, vz: 45.38, speed: 54.16, yaw: -10.0, throttle: 0.0, brake: 0.963, steering: -0.016, lapDist: 3762.0, pathLateral: 2.7, trackEdge: 4.98, flag: 0, sector: 0, lap: 2},
        {t: -0.92, x: 572.87, y: 9.32, z: -454.11, vx: 28.24, vy: -0.18, vz: 44.39, speed: 52.62, yaw: -11.0, throttle: 0.0, brake: 0.945, steering: -0.016, lapDist: 3762.0, pathLateral: 2.7, trackEdge: 4.98, flag: 0, sector: 0, lap: 2},
        {t: -0.86, x: 574.54, y: 9.31, z: -451.46, vx: 27.25, vy: -0.2, vz: 43.68, speed: 51.49, yaw: -11.0, throttle: 0.0, brake: 0.961, steering: -0.015, lapDist: 3762.0, pathLateral: 2.7, trackEdge: 4.98, flag: 0, sector: 0, lap: 2},
        {t: -0.78, x: 576.67, y: 9.29, z: -448.01, vx: 25.89, vy: -0.2, vz: 42.74, speed: 49.97, yaw: -11.8, throttle: 0.0, brake: 0.96, steering: -0.019, lapDist: 3772.4, pathLateral: 1.97, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.7, x: 578.69, y: 9.27, z: -444.62, vx: 24.55, vy: -0.22, vz: 41.87, speed: 48.54, yaw: -11.6, throttle: 0.344, brake: 0.867, steering: -0.026, lapDist: 3772.4, pathLateral: 1.97, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.62, x: 580.6, y: 9.25, z: -441.3, vx: 23.24, vy: -0.29, vz: 41.15, speed: 47.26, yaw: -15.4, throttle: 0.0, brake: 0.631, steering: -0.033, lapDist: 3772.4, pathLateral: 1.97, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.54, x: 582.41, y: 9.23, z: -438.03, vx: 21.88, vy: -0.33, vz: 40.62, speed: 46.14, yaw: -20.2, throttle: 0.0, brake: 0.63, steering: -0.012, lapDist: 3782.1, pathLateral: 1.0, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.46, x: 584.11, y: 9.2, z: -434.8, vx: 20.54, vy: -0.35, vz: 40.11, speed: 45.07, yaw: -20.0, throttle: 0.0, brake: 0.483, steering: 0.019, lapDist: 3782.1, pathLateral: 1.0, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.38, x: 585.7, y: 9.17, z: -431.6, vx: 19.21, vy: -0.39, vz: 39.82, speed: 44.21, yaw: -18.7, throttle: 0.0, brake: 0.335, steering: 0.045, lapDist: 3791.1, pathLateral: -0.28, trackEdge: -7.17, flag: 0, sector: 0, lap: 2},
        {t: -0.32, x: 586.82, y: 9.15, z: -429.22, vx: 18.24, vy: -0.41, vz: 39.72, speed: 43.71, yaw: -13.3, throttle: 0.0, brake: 0.264, steering: 0.049, lapDist: 3791.1, pathLateral: -0.28, trackEdge: -7.17, flag: 0, sector: 0, lap: 2},
        {t: -0.24, x: 588.24, y: 9.11, z: -426.04, vx: 17.01, vy: -0.45, vz: 39.61, speed: 43.11, yaw: -6.2, throttle: 0.0, brake: 0.397, steering: 0.023, lapDist: 3791.1, pathLateral: -0.28, trackEdge: -7.17, flag: 0, sector: 0, lap: 2},
        {t: -0.16, x: 589.55, y: 9.08, z: -422.88, vx: 15.85, vy: -0.51, vz: 39.25, speed: 42.34, yaw: -4.7, throttle: 0.0, brake: 0.506, steering: -0.036, lapDist: 3799.7, pathLateral: -1.89, trackEdge: -7.1, flag: 0, sector: 0, lap: 2},
        {t: -0.08, x: 590.78, y: 9.03, z: -419.76, vx: 14.71, vy: -0.51, vz: 38.83, speed: 41.52, yaw: -14.0, throttle: 0.0, brake: 0.259, steering: -0.078, lapDist: 3799.7, pathLateral: -1.89, trackEdge: -7.1, flag: 0, sector: 0, lap: 2},
        {t: 0.0, x: 591.91, y: 8.99, z: -416.66, vx: 13.63, vy: -0.53, vz: 38.68, speed: 41.02, yaw: -18.7, throttle: 0.0, brake: 0.182, steering: -0.09, lapDist: 3808.2, pathLateral: -3.48, trackEdge: -9.26, flag: 0, sector: 0, lap: 2},
        {t: 0.08, x: 593.0, y: 8.95, z: -413.5, vx: 13.53, vy: -0.58, vz: 40.26, speed: 42.48, yaw: -33.9, throttle: 0.0, brake: 0.433, steering: -0.099, lapDist: 3808.2, pathLateral: -3.48, trackEdge: -9.26, flag: 0, sector: 0, lap: 2},
        {t: 0.14, x: 593.79, y: 8.91, z: -411.09, vx: 12.51, vy: -0.64, vz: 39.98, speed: 41.9, yaw: -30.5, throttle: 0.0, brake: 0.399, steering: -0.065, lapDist: 3808.2, pathLateral: -3.48, trackEdge: -9.26, flag: 0, sector: 0, lap: 2},
        {t: 0.22, x: 594.73, y: 8.86, z: -407.91, vx: 11.12, vy: -0.67, vz: 39.64, speed: 41.18, yaw: -35.8, throttle: 0.0, brake: 0.342, steering: -0.023, lapDist: 3817.1, pathLateral: -4.61, trackEdge: -7.51, flag: 0, sector: 0, lap: 2},
        {t: 0.3, x: 595.57, y: 8.81, z: -404.75, vx: 9.67, vy: -0.59, vz: 39.29, speed: 40.46, yaw: -38.8, throttle: 0.0, brake: 0.361, steering: 0.083, lapDist: 3817.1, pathLateral: -4.61, trackEdge: -7.51, flag: 0, sector: 0, lap: 2},
        {t: 0.38, x: 596.29, y: 8.77, z: -401.62, vx: 8.25, vy: -0.35, vz: 38.93, speed: 39.8, yaw: -33.1, throttle: 0.0, brake: 0.042, steering: 0.176, lapDist: 3817.1, pathLateral: -4.61, trackEdge: -7.51, flag: 0, sector: 0, lap: 2},
        {t: 0.46, x: 596.89, y: 8.75, z: -398.51, vx: 6.85, vy: -0.02, vz: 38.92, speed: 39.52, yaw: -23.8, throttle: 0.085, brake: 0.0, steering: 0.212, lapDist: 3826.1, pathLateral: -5.1, trackEdge: -5.82, flag: 0, sector: 0, lap: 2},
      ],
    },
    {
      slotId: 44,
      frames: [
        {t: -2.0, x: 518.22, y: 9.32, z: -531.33, vx: 45.96, vy: -0.0, vz: 62.82, speed: 77.84, yaw: -0.3, throttle: 1.0, brake: 0.0, steering: -0.002, lapDist: 3671.7, pathLateral: 4.1, trackEdge: 5.3, flag: 0, sector: 2, lap: 2},
        {t: -1.92, x: 521.9, y: 9.32, z: -526.3, vx: 45.95, vy: -0.0, vz: 62.85, speed: 77.86, yaw: -0.7, throttle: 0.688, brake: 0.0, steering: -0.003, lapDist: 3671.7, pathLateral: 4.1, trackEdge: 5.3, flag: 0, sector: 2, lap: 2},
        {t: -1.86, x: 524.66, y: 9.32, z: -522.53, vx: 45.92, vy: 0.01, vz: 62.88, speed: 77.86, yaw: -0.8, throttle: 1.0, brake: 0.0, steering: -0.003, lapDist: 3671.7, pathLateral: 4.1, trackEdge: 5.3, flag: 0, sector: 2, lap: 2},
        {t: -1.78, x: 528.33, y: 9.33, z: -517.5, vx: 45.88, vy: 0.05, vz: 62.94, speed: 77.89, yaw: -0.8, throttle: 1.0, brake: 0.0, steering: -0.002, lapDist: 3687.3, pathLateral: 4.1, trackEdge: 5.3, flag: 0, sector: 0, lap: 2},
        {t: -1.7, x: 532.0, y: 9.33, z: -512.46, vx: 45.84, vy: 0.02, vz: 63.02, speed: 77.93, yaw: -0.9, throttle: 1.0, brake: 0.0, steering: -0.003, lapDist: 3687.3, pathLateral: 4.1, trackEdge: 5.3, flag: 0, sector: 0, lap: 2},
        {t: -1.62, x: 535.66, y: 9.33, z: -507.42, vx: 45.79, vy: -0.01, vz: 63.11, speed: 77.97, yaw: -0.9, throttle: 1.0, brake: 0.0, steering: -0.001, lapDist: 3687.3, pathLateral: 4.1, trackEdge: 5.3, flag: 0, sector: 0, lap: 2},
        {t: -1.54, x: 539.32, y: 9.33, z: -502.36, vx: 45.73, vy: -0.02, vz: 63.19, speed: 78.0, yaw: -1.0, throttle: 1.0, brake: 0.0, steering: -0.005, lapDist: 3702.8, pathLateral: 4.05, trackEdge: 5.29, flag: 0, sector: 0, lap: 2},
        {t: -1.46, x: 542.98, y: 9.33, z: -497.31, vx: 45.52, vy: -0.01, vz: 63.16, speed: 77.85, yaw: -2.1, throttle: 0.273, brake: 0.511, steering: -0.007, lapDist: 3702.8, pathLateral: 4.05, trackEdge: 5.29, flag: 0, sector: 0, lap: 2},
        {t: -1.38, x: 546.58, y: 9.33, z: -492.29, vx: 44.52, vy: 0.0, vz: 62.09, speed: 76.4, yaw: -2.5, throttle: 0.0, brake: 0.835, steering: -0.01, lapDist: 3718.4, pathLateral: 3.93, trackEdge: 5.26, flag: 0, sector: 0, lap: 2},
        {t: -1.32, x: 549.23, y: 9.33, z: -488.59, vx: 43.57, vy: -0.0, vz: 61.1, speed: 75.05, yaw: -3.8, throttle: 0.0, brake: 0.876, steering: -0.015, lapDist: 3718.4, pathLateral: 3.93, trackEdge: 5.26, flag: 0, sector: 0, lap: 2},
        {t: -1.24, x: 552.66, y: 9.32, z: -483.75, vx: 42.24, vy: -0.09, vz: 59.78, speed: 73.2, yaw: -5.2, throttle: 0.0, brake: 0.895, steering: -0.017, lapDist: 3718.4, pathLateral: 3.93, trackEdge: 5.26, flag: 0, sector: 0, lap: 2},
        {t: -1.16, x: 555.99, y: 9.32, z: -479.02, vx: 40.83, vy: -0.1, vz: 58.51, speed: 71.35, yaw: -6.1, throttle: 0.0, brake: 0.875, steering: -0.017, lapDist: 3733.3, pathLateral: 3.69, trackEdge: 5.16, flag: 0, sector: 0, lap: 2},
        {t: -1.08, x: 559.2, y: 9.31, z: -474.39, vx: 39.41, vy: -0.18, vz: 57.33, speed: 69.57, yaw: -6.4, throttle: 0.0, brake: 0.887, steering: -0.023, lapDist: 3733.3, pathLateral: 3.69, trackEdge: 5.16, flag: 0, sector: 0, lap: 2},
        {t: -1.0, x: 562.3, y: 9.29, z: -469.85, vx: 37.86, vy: -0.15, vz: 56.1, speed: 67.68, yaw: -8.8, throttle: 0.0, brake: 0.94, steering: -0.021, lapDist: 3747.3, pathLateral: 3.25, trackEdge: 5.04, flag: 0, sector: 0, lap: 2},
        {t: -0.92, x: 565.27, y: 9.28, z: -465.4, vx: 36.29, vy: -0.18, vz: 54.88, speed: 65.79, yaw: -8.5, throttle: 0.0, brake: 0.938, steering: -0.016, lapDist: 3747.3, pathLateral: 3.25, trackEdge: 5.04, flag: 0, sector: 0, lap: 2},
        {t: -0.86, x: 567.41, y: 9.27, z: -462.14, vx: 35.09, vy: -0.2, vz: 53.95, speed: 64.36, yaw: -7.8, throttle: 0.0, brake: 0.941, steering: -0.02, lapDist: 3747.3, pathLateral: 3.25, trackEdge: 5.04, flag: 0, sector: 0, lap: 2},
        {t: -0.78, x: 570.16, y: 9.25, z: -457.87, vx: 33.47, vy: -0.22, vz: 52.75, speed: 62.48, yaw: -9.6, throttle: 0.0, brake: 0.943, steering: -0.028, lapDist: 3760.4, pathLateral: 2.55, trackEdge: 4.99, flag: 0, sector: 0, lap: 2},
        {t: -0.7, x: 572.77, y: 9.24, z: -453.69, vx: 31.84, vy: -0.25, vz: 51.58, speed: 60.61, yaw: -11.7, throttle: 0.0, brake: 0.943, steering: -0.023, lapDist: 3760.4, pathLateral: 2.55, trackEdge: 4.99, flag: 0, sector: 0, lap: 2},
        {t: -0.62, x: 575.26, y: 9.21, z: -449.61, vx: 30.16, vy: -0.27, vz: 50.41, speed: 58.74, yaw: -12.6, throttle: 0.0, brake: 0.943, steering: -0.023, lapDist: 3760.4, pathLateral: 2.55, trackEdge: 4.99, flag: 0, sector: 0, lap: 2},
        {t: -0.54, x: 577.6, y: 9.19, z: -445.62, vx: 28.49, vy: -0.29, vz: 49.26, speed: 56.9, yaw: -11.3, throttle: 0.0, brake: 0.939, steering: -0.032, lapDist: 3772.5, pathLateral: 1.58, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.46, x: 579.82, y: 9.17, z: -441.72, vx: 26.83, vy: -0.35, vz: 48.09, speed: 55.07, yaw: -14.5, throttle: 0.0, brake: 0.941, steering: -0.044, lapDist: 3772.5, pathLateral: 1.58, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.38, x: 581.9, y: 9.14, z: -437.92, vx: 25.15, vy: -0.39, vz: 47.02, speed: 53.33, yaw: -17.1, throttle: 0.0, brake: 0.895, steering: -0.029, lapDist: 3783.6, pathLateral: 0.32, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.32, x: 583.38, y: 9.12, z: -435.12, vx: 23.9, vy: -0.4, vz: 46.2, speed: 52.01, yaw: -16.9, throttle: 0.0, brake: 0.937, steering: -0.023, lapDist: 3783.6, pathLateral: 0.32, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.24, x: 585.22, y: 9.08, z: -431.47, vx: 22.25, vy: -0.42, vz: 45.11, speed: 50.3, yaw: -18.7, throttle: 0.0, brake: 0.665, steering: 0.025, lapDist: 3783.6, pathLateral: 0.32, trackEdge: 4.96, flag: 0, sector: 0, lap: 2},
        {t: -0.16, x: 586.95, y: 9.05, z: -427.9, vx: 20.84, vy: -0.43, vz: 44.09, speed: 48.76, yaw: -1.1, throttle: 0.0, brake: 0.691, steering: 0.158, lapDist: 3793.8, pathLateral: -1.21, trackEdge: -7.17, flag: 0, sector: 0, lap: 2},
        {t: -0.08, x: 588.58, y: 9.01, z: -424.41, vx: 19.88, vy: -0.44, vz: 43.02, speed: 47.4, yaw: 18.7, throttle: 0.0, brake: 0.695, steering: 0.086, lapDist: 3793.8, pathLateral: -1.21, trackEdge: -7.17, flag: 0, sector: 0, lap: 2},
        {t: 0.0, x: 590.14, y: 8.98, z: -421.02, vx: 19.1, vy: -0.42, vz: 41.59, speed: 45.77, yaw: 4.5, throttle: 0.456, brake: 0.934, steering: -0.077, lapDist: 3803.4, pathLateral: -2.76, trackEdge: -9.69, flag: 0, sector: 0, lap: 2},
        {t: 0.08, x: 591.59, y: 8.95, z: -417.84, vx: 17.23, vy: -0.32, vz: 37.9, speed: 41.64, yaw: -39.6, throttle: 0.541, brake: 0.137, steering: 0.176, lapDist: 3803.4, pathLateral: -2.76, trackEdge: -9.69, flag: 0, sector: 0, lap: 2},
        {t: 0.14, x: 592.61, y: 8.93, z: -415.57, vx: 16.91, vy: -0.38, vz: 37.76, speed: 41.38, yaw: 12.5, throttle: 0.187, brake: 0.425, steering: 0.137, lapDist: 3803.4, pathLateral: -2.76, trackEdge: -9.69, flag: 0, sector: 0, lap: 2},
        {t: 0.22, x: 593.94, y: 8.89, z: -412.57, vx: 16.08, vy: -0.43, vz: 37.18, speed: 40.51, yaw: -1.0, throttle: 0.0, brake: 0.38, steering: -0.157, lapDist: 3812.2, pathLateral: -3.54, trackEdge: -8.56, flag: 0, sector: 0, lap: 2},
        {t: 0.3, x: 595.18, y: 8.86, z: -409.62, vx: 14.96, vy: -0.48, vz: 36.78, speed: 39.71, yaw: -29.3, throttle: 0.0, brake: 0.388, steering: -0.226, lapDist: 3812.2, pathLateral: -3.54, trackEdge: -8.56, flag: 0, sector: 0, lap: 2},
        {t: 0.38, x: 596.33, y: 8.82, z: -406.69, vx: 13.5, vy: -0.49, vz: 36.47, speed: 38.89, yaw: -38.7, throttle: 0.0, brake: 0.274, steering: -0.233, lapDist: 3812.2, pathLateral: -3.54, trackEdge: -8.56, flag: 0, sector: 0, lap: 2},
        {t: 0.46, x: 597.34, y: 8.78, z: -403.77, vx: 11.73, vy: -0.42, vz: 36.53, speed: 38.37, yaw: -42.4, throttle: 0.0, brake: 0.07, steering: -0.207, lapDist: 3820.4, pathLateral: -3.63, trackEdge: -7.51, flag: 0, sector: 0, lap: 2},
      ],
    },
  ],
};
