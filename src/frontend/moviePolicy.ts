/** Product limits apply to the assembled film separately from each AI shot. */
export const MAX_MOVIE_SECONDS = 2 * 60 * 60;
export const MAX_MOVIE_SHOTS = 2000;
export const MAX_GENERATED_SHOT_SECONDS = 30;
// Hosted generation quotes come from the shared billing server.
export type MovieResolution = "480p" | "720p" | "1080p";
