import { useBrand } from '../../brand/BrandContext.jsx';
import { EmptyState } from './EmptyState.jsx';
import styles from './DataTable.module.css';

/**
 * Dense data table — the shared table surface for the roster, operations, admin and A&R
 * lists. Geometry comes from the contract tokens (`--table-cell-y/x`, `--row-height-max`),
 * so density is identical everywhere and is not re-decided per page.
 *
 * columns: [{ key, header, align?, mono?, width?, sortable?, render?(row) }]
 */
export function DataTable({ columns, rows, rowKey, sort, onSortChange, emptyTitle, emptyDetail, onRowClick, rowClassName }) {
  const { text } = useBrand();
  if (!rows?.length) return <EmptyState title={emptyTitle} detail={emptyDetail} icon="ri-table-line" />;

  function toggle(column) {
    if (!column.sortable || !onSortChange) return;
    const direction = sort?.key === column.key && sort.direction === 'asc' ? 'desc' : 'asc';
    onSortChange({ key: column.key, direction });
  }

  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={`label ${styles.th} ${column.align === 'right' ? styles.right : ''} ${column.sortable ? styles.sortable : ''}`}
                  aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortable ? (
                    <button type="button" className={styles.sortButton} onClick={() => toggle(column)} aria-label={`${text.a11y.sortBy} ${column.header}`}>
                      {column.header}
                      <span className={styles.arrow} aria-hidden="true">{active ? (sort.direction === 'asc' ? '↑' : '↓') : ''}</span>
                    </button>
                  ) : column.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr
              key={rowKey ? rowKey(row) : index}
              className={`${onRowClick ? styles.clickable : ''} ${rowClassName?.(row) || ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
            >
              {columns.map((column) => (
                <td key={column.key} className={`${styles.td} ${column.align === 'right' ? styles.right : ''} ${column.mono ? 'value' : ''}`}>
                  {column.render ? column.render(row) : row[column.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
