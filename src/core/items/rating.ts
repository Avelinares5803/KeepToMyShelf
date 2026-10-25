/**
 * Ratings are stored as integers 1..10 (half stars): 1 = 0.5 stars, 10 = 5 stars.
 * "Not rated" is null, never 0.
 */
export const RATING_MIN = 1;
export const RATING_MAX = 10;
export const MAX_STARS = RATING_MAX / 2;

export function isValidRating(value: number): boolean {
  return Number.isInteger(value) && value >= RATING_MIN && value <= RATING_MAX;
}

export function ratingToStars(rating: number): number {
  return rating / 2;
}

/** Stars in half-star steps (0.5..5) to the stored value; other values are rejected. */
export function starsToRating(stars: number): number | null {
  const rating = stars * 2;
  return isValidRating(rating) ? rating : null;
}
