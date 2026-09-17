import styles from './Button.module.css';

export function Button({ children, variant = 'outline', className = '', busy = false, disabled = false, type = 'button', ...props }) {
  return (
    <button type={type} className={`${styles.button} ${styles[variant]} ${className}`.trim()} disabled={busy || disabled} {...props}>
      {children}
    </button>
  );
}
