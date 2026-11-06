#!/usr/bin/env python3
"""内容校验：在仓库根目录运行 `python tools/check.py`。

检查项：nav.js 登记的页面是否都有 .md、front matter 字段、单一 H1、SVG 图解规范、站内链接是否有效、
页尾结构（常见坑 + 自测题）、顶部标签分组是否覆盖所有分类、搜索索引是否与文档同步、
docs 下是否存在未登记（孤儿）页面。发现问题时以非零状态退出。
"""
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else '.').resolve()
nav = (root / 'assets' / 'nav.js').read_text(encoding='utf-8')
app = (root / 'assets' / 'app.js').read_text(encoding='utf-8')
entries = re.findall(r"title: '([^']+)', path: '([^']+)'", nav)
paths = [p for _, p in entries]
valid = set(paths) | {'index'}
problems = []
total_figs = total_q = total_chars = 0
LEVELS = {'基础', '进阶', '深入'}

if len(paths) != len(set(paths)):
    problems.append('nav.js 中存在重复 path')

# 分类元信息与页数
cats = re.findall(r"id: '([^']+)', title: '([^']+)', desc: '([^']+)'", nav)
if len(cats) != len(re.findall(r"(?m)^\s*id: '", nav)):
    problems.append('nav.js 中存在缺少 id / title / desc 的分类')
cat_ids = [c[0] for c in cats]
if len(cat_ids) != len(set(cat_ids)):
    problems.append('nav.js 中存在重复分类 id')
for cid, ctitle, _ in cats:
    seg = re.split(r"(?m)^\s*id: '", nav)
    mine = [s for s in seg if s.startswith(cid + "'")]
    if mine and mine[0].count("path: '") == 0:
        problems.append(f'分类「{ctitle}」下没有任何页面')

# 顶部标签分组（app.js TAB_GROUPS）必须恰好覆盖所有分类
m = re.search(r"TAB_GROUPS = \[([\s\S]*?)\n  \];", app)
if not m:
    problems.append('app.js 中找不到 TAB_GROUPS')
else:
    grouped = re.findall(r"ids: \[([^\]]*)\]", m.group(1))
    flat = [i.strip().strip("'") for g in grouped for i in g.split(',') if i.strip()]
    unknown = [i for i in flat if i not in cat_ids]
    missing = [i for i in cat_ids if i not in flat]
    if unknown:
        problems.append('TAB_GROUPS 引用了不存在的分类 id: ' + ', '.join(unknown))
    if missing:
        problems.append('TAB_GROUPS 漏掉了分类 id: ' + ', '.join(missing))

for title, p in entries:
    f = root / 'docs' / (p + '.md')
    if not f.exists():
        problems.append(f'MISSING {p}')
        continue
    s = f.read_text(encoding='utf-8')
    total_chars += len(s)
    if not s.startswith('---\n') and not s.startswith('---\r\n'):
        problems.append(f'{p}: no front matter')
    fm_match = re.match(r'^---\r?\n([\s\S]*?)\r?\n---', s)
    fm_text = fm_match.group(1) if fm_match else ''
    body = re.sub(r'^---[\s\S]*?\r?\n---\r?\n', '', s, count=1)
    body_nocode = re.sub(r'```[\s\S]*?```', '', body)
    h1 = re.findall(r'^# (.+)$', body_nocode, re.M)
    if len(h1) != 1:
        problems.append(f'{p}: {len(h1)} H1 headings')
    elif h1[0].strip() != title.strip():
        problems.append(f'{p}: H1 与 nav 标题不一致 ({h1[0].strip()!r} vs {title!r})')
    for field in ('level', 'tags', 'summary'):
        if not re.search(r'^' + field + r':\s*\S', fm_text, re.M):
            problems.append(f'{p}: front matter 缺 {field}')
    lv = re.search(r'^level:\s*(.+)$', fm_text, re.M)
    if lv and lv.group(1).strip() not in LEVELS:
        problems.append(f'{p}: level 取值非法 ({lv.group(1).strip()})')
    if '## 常见坑' not in body_nocode:
        problems.append(f'{p}: 缺 「## 常见坑」小节')
    if '## 自测题' not in body_nocode:
        problems.append(f'{p}: 缺 「## 自测题」小节')
    figs = re.findall(r'<figure class="fig">[\s\S]*?</figure>', body)
    total_figs += len(figs)
    total_q += len(re.findall(r'^>\s*\[!QUESTION\]', body, re.M))
    if not figs:
        problems.append(f'{p}: 没有任何 SVG 图解')
    if body.count('<figure') != len(figs):
        problems.append(f'{p}: unclosed/odd figure tags')
    for i, fg in enumerate(figs, 1):
        if re.search(r'\n[ \t]*\n', fg):
            problems.append(f'{p}: figure {i} has blank line')
        if re.search(r'<svg[^>]*\s(width|height)=', fg):
            problems.append(f'{p}: figure {i} svg width/height')
        if re.search(r'\s(fill|stroke|style|font-size)=', fg):
            problems.append(f'{p}: figure {i} hardcoded color/style')
        if re.search(r'<svg[^>]*"\)">', fg):
            problems.append(f'{p}: figure {i} 疑似多余的 ") 字符')
        if not re.search(r'viewBox="0 0 (\d+) (\d+)"', fg):
            problems.append(f'{p}: figure {i} no viewBox')
    for link in re.findall(r'\]\(#/([^)#\s]+)', body_nocode) + re.findall(r'href="#/([^"#]+)', body):
        if link not in valid:
            problems.append(f'{p}: broken link #/{link}')

# 孤儿页面：存在 .md 但没有登记到导航
registered = set(paths) | {'index'}
for f in (root / 'docs').rglob('*.md'):
    key = f.relative_to(root / 'docs').as_posix()[:-3]
    if key not in registered:
        problems.append(f'ORPHAN docs/{key}.md 未登记到 nav.js')

# 搜索索引是否最新
idx = root / 'assets' / 'search-index.json'
if idx.exists():
    sys.path.insert(0, str(pathlib.Path(__file__).parent))
    import build_index
    fresh = build_index.build(root)
    cur = json.loads(idx.read_text(encoding='utf-8'))
    if cur != fresh:
        problems.append('search-index.json 已过期：请运行 python tools/build_index.py')
else:
    problems.append('缺少 assets/search-index.json：请运行 python tools/build_index.py')

print('pages', len(paths), 'figures', total_figs, 'questions', total_q, 'chars', total_chars)
print('\n'.join(problems) if problems else 'NO PROBLEMS')
sys.exit(1 if problems else 0)
