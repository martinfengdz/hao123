/**
 * 验证核对脚本：统计、重复检测、URL 合法性校验
 * 读取 data/links.json（优先）或 data/seed.json
 * 输出报告并写入 VERIFY_REPORT.txt
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname + '/..';
const linksPath = path.join(ROOT, 'data', 'links.json');
const seedPath = path.join(ROOT, 'data', 'seed.json');
const dataPath = fs.existsSync(linksPath) ? linksPath : seedPath;

if (!fs.existsSync(dataPath)) {
  console.error('未找到数据文件，请先运行: node scripts/seed.js');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const CAT_NAMES = {
  recommended: '推荐网址', proxy: '代理系统', internal: '内部系统', software: '软件工具',
  business: '在线业务', common: '常用网址', finance: '财务理财', work: '工作工具', side: 'AI工具'
};

const lines = [];
const log = (s) => { lines.push(s); console.log(s); };

// 1. 各分类统计
log('========== 奇易导航 验证核对报告 ==========');
log('数据文件: ' + path.basename(dataPath));
log('生成时间: ' + new Date().toISOString());
log('');
log('【1】各分类链接数量');
let total = 0;
const counts = {};
for (const cat of Object.keys(CAT_NAMES)) {
  const arr = Array.isArray(data[cat]) ? data[cat] : [];
  counts[cat] = arr.length;
  total += arr.length;
  log(`  - ${CAT_NAMES[cat]} (${cat}): ${arr.length}`);
}
log(`  合计: ${total}`);
log('');

// 2. 分类内重复（按 URL）
log('【2】分类内重复链接（同一分类 URL 相同）');
let withinDup = 0;
for (const cat of Object.keys(CAT_NAMES)) {
  const arr = Array.isArray(data[cat]) ? data[cat] : [];
  const seen = {};
  for (const it of arr) {
    const u = (it.url || '').trim();
    if (seen[u]) {
      withinDup++;
      log(`  ❌ [${CAT_NAMES[cat]}] "${it.name}" 与 "${seen[u]}" 重复 URL: ${u}`);
    } else {
      seen[u] = it.name;
    }
  }
}
if (withinDup === 0) log('  ✅ 无分类内重复');
log('');

// 3. 跨分类重复（信息性）
log('【3】跨分类重复链接（不同分类出现相同 URL，多为有意为之）');
const urlMap = {};
for (const cat of Object.keys(CAT_NAMES)) {
  const arr = Array.isArray(data[cat]) ? data[cat] : [];
  for (const it of arr) {
    const u = (it.url || '').trim();
    if (!urlMap[u]) urlMap[u] = [];
    urlMap[u].push(`${CAT_NAMES[cat]}/${it.name}`);
  }
}
let crossDup = 0;
for (const u in urlMap) {
  if (urlMap[u].length > 1) {
    crossDup++;
    log(`  ℹ️ ${u} 出现在: ${urlMap[u].join('、')}`);
  }
}
if (crossDup === 0) log('  ✅ 无跨分类重复');
log('');

// 4. URL 合法性
log('【4】URL 合法性校验');
let bad = 0;
for (const cat of Object.keys(CAT_NAMES)) {
  const arr = Array.isArray(data[cat]) ? data[cat] : [];
  for (const it of arr) {
    const u = (it.url || '').trim();
    if (!u) { bad++; log(`  ❌ [${CAT_NAMES[cat]}] "${it.name}" 空 URL`); continue; }
    try {
      const p = new URL(u);
      if (!/^https?:$/.test(p.protocol)) { bad++; log(`  ❌ [${CAT_NAMES[cat]}] "${it.name}" 非 http/https: ${u}`); }
    } catch (e) {
      bad++; log(`  ❌ [${CAT_NAMES[cat]}] "${it.name}" 非法 URL: ${u}`);
    }
  }
}
if (bad === 0) log('  ✅ 全部 URL 合法');
log('');

// 5. 结论
log('【结论】');
log(`  分类数: ${Object.keys(CAT_NAMES).length}，总链接: ${total}`);
log(`  分类内重复: ${withinDup}（应在 seed 阶段已自动去除）`);
log(`  跨分类重复: ${crossDup}（信息性，通常无需处理）`);
log(`  非法 URL: ${bad}`);
log('==========================================');

fs.writeFileSync(path.join(ROOT, 'VERIFY_REPORT.txt'), lines.join('\n'), 'utf8');
console.log('\n报告已写入 VERIFY_REPORT.txt');
