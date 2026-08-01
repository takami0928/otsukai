export const SHARED_REQUEST_RETENTION_MS =
  14 * 24 * 60 * 60 * 1_000
export const SHARED_REQUEST_TOKEN_PREFIX = 'r1_'
export const SHARED_REQUEST_TOKEN_PATTERN = /^r1_[A-Za-z0-9_-]{32}$/
export const SHARED_REQUEST_EDIT_SECRET_PREFIX = 'e1_'
export const SHARED_REQUEST_EDIT_SECRET_PATTERN =
  /^e1_[A-Za-z0-9_-]{43}$/
export const SHARED_REQUEST_HASH_PATTERN = /^[a-f0-9]{64}$/
export const SHARED_REQUEST_CREATE_ACTION = 'shared_request_create'
export const SHARED_REQUEST_UPDATE_ACTION = 'shared_request_update'
export const MAX_SHARED_REQUEST_ITEMS = 200
export const MAX_SHARED_REQUEST_UPDATES = 100
export const MAX_SHARED_REQUEST_PHOTOS = 3
export const MAX_SHARED_REQUEST_BODY_BYTES = 100 * 1024
