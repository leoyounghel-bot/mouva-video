/** Product limits apply to the assembled film separately from each AI shot. */
export const MAX_MOVIE_SECONDS = 2 * 60 * 60;
export const MAX_MOVIE_SHOTS = 2000;
export const MAX_GENERATED_SHOT_SECONDS = 30;
export const MOUVIE_PRICING_VERSION = "mouvie-credits-2026-09-29-v1";

// Proposed hosted rates, including planning, scene creation and the matching
// motion reference. One accepted finished shot is one charge, not each stage.
export const FINISHED_SHOT_CREDITS_PER_SECOND = {
  "480p": 40,
  "720p": 90,
  "1080p": 220,
} as const;
export type MovieResolution = keyof typeof FINISHED_SHOT_CREDITS_PER_SECOND;
export function finishedShotCredits(seconds: number, resolution: MovieResolution): number {
  if (!Number.isFinite(seconds) || seconds <= 0 || !(resolution in FINISHED_SHOT_CREDITS_PER_SECOND))
    throw new Error("Invalid movie duration or resolution.");
  return Math.ceil(seconds * FINISHED_SHOT_CREDITS_PER_SECOND[resolution]);
}
