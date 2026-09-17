export function Panel({ children, className = '', as: Element = 'section', ...props }) {
  return <Element className={`panel ${className}`.trim()} {...props}>{children}</Element>;
}
