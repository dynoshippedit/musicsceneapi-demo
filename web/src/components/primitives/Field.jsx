import { useId } from 'react';
import styles from './Field.module.css';

/** Mono uppercase `.label` + a 32px control. One geometry for every form on the platform. */
export function Field({ label, children, hint, htmlFor }) {
  return (
    <div className={styles.field}>
      {label && <label className="label" htmlFor={htmlFor}>{label}</label>}
      {children}
      {hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}

export function TextInput({ label, hint, ...props }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <input id={id} className={styles.input} {...props} />
    </Field>
  );
}

export function SelectInput({ label, hint, options = [], ...props }) {
  const id = useId();
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <select id={id} className={styles.input} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
        ))}
      </select>
    </Field>
  );
}

export function CheckGroup({ label, options, value = [], onChange, hint }) {
  return (
    <Field label={label} hint={hint}>
      <div className={styles.checks}>
        {options.map((option) => {
          const checked = value.includes(option.value);
          return (
            <label key={option.value} className={`${styles.check} ${checked ? styles.checked : ''}`}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onChange(checked ? value.filter((item) => item !== option.value) : [...value, option.value])}
              />
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </Field>
  );
}
