export type ImportResult = {
  ok: boolean
  total?: number
  imported?: number
  updated?: number
  skipped?: number
  error?: string
  details?: unknown
}
