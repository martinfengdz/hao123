/**
 * 从前端默认数据 js/list.js 生成 data/seed.json
 * - 提取 getDefaultLinkData() 返回的对象
 * - 按分类去重（同一分类内 URL 相同只保留第一条）
 * - 输出到 data/seed.json
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = __dirname + '/..';
const src = fs.readFileSync(path.join(ROOT, 'js', 'list.js'), 'utf8');

// 移除浏览器全局赋值，便于在 Node 中求值
const code = src.replace(/window\.getDefaultLinkData\s*=\s*getDefaultLinkData;?/, '');
// eslint-disable-next-line no-new-func
const getDefaultLinkData = new Function(code + '\nreturn getDefaultLinkData();');

const data = getDefaultLinkData();

// 分类内去重
let removed = 0;
for (const cat in data) {
  if (!Array.isArray(data[cat])) continue;
  const seen = new Set();
  const cleaned = [];
  for (const item of data[cat]) {
    const url = (item.url || '').trim();
    if (seen.has(url)) { removed++; continue; }
    seen.add(url);
    cleaned.push(item);
  }
  data[cat] = cleaned;
}

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'seed.json'), JSON.stringify(data, null, 2));

console.log('✅ seed.json 生成完成');
console.log('   分类数:', Object.keys(data).length);
console.log('   链接总数:', Object.values(data).reduce((s, a) => s + a.length, 0));
if (removed > 0) console.log('   ⚠️ 已移除分类内重复链接:', removed, '条');
