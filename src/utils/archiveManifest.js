// 无酸盒归档清单的纯函数核心：校验、确定性构建、冻结与稳定序列化。
// 不依赖 Vue 或 Node API，前端与脚本环境均可复用。

export const ARCHIVE_STATUSES = ['待入盒', '暂存', '已完成']

export const REQUIRED_ARCHIVE_FIELDS = ['boxNo', 'code', 'title', 'pages', 'risk', 'status']

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) {
      deepFreeze(value[key])
    }
    Object.freeze(value)
  }
  return value
}

function blankToNull(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  return value
}

function recordRef(record) {
  return {
    boxNo: blankToNull(record?.boxNo),
    code: blankToNull(record?.code),
  }
}

// 返回可追踪的错误列表，每项都带记录下标与业务标识，便于定位问题记录。
export function validateArchiveRecords(records) {
  if (!Array.isArray(records)) {
    return [{ issue: 'invalid-records', message: 'records 必须是数组' }]
  }

  const errors = []

  records.forEach((record, index) => {
    for (const field of REQUIRED_ARCHIVE_FIELDS) {
      const value = record?.[field]
      if (value === undefined || value === null || String(value).trim() === '') {
        errors.push({ issue: 'missing-field', index, ...recordRef(record), field })
      }
    }

    const status = record?.status
    if (status && !ARCHIVE_STATUSES.includes(status)) {
      errors.push({
        issue: 'invalid-status',
        index,
        ...recordRef(record),
        field: 'status',
        value: status,
      })
    }
  })

  const indexesByBoxNo = new Map()
  records.forEach((record, index) => {
    const boxNo = record?.boxNo
    if (!boxNo) return
    if (!indexesByBoxNo.has(boxNo)) indexesByBoxNo.set(boxNo, [])
    indexesByBoxNo.get(boxNo).push(index)
  })
  for (const [boxNo, indexes] of indexesByBoxNo) {
    if (indexes.length > 1) {
      errors.push({ issue: 'duplicate-box-no', boxNo, indexes })
    }
  }

  return errors
}

function compareRecords(a, b) {
  const statusDiff = ARCHIVE_STATUSES.indexOf(a.status) - ARCHIVE_STATUSES.indexOf(b.status)
  if (statusDiff !== 0) return statusDiff
  if (a.boxNo < b.boxNo) return -1
  if (a.boxNo > b.boxNo) return 1
  return 0
}

// 固定键序拷贝，保证序列化结果稳定；note 允许缺省。
function normalizeRecord(record) {
  return {
    boxNo: record.boxNo,
    code: record.code,
    title: record.title,
    pages: record.pages,
    risk: record.risk,
    status: record.status,
    note: record.note ?? '',
  }
}

// 校验通过后构建清单：记录按状态顺序再按盒号排序，拷贝后深冻结。
// 不修改传入的 records；返回的 manifest 不可再被改动。
export function buildArchiveManifest(records) {
  const errors = validateArchiveRecords(records)
  if (errors.length > 0) {
    return { ok: false, stage: 'validate', errors }
  }

  const sorted = records.map(normalizeRecord).sort(compareRecords)
  const manifest = deepFreeze({
    manifest: 'acid-free-box-archive',
    version: 1,
    statusOrder: [...ARCHIVE_STATUSES],
    recordCount: sorted.length,
    records: sorted,
  })

  return { ok: true, manifest }
}

// 稳定序列化：键序由构建固定，2 空格缩进，统一以 \n 结尾，重复执行内容一致。
export function serializeArchiveManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`
}
