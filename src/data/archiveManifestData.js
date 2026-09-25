// 无酸盒归档清单最小示例数据。
// 仅供导出链路使用，不改动 restorationData.js 中的现有归档字段。

export const archiveManifestStatuses = [
  { key: 'pending', label: '待入盒' },
  { key: 'staging', label: '暂存' },
  { key: 'completed', label: '已完成' },
]

// 必填字段：boxNo / batchCode / title / status（见 scripts/lib/archiveManifestExport.js）。
// location / owner 为可选字段，缺省时导出为空字符串。
// 记录故意不按盒号排列，用于验证导出结果的稳定排序。
export const archiveManifestRecords = [
  {
    boxNo: 'AC-2026-004',
    batchCode: 'C-02',
    title: '戏曲抄本散页',
    status: 'pending',
    location: '修复室 2 · 待入盒推车',
    owner: '周恬',
  },
  {
    boxNo: 'AC-2026-002',
    batchCode: 'B-11',
    title: '碑帖拓片册页',
    status: 'staging',
    location: '修复室 2 · 暂存架 A-2',
    owner: '陆宁',
  },
  {
    boxNo: 'AC-2025-117',
    batchCode: 'D-08',
    title: '家谱木刻版片',
    status: 'completed',
    location: '库房 1 · 无酸盒柜 3-4',
    owner: '韩澈',
  },
  {
    boxNo: 'AC-2026-001',
    batchCode: 'A-03',
    title: '明抄本县志残卷',
    status: 'staging',
    location: '修复室 2 · 暂存架 A-1',
    owner: '韩澈',
  },
  {
    boxNo: 'AC-2025-116',
    batchCode: 'D-07',
    title: '清末戏单合订册',
    status: 'completed',
    location: '库房 1 · 无酸盒柜 3-3',
    owner: '周恬',
  },
]
