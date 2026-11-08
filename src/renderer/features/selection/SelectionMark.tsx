import { CheckIcon } from '../../components/icons';

/** The box in the corner of a card in "Select" mode, ticked when the card is marked. */
export function SelectionMark() {
  return (
    <span className="item-card__check" aria-hidden="true">
      <CheckIcon />
    </span>
  );
}
