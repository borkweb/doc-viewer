// Minimal types for the vendored highlight.js ESM common bundle. Only the
// surface highlightCode() uses is declared.
interface HLJSResult {
  value: string
  language?: string
}
interface HLJS {
  highlight(code: string, options: { language: string; ignoreIllegals?: boolean }): HLJSResult
  highlightAuto(code: string): HLJSResult
  getLanguage(name: string): unknown | undefined
}
declare const hljs: HLJS
export default hljs
