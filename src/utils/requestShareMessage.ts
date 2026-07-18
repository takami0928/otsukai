import { buildClipboardShareText } from './shareText'

const DEFAULT_REQUEST_SHARE_TITLE = 'おつかい依頼'

export function buildRequestShareText(requestTitle: string): string {
  return [
    '【おつかい依頼】',
    '',
    requestTitle.trim() || DEFAULT_REQUEST_SHARE_TITLE,
    '次のリンクから買い物リストを確認してください。',
  ].join('\n')
}

export function buildRequestShareMessage(requestTitle: string, requestUrl: string): string {
  return buildClipboardShareText({
    title: DEFAULT_REQUEST_SHARE_TITLE,
    text: buildRequestShareText(requestTitle),
    url: requestUrl,
  })
}
