---
level: 深入
tags: [Higress, AI 网关, Envoy, Wasm, 多模型路由, token 限流, 语义缓存, MCP 托管, 灰度]
summary: 讲清 Agent 项目为什么需要一个 AI 网关：多模型路由与降级、密钥集中、token 级限流、语义缓存、MCP 托管与审计，并给出配置骨架与语义缓存的真实风险。
---

# Higress：AI 网关与 MCP 托管

> [!ABSTRACT] 一句话版本
> - AI 网关解决的不是「转发」，而是四件业务代码做不好的事：**多模型统一出口、密钥不进业务、token 级限流与配额、语义缓存与审计**。
> - 底座是 **Istio + Envoy + Wasm 插件**（CNCF Sandbox），因此它既是 K8s Ingress，也是 AI 网关——同一层基础设施干两件事。
> - 最有价值也最危险的能力是**语义缓存**：省成本效果显著，但缓存键漏了租户/权限维度就是数据泄露。
> - 它还托管 **MCP Server**：把内部 REST API 转成 MCP 工具，统一鉴权与限流，避免每个业务系统各写一套。

> [!NOTE] 和其他页的分工
> 本页讲**网关层**。模型与端点见 [百炼与 DashScope](#/alibaba/bailian-dashscope)；MCP 协议本身见 [MCP 协议深入](#/tools/mcp-deep)；工具设计原则见 [工具设计原则](#/tools/tool-design)。

## 一、为什么 Agent 项目会需要一个网关

先把「不需要」说清楚：**单团队、单模型、单服务**，直连 API 完全够用，加网关只是多一跳运维。出现下面任一信号时才值得上：

| 信号 | 没有网关会怎样 |
| --- | --- |
| 出现第二个模型（备用或不同档位） | 降级逻辑写死在业务里，各服务一套 |
| 多个服务/团队都在调模型 | API key 散落在 N 个配置里，泄露面扩大、无法统一轮换 |
| 需要按用户/租户限额 | 业务自己记账，口径不一致，容易被绕过 |
| 需要审计「谁问了什么」 | 日志分散，合规时拼不起来 |
| 工具（MCP）超过十个、跨团队 | 每个服务各自配地址与鉴权 |
| 成本要分摊到业务线 | 账单只有总量，无法归因 |

一个判断口诀：**当「模型调用」从「一个服务的私事」变成「组织的公共资源」时，就需要网关。**

## 二、请求链路：插件插在哪

<figure class="fig">
<svg viewBox="0 0 760 330" class="dg" role="img" aria-label="Higress AI 网关请求链路：请求依次经过鉴权、安全过滤、token 限流、语义缓存、模型代理，再到不同模型上游">
<rect class="b1" x="20" y="44" width="130" height="44" rx="8"/>
<text class="ts" x="85" y="66" text-anchor="middle" dominant-baseline="middle">业务服务</text>
<rect class="b2" x="182" y="44" width="140" height="44" rx="8"/>
<text class="ts" x="252" y="66" text-anchor="middle" dominant-baseline="middle">① 鉴权 / 密钥</text>
<rect class="b3" x="354" y="44" width="150" height="44" rx="8"/>
<text class="ts" x="429" y="66" text-anchor="middle" dominant-baseline="middle">② 安全过滤</text>
<rect class="b4" x="536" y="44" width="204" height="44" rx="8"/>
<text class="ts" x="638" y="66" text-anchor="middle" dominant-baseline="middle">③ token 限流 / 配额</text>
<rect class="b5" x="20" y="122" width="180" height="44" rx="8"/>
<text class="ts" x="110" y="144" text-anchor="middle" dominant-baseline="middle">④ 语义缓存</text>
<rect class="b1" x="232" y="122" width="200" height="44" rx="8"/>
<text class="ts" x="332" y="144" text-anchor="middle" dominant-baseline="middle">⑤ ai-proxy 协议转换</text>
<rect class="b2" x="464" y="122" width="130" height="44" rx="8"/>
<text class="ts" x="529" y="144" text-anchor="middle" dominant-baseline="middle">⑥ 观测</text>
<rect class="b3" x="20" y="212" width="180" height="42" rx="8"/>
<text class="ts" x="110" y="233" text-anchor="middle" dominant-baseline="middle">Qwen（主）</text>
<rect class="b4" x="232" y="212" width="180" height="42" rx="8"/>
<text class="ts" x="322" y="233" text-anchor="middle" dominant-baseline="middle">备用模型（降级）</text>
<rect class="b5" x="444" y="212" width="180" height="42" rx="8"/>
<text class="ts" x="534" y="233" text-anchor="middle" dominant-baseline="middle">自建 vLLM</text>
<line class="l" x1="150" y1="66" x2="182" y2="66" marker-end="url(#arr)"/>
<line class="l" x1="322" y1="66" x2="354" y2="66" marker-end="url(#arr)"/>
<line class="l" x1="504" y1="66" x2="536" y2="66" marker-end="url(#arr)"/>
<line class="l" x1="600" y1="88" x2="200" y2="122" marker-end="url(#arr)"/>
<line class="l" x1="200" y1="144" x2="232" y2="144" marker-end="url(#arr)"/>
<line class="l" x1="432" y1="144" x2="464" y2="144" marker-end="url(#arr)"/>
<line class="l" x1="110" y1="166" x2="110" y2="212" marker-end="url(#arr)"/>
<line class="l" x1="332" y1="166" x2="322" y2="212" marker-end="url(#arr)"/>
<line class="l" x1="529" y1="166" x2="534" y2="212" marker-end="url(#arr)"/>
<text class="ts" x="20" y="284">顺序原则：先鉴权再花钱（②③ 在缓存之前），先缓存再转发（④ 在 ⑤ 之前）</text>
<text class="ts" x="20" y="304">降级原则：上游 429 / 5xx 时按预设链切到备用模型，并对调用方透明</text>
</svg>
<figcaption>插件是有顺序的：把限流放在缓存后面，缓存命中的请求就不消耗配额，但也意味着「不花钱的请求不做数」——这是业务决策。</figcaption>
</figure>

## 三、核心插件与它们解决的问题

| 插件（名称以官方为准） | 作用 | 关键配置点 |
| --- | --- | --- |
| `ai-proxy` | 把 OpenAI 格式请求转成各厂商协议 | 厂商、模型名映射、API key 引用 |
| `ai-cache` | 语义缓存，近似问题直接命中 | **缓存键维度**、相似度阈值、TTL |
| `ai-token-ratelimit` | 按 token 而非请求数限流 | 维度（用户/租户/路由）、输入/输出分别限制 |
| `mcp-server` | 托管 MCP Server，暴露内部 API | 工具定义、鉴权透传 |
| `ai-security-guard` | 内容安全检测 | 检测点（入口/出口）、命中动作 |
| 观测相关 | 指标、日志、链路 | 与 ARMS / Prometheus 对接 |

**`ai-token-ratelimit` 是 AI 网关与传统网关最大的区别**：传统网关按 QPS 限流，但一次 Agent 调用的成本可能是另一次的 50 倍（上下文长度差异）。按请求数限流等于没限。

## 四、配置骨架

概念示意（字段以官方文档为准）：

```yaml
# ① 声明上游模型服务
apiVersion: networking.higress.io/v1
kind: McpBridge
metadata:
  name: model-providers
  namespace: higress-system
spec:
  registries:
    - name: dashscope
      type: dns
      domain: dashscope.aliyuncs.com
      port: 443
      protocol: HTTPS
---
# ② 路由 + 插件
apiVersion: networking.higress.io/v1
kind: VirtualService
metadata:
  name: ai-gateway
  namespace: higress-system
spec:
  hosts: ["ai.internal.example.com"]
  http:
    - match: [{ uri: { prefix: /v1/chat/completions } }]
      route:
        - destination: { host: model-providers, subset: v1 }
      plugins:
        - name: ai-proxy
          config:
            provider: { name: dashscope, apiKey: "${DASHSCOPE_API_KEY}" }
            model: qwen-plus
```

三个配置上的高频失误：

1. **模型名映射不一致** → 上游返回 404 或「模型不存在」。网关会读请求里的 `model` 字段做映射，配置与请求必须对得上。
2. **API key 写进 YAML** → 应该引用 Secret / 环境变量。
3. **`hosts` 用了公网域名却没配鉴权** → 网关成了免费的模型代理，会被刷。

## 五、多模型路由与降级

降级链要按「能力」而不是「价格」设计：

| 场景 | 降级链 | 说明 |
| --- | --- | --- |
| 主链路问答 | Max → Plus → Flash | 逐级降能力，宁可答得糙也别不答 |
| 复杂推理 | Max → 备用厂商旗舰 | 拒绝降到 Flash（会答错，比慢更糟） |
| 分类/抽取 | Flash → 备用轻量 | 本来就用便宜档 |
| 离线批处理 | 批量接口 → 在线接口 | 时间不敏感，先走便宜通道 |

**关键规则：有副作用的调用不要自动降级重试**。比如「下单」这类工具调用，降级后模型可能生成不同的参数，重试会造成重复副作用。这类请求应该在网关层直接失败，交给业务侧幂等兜底（见 [工具运行时](#/internals/tool-runtime) 的幂等设计）。

## 六、语义缓存：最省钱，也最危险

原理：不比对字符串，而是比对 embedding 相似度，近似问题直接返回缓存答案。

省成本效果很直观——客服场景里「怎么退货」会被问上千遍。但风险同样直接：

| 风险 | 场景 | 防法 |
| --- | --- | --- |
| **跨用户串答案** | A 问「我的订单到哪了」，B 问到相似句，命中 A 的答案 | 缓存键必须含 `tenant_id + user_id + 权限范围` |
| **时效性错误** | 缓存了「库存充足」，实际已售罄 | 按时效敏感度分 TTL；写操作后主动失效 |
| **相似度阈值博弈** | 阈值松 → 串答案；阈值紧 → 命中率低 | 从 0.95 起，按误命中率逐步下调 |
| **流式响应缓存** | 流式分块不好缓存 | 只在非流式或聚合后缓存 |

> [!WARNING] 一条硬规则
> **凡是答案依赖「当前用户能看到什么数据」的请求，缓存键必须包含权限维度。** 只带 question 的语义缓存，本质上是一个绕过权限的数据泄露通道。

## 七、MCP 托管：工具的统一出口

Agent 项目里工具会快速增殖，每个工具背后是一个内部 REST API。传统做法是每个 Agent 各写一层 HTTP 调用，问题有三：鉴权各写一遍、限流没有、接口变更要改多处。

网关托管的做法：**内部 API 统一注册到网关，由网关转成 MCP 工具暴露**，Agent 侧只看到标准工具。

| 维度 | 各自封装 | 网关托管 |
| --- | --- | --- |
| 鉴权 | 每个 agent 一套 | 统一，且可透传用户身份 |
| 限流 | 无 | 按工具/租户 |
| 接口变更 | 改多处 | 网关改一处 |
| 审计 | 分散 | 集中，可追溯谁调了什么 |
| 工具发现 | 硬编码 | 与 Nacos MCP Registry 配合 |

这正好和 [Spring AI Alibaba 的 Nacos MCP Registry](#/alibaba/spring-ai-alibaba) 形成互补：**Nacos 管「有哪些工具」，Higress 管「怎么访问、谁可以访问」。**

## 八、什么时候别上

| 情况 | 建议 |
| --- | --- |
| 单服务、单模型、日调用几千 | 直连，别加一跳 |
| 团队没有 K8s 运维能力 | 用云厂商托管网关产品，别自建 |
| 只是想要「统一改 base_url」 | 一个配置中心就够 |
| 需要极低延迟（首 token < 200ms 硬约束） | 评估额外一跳的影响，必要时旁路 |

## 常见坑

> [!WARNING] 六个高频坑

1. **语义缓存不带用户维度**。这是能造成真实数据泄露的配置错误，且很难在测试中发现。
2. **只做网关限流，业务侧没有预算**。网关看到的是单次请求，Agent 一次任务可能几十次调用，总量仍会超支。
3. **模型名映射对不上**。表现为 404 或「模型不存在」，排查时容易误判为上游故障。
4. **把网关当 WAF 用**。它做 AI 相关的内容安全，不替代应用层鉴权与业务校验。
5. **流式响应直接套缓存**。分块输出与缓存语义冲突，容易出现「半截响应」。
6. **降级链里包含有副作用的调用**。降级后参数可能变化，重试造成重复副作用。

## 自测题

> [!QUESTION] AI 网关与普通 API 网关最本质的区别是什么？
> 它按 token 而非请求数计量与限流，并理解模型协议（多厂商格式转换、语义缓存、模型降级）；普通网关只关心请求转发与 QPS。

> [!QUESTION] 语义缓存的缓存键为什么必须包含租户与权限维度？
> 因为相似问题可能属于不同用户，若只按问题文本匹配，会把 A 用户可见的数据返回给 B 用户，形成绕过权限的数据泄露通道。

> [!QUESTION] 插件顺序上，为什么「鉴权与限流」要放在「缓存」之前？
> 先确认调用方有权限、有额度，再判断是否命中缓存；否则未授权请求也能探测缓存内容，且限流口径会被缓存命中绕过。

> [!QUESTION] 为什么有副作用的工具调用不应该自动降级重试？
> 降级后模型能力变化可能导致生成不同参数，重试会产生重复副作用（如重复下单）；这类请求应在网关直接失败，由业务侧基于幂等键兜底。
