import { createHash } from 'node:crypto'

// 无酸盒归档清单导出的纯函数核心：不触碰文件系统，便于重复执行与测试。

export const ARCHIVE_EXPORT_SCHEMA_VERSION = 1

export const ARCHIVE_REQUIRED_FIELDS = ['boxNo', 'batchCode', 'title', 'status']

export const ARCHIVE_EXPORT_ERROR_CODES = Object.freeze({
  missingField: 'MISSING_FIELD',
  duplicateBoxNo: 'DUPLICATE_BOX_NO',
  unknownStatus: 'UNKNOWN_STATUS',
  writeFailed: 'WRITE_FAILED',
})

// 深度冻结，保证导出链路不会改动清单状态。
export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) {
      deepFreeze(value[key])
    }
  }
  return value
}

// 按码元比较，避免 localeCompare 受运行环境影响，保证跨机器结果一致。
export function compareStrings(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

// 固定两空格缩进 + 末尾换行，保证同一输入永远得到同一字节序列。
export function stableStringify(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function hashContent(content) {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === ''
}

// 校验清单记录，返回可追踪的结构化错误（含记录序号、盒号、字段名）。
export function validateArchiveRecords(
  records,
  { requiredFields = ARCHIVE_REQUIRED_FIELDS, statuses = [] } = {},
) {
  const errors = []
  const knownStatusKeys = new Set(statuses.map((status) => status.key))
  const boxNoIndex = new Map()

  records.forEach((record, recordIndex) => {
    const boxNo = record?.boxNo ?? null

    for (const field of requiredFields) {
      if (isBlank(record?.[field])) {
        errors.push({
          code: ARCHIVE_EXPORT_ERROR_CODES.missingField,
          recordIndex,
          boxNo,
          field,
          message: `第 ${recordIndex + 1} 条记录缺少必填字段 ${field}`,
        })
      }
    }

    if (!isBlank(record?.status) && !knownStatusKeys.has(record.status)) {
      errors.push({
        code: ARCHIVE_EXPORT_ERROR_CODES.unknownStatus,
        recordIndex,
        boxNo,
        field: 'status',
        message: `第 ${recordIndex + 1} 条记录的状态 ${record.status} 不在待入盒/暂存/已完成之内`,
      })
    }

    if (!isBlank(record?.boxNo)) {
      const indexes = boxNoIndex.get(record.boxNo) ?? []
      indexes.push(recordIndex)
      boxNoIndex.set(record.boxNo, indexes)
    }
  })

  const sortedBoxNos = [...boxNoIndex.keys()].sort(compareStrings)
  for (const boxNo of sortedBoxNos) {
    const recordIndexes = boxNoIndex.get(boxNo)
    if (recordIndexes.length > 1) {
      errors.push({
        code: ARCHIVE_EXPORT_ERROR_CODES.duplicateBoxNo,
        boxNo,
        recordIndexes,
        message: `盒号 ${boxNo} 重复出现于第 ${recordIndexes
          .map((index) => index + 1)
          .join('、')} 条记录`,
      })
    }
  }

  return errors
}

function toExportRow(record, statusLabels) {
  return {
    boxNo: record.boxNo,
    batchCode: record.batchCode,
    title: record.title,
    status: record.status,
    statusLabel: statusLabels.get(record.status),
    location: record.location ?? '',
    owner: record.owner ?? '',
  }
}

// 构建导出文件集：先冻结并校验输入，再按状态分组、按盒号排序，
// 输出内容不含时间戳等易变数据，重复执行结果一致。
export function buildArchiveExport(records, { statuses = [] } = {}) {
  deepFreeze(records)

  const errors = validateArchiveRecords(records, { statuses })
  if (errors.length > 0) {
    return { ok: false, errors, files: [] }
  }

  const statusLabels = new Map(statuses.map((status) => [status.key, status.label]))
  const files = []
  const totals = {}

  for (const status of statuses) {
    const rows = records
      .filter((record) => record.status === status.key)
      .map((record) => toExportRow(record, statusLabels))
      .sort((a, b) => compareStrings(a.boxNo, b.boxNo))

    const content = stableStringify({
      schemaVersion: ARCHIVE_EXPORT_SCHEMA_VERSION,
      status: status.key,
      statusLabel: status.label,
      count: rows.length,
      records: rows,
    })

    files.push({
      name: `archive-manifest.${status.key}.json`,
      content,
      records: rows.length,
      sha256: hashContent(content),
    })
    totals[status.key] = rows.length
  }
  totals.all = records.length

  const reportContent = stableStringify({
    schemaVersion: ARCHIVE_EXPORT_SCHEMA_VERSION,
    status: 'ok',
    totals,
    files: files.map(({ name, records: recordCount, sha256 }) => ({
      name,
      records: recordCount,
      sha256,
    })),
  })

  files.push({
    name: 'archive-manifest.report.json',
    content: reportContent,
    records: null,
    sha256: hashContent(reportContent),
  })

  return { ok: true, errors: [], files }
}
