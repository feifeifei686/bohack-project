export class ApiError extends Error {
  status: number
  code: string
  retryable: boolean
  details?: { path: string; message: string }[]
  constructor(status: number, code: string, message: string, retryable = false, details?: { path: string; message: string }[]) {
    super(message)
    this.status = status
    this.code = code
    this.retryable = retryable
    this.details = details
  }
}
