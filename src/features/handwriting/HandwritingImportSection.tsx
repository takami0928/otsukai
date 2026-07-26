import { useEffect, useRef, useState } from 'react'
import type { EffectiveProduct } from '../../types/householdCatalog'
import { createId } from '../../utils/id'
import type {
  HandwritingImportApplyReason,
} from './applyImport'
import type { HandwritingImportConfig } from './config'
import {
  HandwritingImportError,
  isAbortError,
  toHandwritingErrorMessage,
} from './errors'
import { GoogleVisionOcrProvider } from './GoogleVisionOcrProvider'
import {
  preprocessHandwritingImage,
  type ImagePreprocessOptions,
} from './imagePreprocessing'
import { matchOcrProductLines } from './productMatching'
import {
  BrowserTurnstileTokenProvider,
  type TurnstileTokenProvider,
} from './turnstile'
import type {
  HandwritingImportSelection,
  HandwritingOcrProvider,
  OcrProductLineMatch,
  ProductMatchCandidate,
} from './types'

type ProcessingPhase = 'idle' | 'preparing' | 'recognizing'

type ApplySelectionsResult = {
  accepted: boolean
  changedItemCount: number
  reason?: HandwritingImportApplyReason
}

type HandwritingImportSectionProps = {
  config: HandwritingImportConfig
  effectiveProducts: readonly EffectiveProduct[]
  onApplySelections: (
    selections: readonly HandwritingImportSelection[],
  ) => ApplySelectionsResult
  ocrProvider?: HandwritingOcrProvider
  preprocessImage?: (
    file: File,
    options?: ImagePreprocessOptions,
  ) => Promise<Blob>
  createCustomItemId?: () => string
}

function candidateLabel(candidate: ProductMatchCandidate): string {
  if (candidate.matchKind === 'name-exact') {
    return `${candidate.productName}（完全一致）`
  }
  if (candidate.matchKind === 'alias-exact') {
    return `${candidate.productName}（登録別名一致）`
  }
  return `${candidate.productName}（類似候補・要確認）`
}

function selectedChoiceLabel(
  match: OcrProductLineMatch,
  choice: string,
): string {
  if (choice === 'custom') {
    return `リストにないものとして「${match.productText}」を追加`
  }
  if (choice.startsWith('product:')) {
    const productId = choice.slice('product:'.length)
    return (
      match.candidates.find((candidate) => candidate.productId === productId)
        ?.productName ?? '候補を選択'
    )
  }
  return '無視'
}

function applyFailureMessage(reason?: HandwritingImportApplyReason): string {
  if (reason === 'invalid-selection') {
    return '選択内容を確認できませんでした。候補を選び直してください。'
  }
  return '依頼上限により追加できません。現在の依頼内容は変更していません。'
}

export function HandwritingImportSection({
  config,
  effectiveProducts,
  onApplySelections,
  ocrProvider,
  preprocessImage = preprocessHandwritingImage,
  createCustomItemId = () => createId('custom'),
}: HandwritingImportSectionProps) {
  const turnstileContainerRef = useRef<HTMLDivElement>(null)
  const abortControllerRef = useRef<AbortController>()
  const [defaultProvider, setDefaultProvider] =
    useState<HandwritingOcrProvider>()
  const [phase, setPhase] = useState<ProcessingPhase>('idle')
  const [matches, setMatches] = useState<OcrProductLineMatch[]>([])
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [dialogError, setDialogError] = useState('')

  useEffect(() => {
    if (!config.enabled || ocrProvider || !turnstileContainerRef.current) {
      return
    }
    const turnstile: TurnstileTokenProvider =
      new BrowserTurnstileTokenProvider(
        turnstileContainerRef.current,
        config.turnstileSiteKey,
      )
    const provider = new GoogleVisionOcrProvider(
      config.endpoint,
      turnstile,
    )
    setDefaultProvider(provider)

    return () => {
      turnstile.dispose()
    }
  }, [
    config.enabled,
    config.endpoint,
    config.turnstileSiteKey,
    ocrProvider,
  ])

  useEffect(
    () => () => {
      abortControllerRef.current?.abort()
    },
    [],
  )

  if (!config.enabled) {
    return null
  }

  const provider = ocrProvider ?? defaultProvider
  const isProcessing = phase !== 'idle'

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file || isProcessing || !provider) {
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller
    setMatches([])
    setChoices({})
    setMessage('')
    setDialogError('')
    setPhase('preparing')

    try {
      const image = await preprocessImage(file, {
        signal: controller.signal,
        adjustment: { mode: 'none' },
      })
      if (controller.signal.aborted) {
        throw new HandwritingImportError('cancelled')
      }
      setPhase('recognizing')
      const lines = await provider.recognizeProductLines(image, {
        signal: controller.signal,
      })
      const nextMatches = matchOcrProductLines(
        lines,
        effectiveProducts,
      ).filter((match) => Boolean(match.productText))
      if (nextMatches.length === 0) {
        throw new HandwritingImportError('no-text')
      }
      setMatches(nextMatches)
      setChoices(
        Object.fromEntries(
          nextMatches.map((match) => [
            match.line.id,
            match.initialProductId
              ? `product:${match.initialProductId}`
              : 'ignore',
          ]),
        ),
      )
    } catch (error) {
      setMessage(
        toHandwritingErrorMessage(
          isAbortError(error)
            ? new HandwritingImportError('cancelled')
            : error,
        ),
      )
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = undefined
      }
      setPhase('idle')
    }
  }

  const selectedCount = Object.values(choices).filter(
    (choice) => choice !== 'ignore',
  ).length

  const handleApply = () => {
    const selections: HandwritingImportSelection[] = []
    for (const match of matches) {
      const choice = choices[match.line.id] ?? 'ignore'
      if (choice === 'custom') {
        selections.push({
          lineId: match.line.id,
          kind: 'custom',
          name: match.productText,
          customItemId: createCustomItemId(),
        })
      } else if (choice.startsWith('product:')) {
        const productId = choice.slice('product:'.length)
        if (
          match.candidates.some(
            (candidate) => candidate.productId === productId,
          )
        ) {
          selections.push({
            lineId: match.line.id,
            kind: 'product',
            productId,
          })
        }
      }
    }

    const result = onApplySelections(selections)
    if (!result.accepted) {
      setDialogError(applyFailureMessage(result.reason))
      return
    }
    setDialogError('')
    setMatches([])
    setChoices({})
    setMessage(
      result.changedItemCount > 0
        ? `${result.changedItemCount}件の商品を依頼へ追加しました。`
        : '選択した商品はすでに依頼へ追加されています。',
    )
  }

  const closeConfirmation = () => {
    setMatches([])
    setChoices({})
    setDialogError('')
  }

  return (
    <>
      <section className="info-card handwriting-import-section">
        <div className="section-heading handwriting-import-heading">
          <div>
            <p className="eyebrow">画像から商品を選ぶ</p>
            <h2>手書きメモから追加</h2>
          </div>
        </div>
        <p className="helper-text">
          手書きの商品名を読み取ります。
          <br />
          個数や条件は読み取りません。
        </p>
        <p className="helper-text handwriting-privacy-note">
          画像はCloudflare Worker経由でGoogle Cloud Visionへ一時送信し、
          アプリには保存しません。
        </p>

        <label
          className={`primary-button handwriting-file-button${
            isProcessing || !provider ? ' is-disabled' : ''
          }`}
        >
          写真を撮る・画像を選ぶ
          <input
            className="visually-hidden"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            disabled={isProcessing || !provider}
            onChange={handleFileChange}
          />
        </label>

        {isProcessing ? (
          <div className="handwriting-progress" aria-live="polite">
            <p>{phase === 'preparing' ? '画像を準備中' : 'メモを読み取り中'}</p>
            <button
              type="button"
              className="ghost-button"
              onClick={() => abortControllerRef.current?.abort()}
            >
              キャンセル
            </button>
          </div>
        ) : null}

        {message ? (
          <p className="handwriting-message" role="status">
            {message}
          </p>
        ) : null}

        <div
          ref={turnstileContainerRef}
          className="handwriting-turnstile"
          aria-label="認証確認"
        />
      </section>

      {matches.length > 0 ? (
        <div className="dialog-backdrop">
          <section
            className="dialog-card handwriting-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="handwriting-confirmation-title"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">追加前の確認</p>
                <h2 id="handwriting-confirmation-title">
                  読み取った商品を確認
                </h2>
              </div>
              <span>{matches.length}行</span>
            </div>
            <p className="helper-text">
              完全一致と登録別名一致だけを選択済みにしています。
              類似候補は内容を確認して選んでください。
            </p>

            <div className="handwriting-match-list">
              {matches.map((match) => {
                const choice = choices[match.line.id] ?? 'ignore'
                return (
                  <article
                    key={match.line.id}
                    className="handwriting-match-card"
                  >
                    <p>
                      OCRで読み取った文字：
                      <strong>{match.line.text}</strong>
                    </p>
                    <p className="helper-text">
                      対応候補：
                      {match.candidates.length > 0
                        ? match.candidates
                            .map((candidate) => candidateLabel(candidate))
                            .join('、')
                        : '候補なし'}
                    </p>
                    <label>
                      <span>候補変更</span>
                      <select
                        value={choice}
                        onChange={(event) =>
                          setChoices((current) => ({
                            ...current,
                            [match.line.id]: event.target.value,
                          }))
                        }
                        aria-label={`${match.line.text}の候補変更`}
                      >
                        <option value="ignore">無視</option>
                        {match.candidates.map((candidate) => (
                          <option
                            key={candidate.productId}
                            value={`product:${candidate.productId}`}
                          >
                            {candidateLabel(candidate)}
                          </option>
                        ))}
                        <option value="custom">
                          リストにないものとして追加
                        </option>
                      </select>
                    </label>
                    <p className="handwriting-selection-state">
                      選択状態：{selectedChoiceLabel(match, choice)}
                    </p>
                    {choice === 'custom' ? (
                      <p className="helper-text">
                        単位は仮に個です。追加後に変更できます。
                      </p>
                    ) : null}
                  </article>
                )
              })}
            </div>

            {dialogError ? (
              <p className="handwriting-dialog-error" role="alert">
                {dialogError}
              </p>
            ) : null}

            <div className="dialog-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={closeConfirmation}
              >
                確認を閉じる
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={selectedCount === 0}
                onClick={handleApply}
              >
                選択した商品を追加
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  )
}
