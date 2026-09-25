import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

import { archiveBoxes } from '../src/data/archiveBoxes.js'
import {
  buildArchiveManifest,
  serializeArchiveManifest,
  validateArchiveRecords,
} from '../src/utils/archiveManifest.js'
import { exportArchiveManifest } from '../scripts/export-archive-manifest.mjs'

function validRecord(overrides = {}) {
  return {
    boxNo: 'ACF-2026-001',
    code: 'A-03',
    title: '明抄本县志残卷',
    pages: '17-29',
    risk: 'high',
    status: '待入盒',
    note: '虫道集中在装订线外沿。',
    ...overrides,
  }
}

async function withTempDir(run) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'archive-export-'))
  try {
    return await run(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test('校验能定位重复盒号并给出涉及记录的下标', () => {
  const records = [
    validRecord({ boxNo: 'ACF-2026-001', code: 'A-03' }),
    validRecord({ boxNo: 'ACF-2026-002', code: 'B-11' }),
    validRecord({ boxNo: 'ACF-2026-001', code: 'C-02' }),
  ]

  const errors = validateArchiveRecords(records)

  assert.deepEqual(errors, [
    { issue: 'duplicate-box-no', boxNo: 'ACF-2026-001', indexes: [0, 2] },
  ])
})

test('校验能列出缺失字段与非法状态，错误可追踪到具体记录', () => {
  const records = [
    { ...validRecord(), boxNo: '', title: undefined },
    validRecord({ boxNo: 'ACF-2026-009', code: 'X-01', status: '已销毁' }),
  ]

  const errors = validateArchiveRecords(records)

  assert.deepEqual(errors, [
    { issue: 'missing-field', index: 0, boxNo: null, code: 'A-03', field: 'boxNo' },
    { issue: 'missing-field', index: 0, boxNo: null, code: 'A-03', field: 'title' },
    {
      issue: 'invalid-status',
      index: 1,
      boxNo: 'ACF-2026-009',
      code: 'X-01',
      field: 'status',
      value: '已销毁',
    },
  ])
})

test('非数组输入返回可追踪错误而不是抛异常', () => {
  const errors = validateArchiveRecords(null)
  assert.equal(errors.length, 1)
  assert.equal(errors[0].issue, 'invalid-records')
})

test('导出后的清单被深冻结，任何改动都会抛出 TypeError', () => {
  const { ok, manifest } = buildArchiveManifest(archiveBoxes)
  assert.equal(ok, true)
  assert.equal(Object.isFrozen(manifest), true)
  assert.equal(Object.isFrozen(manifest.records), true)
  assert.equal(Object.isFrozen(manifest.records[0]), true)

  assert.throws(() => {
    manifest.recordCount = 99
  }, TypeError)
  assert.throws(() => {
    manifest.records[0].status = '已完成'
  }, TypeError)
  assert.throws(() => {
    manifest.records.push({})
  }, TypeError)
})

test('重复构建得到一致内容，且与输入顺序无关', () => {
  const first = serializeArchiveManifest(buildArchiveManifest(archiveBoxes).manifest)
  const second = serializeArchiveManifest(buildArchiveManifest(archiveBoxes).manifest)
  assert.equal(first, second)

  const shuffled = [...archiveBoxes].reverse()
  const third = serializeArchiveManifest(buildArchiveManifest(shuffled).manifest)
  assert.equal(first, third)
})

test('构建不会改动传入的归档记录', () => {
  const records = archiveBoxes.map((item) => ({ ...item }))
  const snapshot = JSON.stringify(records)

  buildArchiveManifest(records)

  assert.equal(JSON.stringify(records), snapshot)
  assert.equal(Object.isFrozen(records[0]), false)
})

test('端到端导出：生成稳定文件，重复执行字节一致，校验和可追踪', async () => {
  await withTempDir(async (dir) => {
    const first = await exportArchiveManifest({ outDir: dir })
    assert.equal(first.ok, true)
    assert.equal(first.recordCount, archiveBoxes.length)

    const manifestPath = path.join(dir, 'archive-manifest.json')
    const firstBytes = await readFile(manifestPath, 'utf8')
    assert.equal(firstBytes, serializeArchiveManifest(buildArchiveManifest(archiveBoxes).manifest))

    const expectedChecksum = `sha256:${createHash('sha256').update(firstBytes).digest('hex')}`
    assert.equal(first.checksum, expectedChecksum)

    const second = await exportArchiveManifest({ outDir: dir })
    const secondBytes = await readFile(manifestPath, 'utf8')
    assert.equal(second.ok, true)
    assert.equal(secondBytes, firstBytes)
    assert.equal(second.checksum, first.checksum)

    const report = JSON.parse(await readFile(path.join(dir, 'archive-manifest.report.json'), 'utf8'))
    assert.equal(report.ok, true)
    assert.equal(report.checksum, expectedChecksum)
  })
})

test('盒号重复与字段缺失时导出失败，报告可追踪且不生成清单', async () => {
  const badRecords = [
    validRecord({ boxNo: 'ACF-2026-001' }),
    validRecord({ boxNo: 'ACF-2026-001', code: 'B-11', pages: '' }),
  ]

  await withTempDir(async (dir) => {
    const result = await exportArchiveManifest({ records: badRecords, outDir: dir })

    assert.equal(result.ok, false)
    assert.equal(result.stage, 'validate')
    assert.deepEqual(
      result.errors.map((item) => item.issue),
      ['missing-field', 'duplicate-box-no'],
    )

    const report = JSON.parse(await readFile(path.join(dir, 'archive-manifest.report.json'), 'utf8'))
    assert.equal(report.ok, false)
    assert.equal(report.errors.length, 2)

    await assert.rejects(readFile(path.join(dir, 'archive-manifest.json'), 'utf8'), { code: 'ENOENT' })
  })
})

test('写入失败时返回可追踪结果并以 write 阶段标识', async () => {
  await withTempDir(async (dir) => {
    const blocker = path.join(dir, 'blocked')
    await writeFile(blocker, 'not a directory', 'utf8')
    const outDir = path.join(blocker, 'exports')

    const result = await exportArchiveManifest({ outDir })

    assert.equal(result.ok, false)
    assert.equal(result.stage, 'write')
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].issue, 'write-failed')
    assert.match(result.errors[0].path, /archive-manifest\.json$/)
    assert.ok(result.errors[0].message)
  })
})
