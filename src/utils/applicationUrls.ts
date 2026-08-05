export function buildApplicationHashUrl(
  baseUrl: string,
  hashPath: string,
): string {
  if (!hashPath.startsWith('/') || /[#\r\n]/u.test(hashPath)) {
    throw new Error('Invalid application hash path.')
  }
  const url = new URL(baseUrl)
  url.hash = ''
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`
  }
  return `${url.toString()}#${hashPath}`
}
