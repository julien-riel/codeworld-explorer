/**
 * Contrôles élémentaires du panneau d'options (PRD §23). Chaque ligne est autonome,
 * étiquetée pour les lecteurs d'écran, et ne transmet jamais son état par la seule
 * couleur : un libellé texte accompagne toujours l'interrupteur.
 */

import type { ReactElement, ReactNode } from "react";

/** Interrupteur booléen (case à cocher stylée) avec libellé et aide facultative. */
export function ToggleRow(props: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  hint?: ReactNode;
}): ReactElement {
  const { id, label, checked, onChange, hint } = props;
  return (
    <div className="cw-field">
      <label className="cw-field-line" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          className="cw-check"
          checked={checked}
          onChange={(e) => {
            onChange(e.currentTarget.checked);
          }}
        />
        <span className="cw-field-label">{label}</span>
      </label>
      {hint !== undefined && <p className="cw-field-hint">{hint}</p>}
    </div>
  );
}

/** Choix exclusif parmi plusieurs valeurs (groupe de boutons radio). */
export function ChoiceRow<T extends string>(props: {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}): ReactElement {
  const { legend, name, value, options, onChange } = props;
  return (
    <fieldset className="cw-field cw-choice">
      <legend className="cw-field-label">{legend}</legend>
      <div className="cw-choice-options">
        {options.map((opt) => (
          <label key={opt.value} className="cw-choice-option">
            <input
              type="radio"
              name={name}
              value={opt.value}
              checked={value === opt.value}
              onChange={() => {
                onChange(opt.value);
              }}
            />
            <span>{opt.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Curseur de valeur numérique (vitesse) avec valeur lisible annoncée. */
export function SliderRow(props: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  valueText: string;
  onChange: (value: number) => void;
}): ReactElement {
  const { id, label, value, min, max, step, valueText, onChange } = props;
  const labelId = `${id}-label`;
  return (
    <div className="cw-field">
      <div className="cw-field-line">
        <span className="cw-field-label" id={labelId}>
          {label}
        </span>
        <output className="cw-field-value" htmlFor={id}>
          {valueText}
        </output>
      </div>
      <input
        id={id}
        type="range"
        className="cw-range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-labelledby={labelId}
        aria-valuetext={valueText}
        onChange={(e) => {
          onChange(e.currentTarget.valueAsNumber);
        }}
      />
    </div>
  );
}
