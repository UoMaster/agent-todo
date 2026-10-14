/** 调用 HTTP API 失败时抛出的错误（web 与 cli 共用） */
export class ApiError extends Error {
  /** HTTP 状态码；0 表示网络层失败（根本没连上服务） */
  readonly statusCode: number
  /** 服务端返回的业务错误码，如 not_found / validation_error */
  readonly code: string

  constructor(statusCode: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.statusCode = statusCode
    this.code = code
  }

  /** 是否是网络层错误（没有拿到任何 HTTP 响应） */
  get isNetworkError(): boolean {
    return this.statusCode === 0
  }
}
