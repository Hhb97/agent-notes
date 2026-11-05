---
level: 深入
tags: [真实架构案例, 代码助手, repo map, 编辑循环, 沙箱, 测试反馈, PR 审查]
summary: 以代码助手为例拆解真实架构：仓库索引与上下文装配、规划—编辑—执行—测试的循环、沙箱与权限边界、差异审查与评测指标。
---

# 代码助手架构

> [!ABSTRACT] 一句话版本
> - 代码助手不是「让模型写代码」，而是一条**带反馈的闭环**：检索相关代码 → 规划改动 → 生成补丁 → 沙箱执行 / 跑测试 → 把结果回填 → 再改。
> - 上下文难点是**仓库远大于窗口**：用 repo map、符号检索、按需读取文件片段，而不是把整个仓库塞进提示词。
> - 三条硬约束：**沙箱隔离**（文件 / 网络 / 命令白名单）、**只读优先**、**所有改动以 diff 形式交人审查**。
> - 评测看「测试通过 + 任务完成 + 无越界改动」，不看代码看起来多漂亮。

## 一、场景与边界

| 需求 | 风险 |
| --- | --- |
| 读懂现有仓库并定位相关代码 | 仓库上下文远超窗口，容易改错文件 |
| 按需求生成修改 | 模型可能「顺手重构」无关代码 |
| 运行测试验证 | 任意命令执行 = 任意副作用 |
| 提交变更 | 直接写主分支、绕过评审 |

> [!CAUTION] 代码执行能力 = 完整副作用能力
> 文件读写、网络、进程、包安装都可能在沙箱里发生。执行层白名单与隔离是这套架构的前提，见 [工具执行、沙箱与外部集成](#/tools/sandbox-integration)。

## 二、完整架构

<figure class="fig">
<svg viewBox="0 0 760 330" class="dg" role="img" aria-label="代码助手架构：离线仓库索引与在线编辑循环，含沙箱执行、测试反馈、diff 审查与人工合并">
<text class="th" x="20" y="24">离线：仓库索引</text>
<rect class="b1" x="20" y="40" width="120" height="40" rx="8"/><text class="ts" x="80" y="60" text-anchor="middle" dominant-baseline="middle">解析 AST / 符号</text>
<rect class="b1" x="152" y="40" width="120" height="40" rx="8"/><text class="ts" x="212" y="60" text-anchor="middle" dominant-baseline="middle">repo map</text>
<rect class="b1" x="284" y="40" width="140" height="40" rx="8"/><text class="ts" x="354" y="60" text-anchor="middle" dominant-baseline="middle">代码 / 文档向量索引</text>
<rect class="b1" x="436" y="40" width="140" height="40" rx="8"/><text class="ts" x="506" y="60" text-anchor="middle" dominant-baseline="middle">测试与依赖元数据</text>
<line class="l" x1="140" y1="60" x2="152" y2="60" marker-end="url(#arr)"/>
<line class="l" x1="272" y1="60" x2="284" y2="60" marker-end="url(#arr)"/>
<line class="l" x1="424" y1="60" x2="436" y2="60" marker-end="url(#arr)"/>
<line class="ld" x1="20" y1="96" x2="740" y2="96"/>
<text class="th" x="20" y="122">在线：编辑循环（限轮次 / 限预算）</text>
<rect class="b2" x="20" y="138" width="120" height="42" rx="8"/><text class="ts" x="80" y="159" text-anchor="middle" dominant-baseline="middle">检索相关文件</text>
<rect class="b3" x="152" y="138" width="120" height="42" rx="8"/><text class="ts" x="212" y="159" text-anchor="middle" dominant-baseline="middle">规划改动清单</text>
<rect class="b4" x="284" y="138" width="120" height="42" rx="8"/><text class="ts" x="344" y="159" text-anchor="middle" dominant-baseline="middle">生成补丁 diff</text>
<rect class="b5" x="416" y="138" width="140" height="42" rx="8"/><text class="ts" x="486" y="159" text-anchor="middle" dominant-baseline="middle">沙箱执行 / 测试</text>
<rect class="b2" x="568" y="138" width="172" height="42" rx="8"/><text class="ts" x="654" y="159" text-anchor="middle" dominant-baseline="middle">结果回填 → 再改</text>
<line class="l" x1="140" y1="159" x2="152" y2="159" marker-end="url(#arr)"/>
<line class="l" x1="272" y1="159" x2="284" y2="159" marker-end="url(#arr)"/>
<line class="l" x1="404" y1="159" x2="416" y2="159" marker-end="url(#arr)"/>
<line class="l" x1="556" y1="159" x2="568" y2="159" marker-end="url(#arr)"/>
<line class="la" x1="654" y1="180" x2="654" y2="200" marker-end="url(#arr-a)"/>
<line class="la" x1="654" y1="200" x2="80" y2="200" marker-end="url(#arr-a)"/>
<text class="ts" x="367" y="194" text-anchor="middle">测试失败 → 精简错误回填，有限次自纠正</text>
<rect class="bg" x="20" y="222" width="720" height="48" rx="10"/>
<text class="t" x="380" y="246" text-anchor="middle" dominant-baseline="middle">改动以 diff 交付：范围校验 → 人工审查 → PR / 合并（Agent 不直接推主分支）</text>
<rect class="b4" x="20" y="284" width="720" height="36" rx="9"/>
<text class="ts" x="380" y="302" text-anchor="middle" dominant-baseline="middle">护栏：只读优先 · 命令白名单 · 工作区隔离 · 无网络外传 · 全链路 run_id 审计</text>
</svg>
<figcaption>图 1：反馈闭环 + 人工审查，是代码助手可用与可信的关键</figcaption>
</figure>

## 三、上下文怎么装

| 手段 | 说明 |
| --- | --- |
| **repo map** | 文件树、模块边界、类 / 函数签名组成的精简地图，给模型全局感 |
| 符号 / 语义检索 | 按需求检索相关文件与定义，见 [检索优化](#/knowledge/retrieval-advanced) |
| 按需读取 | 只取命中文件的相关片段，不整库塞入 |
| 命令输出裁剪 | 测试日志只保留失败摘要与关键堆栈行 |
| 工作记忆外置 | 计划与中间 diff 存外部，上下文只放当前步骤，见 [上下文工程深入](#/deep/context-engineering) |

> [!TIP] 先解决「找得到」，再解决「写得好」
> 大量失败其实是模型没看到正确文件。打印检索命中的文件列表与片段，比反复调提示词有效。

## 四、执行与权限

| 层 | 约束 |
| --- | --- |
| 工作区 | 独立副本 / 容器，不直接挂载开发机或生产目录 |
| 文件系统 | 只允许仓库目录，敏感路径只读或不可见 |
| 命令 | 白名单（构建、测试、静态检查），禁止任意 shell、包安装、网络外联 |
| 资源 | CPU / 内存 / 时间配额，防止死循环测试 |
| 身份 | 代码仓库账号最小权限，Agent 不直接推主分支 |
| 审计 | 每次命令、每次 diff、每次测试结果挂到 run_id |

**只读优先**：分析、定位、审查阶段全部只读；只有生成补丁阶段在隔离工作区里写，且以 diff 形式交付，见 [生产级 Agent 架构全景](#/deep/agent-architecture)。

## 五、自纠正与终止

测试失败时把精简后的错误回填让模型改 1～2 次，但必须：

- 设最大轮次与预算，超限转人工；
- 只回填可恢复错误（编译 / 测试失败），权限拒绝、命令白名单拦截不重试；
- 记录每次尝试的 diff 与结果，避免反复生成同一个错误补丁，见 [可靠性、成本与评测门禁](#/deep/reliability-eval)。

## 六、评测指标

| 指标 | 说明 |
| --- | --- |
| 任务完成率 | 固定任务集上是否满足需求 |
| 测试通过率 | 新增 / 既有测试是否通过 |
| 改动范围合规率 | 是否只改了允许的文件与函数 |
| 越权 / 危险命令拦截率 | 必须 100% |
| 轮次与成本 | 平均轮次、token、沙箱时长 |
| 人工接受率 | PR 被合并 / 被打回的比例 |

## 常见坑

1. **整仓库塞进上下文**：又贵又漏关键信息。
2. **沙箱开着网络与任意 shell**：代码执行变成逃逸通道。
3. **Agent 直接推主分支**：绕过评审，风险不可控。
4. **无限自纠正**：同一错误反复生成，成本与延迟失控。
5. **测试日志原样回填**：噪声迅速吃满上下文。
6. **没有改动范围校验**：模型「顺手」改了无关模块。

## 深入追问

> [!QUESTION] 为什么代码助手必须做成「带反馈的闭环」？
> 一次生成很难保证编译与测试都通过；把执行结果回填让模型有限次修正，才可能收敛，这也是 ReAct 循环在代码场景的具体形态。

> [!QUESTION] repo map 解决什么问题？
> 仓库远大于上下文窗口，map 用文件树与符号签名提供全局结构感，配合按需检索，让模型在不看全库的情况下定位正确文件。

> [!QUESTION] 为什么改动要以 diff 交付而不是直接提交？
> diff 让范围校验、人工审查与回滚成为可能，也把「产生变更」与「接受变更」两个权限分开，符合最小权限原则。

> [!QUESTION] 评测里为什么要有「改动范围合规率」？
> 任务完成但改了无关模块，仍是危险行为；范围合规能发现模型自作主张的重构，是安全类指标而非质量类指标。
