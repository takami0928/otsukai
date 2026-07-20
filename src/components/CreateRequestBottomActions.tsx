import { BottomBar } from './BottomBar'

type CreateRequestBottomActionsProps = {
  onReset: () => void
  onReview: () => void
  selectedCount: number
}

export function CreateRequestBottomActions({
  onReset,
  onReview,
  selectedCount,
}: CreateRequestBottomActionsProps) {
  return (
    <BottomBar>
      <div>
        <strong>{selectedCount}件選択中</strong>
        <p>数量が1以上の商品だけ確認画面に表示します</p>
      </div>
      <div className="inline-actions bottom-bar-actions">
        <button
          type="button"
          className="ghost-button danger-button"
          onClick={onReset}
        >
          入力内容を消去
        </button>
        <button
          type="button"
          className="primary-button"
          onClick={onReview}
          disabled={!selectedCount}
        >
          確認へ
        </button>
      </div>
    </BottomBar>
  )
}
