import { describe, expect, test } from 'vitest'
import { ApiError } from './error.ts'

describe('ApiError', () => {
  test('携带状态码与业务错误码，并且是 Error 实例', () => {
    const error = new ApiError(404, 'not_found', '找不到资源')

    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.name).toBe('ApiError')
    expect(error.message).toBe('找不到资源')
    expect(error.statusCode).toBe(404)
    expect(error.code).toBe('not_found')
  })

  test('statusCode 为 0 表示网络层错误', () => {
    expect(new ApiError(0, 'network_error', '连不上服务').isNetworkError).toBe(true)
    expect(new ApiError(500, 'internal_error', '服务异常').isNetworkError).toBe(false)
  })

  test('保留堆栈信息，便于排查', () => {
    expect(new ApiError(400, 'bad_request', '参数错误').stack).toBeTruthy()
  })
})
