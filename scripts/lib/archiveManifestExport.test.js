import assert from 'node:assert/strict'
import test from 'node:test'

import {
  archiveManifestRecords,
  archiveManifestStatuses,
} from '../../src/data/archiveManifestData.js'
import {
  buildArchiveExport,
  validateArchiveRecords,
} from './archiveManifestExport.js'

const statuses = archiveManifestStatuses

function buildSample() {
  return buildArchiveExport(archiveManifestRecords, { statuses })
}

test('示例数据可导出三个状态文件与一份报告', () => {
  const result = buildSample()

  assert.equal(result.ok, true)
  assert.deepEqual(
    result.files.map((file) => file.name),
    [
      'archive-manifest.pending.json',
      'archive-manifest.staging.json',
      'archive-manifest.completed.json',
      'archive-manifest.report.json',
    ],
  )
  assert.deepEqual(
    result.files.map((file) => file.records),
    [1, 2, 2, null],
  )
})

test('盒号重复时给出可追踪的 DUPLICATE_BOX_NO 错误', () => {
  const records = [
    { boxNo: 'AC-2026-001', batchCode: 'A-03', title: '残卷一', status: 'pending' },
    { boxNo: 'AC-2026-001', batchCode: 'B-11', title: '残卷二', status: 'staging' },
  ]

  const errors = validateArchiveRecords(records, { statuses })

  assert.equal(errors.length, 1)
  assert.equal(errors[0].code, 'DUPLICATE_BOX_NO')
  assert.equal(errors[0].boxNo, 'AC-2026-001')
  assert.deepEqual(errors[0].recordIndexes, [0, 1])
})

test('字段缺失时给出可追踪的 MISSING_FIELD 错误', () => {
  const records = [{ boxNo: 'AC-2026-009', status: 'pending' }]

  const errors = validateArchiveRecords(records, { statuses })
  const missingFields = errors
    .filter((error) => error.code === 'MISSING_FIELD')
    .map((error) => error.field)

  assert.deepEqual(missingFields, ['batchCode', 'title'])
  assert.ok(errors.every((error) => error.recordIndex === 0))
  assert.ok(errors.every((error) => error.boxNo === 'AC-2026-009'))
})

test('未知状态会被拦截且不会生成文件', () => {
  const records = [
    { boxNo: 'AC-2026-010', batchCode: 'A-03', title: '残卷', status: 'archived' },
  ]

  const result = buildArchiveExport(records, { statuses })

  assert.equal(result.ok, false)
  assert.equal(result.errors[0].code, 'UNKNOWN_STATUS')
  assert.deepEqual(result.files, [])
})

test('重复执行与输入顺序无关，导出内容一致', () => {
  const first = buildSample()
  const reversed = [...archiveManifestRecords].reverse()
  const second = buildArchiveExport(reversed, { statuses })

  assert.equal(second.ok, true)
  assert.deepEqual(
    second.files.map((file) => file.content),
    first.files.map((file) => file.content),
  )
  assert.deepEqual(
    second.files.map((file) => file.sha256),
    first.files.map((file) => file.sha256),
  )
})

test('导出后清单状态被冻结且原顺序不被改动', () => {
  const records = [
    { boxNo: 'AC-2026-002', batchCode: 'B-11', title: '乙', status: 'staging' },
    { boxNo: 'AC-2026-001', batchCode: 'A-03', title: '甲', status: 'pending' },
  ]

  const result = buildArchiveExport(records, { statuses })

  assert.equal(result.ok, true)
  assert.equal(Object.isFrozen(records), true)
  assert.equal(Object.isFrozen(records[0]), true)
  assert.deepEqual(
    records.map((record) => record.boxNo),
    ['AC-2026-002', 'AC-2026-001'],
  )
  assert.throws(() => {
    records[0].boxNo = 'AC-2099-999'
  }, TypeError)
})

test('导出记录按盒号稳定排序，可选字段缺省为空字符串', () => {
  const records = [
    { boxNo: 'AC-2026-010', batchCode: 'B-11', title: '乙', status: 'staging' },
    { boxNo: 'AC-2026-002', batchCode: 'A-03', title: '甲', status: 'staging' },
  ]

  const result = buildArchiveExport(records, { statuses })
  const stagingFile = result.files.find(
    (file) => file.name === 'archive-manifest.staging.json',
  )
  const parsed = JSON.parse(stagingFile.content)

  assert.deepEqual(
    parsed.records.map((record) => record.boxNo),
    ['AC-2026-002', 'AC-2026-010'],
  )
  assert.equal(parsed.records[0].location, '')
  assert.equal(parsed.records[0].owner, '')
})
