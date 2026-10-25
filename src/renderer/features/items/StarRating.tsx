import { useTranslation } from 'react-i18next';
import { MAX_STARS, ratingToStars } from '../../../core/items/rating';
import { StarIcon } from '../../components/icons';

const STAR_POSITIONS = Array.from({ length: MAX_STARS }, (_, index) => index + 1);

/** One star filled 0, 50 or 100 % for a rating of 1..10 (or none). */
function Star({ position, rating }: { position: number; rating: number | null }) {
  const fill = Math.min(Math.max(((rating ?? 0) - (position - 1) * 2) / 2, 0), 1);
  return (
    <span className="star">
      <StarIcon />
      <span className="star__fill" style={{ width: `${fill * 100}%` }}>
        <StarIcon filled />
      </span>
    </span>
  );
}

/** Star counts in the UI language: "4,5" in Spanish, "4.5" in English. */
function useStarsText() {
  const { i18n } = useTranslation();
  return (stars: number) => stars.toLocaleString(i18n.language);
}

/** Read-only stars, announced as "4.5 out of 5 stars" by screen readers. */
export function StarRating({ rating }: { rating: number }) {
  const { t } = useTranslation();
  const formatStars = useStarsText();
  return (
    <span
      className="stars"
      role="img"
      aria-label={t('items.rating.value', { stars: formatStars(ratingToStars(rating)) })}
    >
      {STAR_POSITIONS.map((position) => (
        <Star key={position} position={position} rating={rating} />
      ))}
    </span>
  );
}

interface StarRatingInputProps {
  rating: number | null;
  onChange: (rating: number | null) => void;
}

/**
 * Pick a rating in half stars: each star has a left half (x.5) and a right half (x.0)
 * button. Every half is reachable with the keyboard and announces its value.
 */
export function StarRatingInput({ rating, onChange }: StarRatingInputProps) {
  const { t } = useTranslation();
  const formatStars = useStarsText();
  const halfButton = (value: number, side: 'left' | 'right') => {
    const stars = ratingToStars(value);
    return (
      <button
        type="button"
        className={`star-input__half star-input__half--${side}`}
        aria-label={t('items.rating.set', { count: stars, stars: formatStars(stars) })}
        aria-pressed={rating === value}
        onClick={() => onChange(value)}
      />
    );
  };

  return (
    <div className="star-input">
      <div className="stars" role="group" aria-label={t('items.rating.label')}>
        {STAR_POSITIONS.map((position) => (
          <span key={position} className="star-input__star">
            <Star position={position} rating={rating} />
            {halfButton(position * 2 - 1, 'left')}
            {halfButton(position * 2, 'right')}
          </span>
        ))}
      </div>
      {rating !== null && (
        <button type="button" className="link-button" onClick={() => onChange(null)}>
          {t('items.rating.clear')}
        </button>
      )}
    </div>
  );
}
