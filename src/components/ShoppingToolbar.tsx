type ShoppingToolbarProps = {
  filterMode: 'remaining' | 'all'
  undoDisabled: boolean
  onUndo: () => void
  onToggleFilter: () => void
}

export function ShoppingToolbar({
  filterMode,
  undoDisabled,
  onUndo,
  onToggleFilter,
}: ShoppingToolbarProps) {
  return (
    <section className="toolbar-card">
      <button
        type="button"
        className="primary-button"
        onClick={onUndo}
        disabled={undoDisabled}
      >
        Undo
      </button>
      <button
        type="button"
        className="secondary-button"
        onClick={onToggleFilter}
      >
        {filterMode === 'remaining' ? 'すべて表示' : '未購入・相談中だけ表示'}
      </button>
    </section>
  )
}
