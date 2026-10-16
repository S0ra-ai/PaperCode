# 实验执行与复现证据

PaperCode 区分导入观察、本机进程执行和容器执行。`ExperimentEvidenceManifest.v1` 的数值保留为导入观察，不能凭角色数值生成多个实验，也不能证明隔离复现。旧版本已经通过的运行在再次正式导出时会重新核验执行证据。

## 显式实验协议

将协议保存到工作区 `experiments/protocol.json`。它优先于 package scripts，并在手动复跑时重新读取。同数量修改命令、指标、环境或绑定也会生效。实验 ID、名称和评价指标应对应实际算法与数据。

```json
{
  "schema_version": "ExperimentProtocol.v1",
  "discovered_from": "manifest",
  "metric_direction": "higher_better",
  "entries": [
    {
      "protocol_id": "method-main",
      "role": "proposed",
      "label": "实际方法",
      "expected_metric": "accuracy",
      "command": { "argv": ["bun", "run", "experiments/evaluate.ts", "method-main"] }
    },
    {
      "protocol_id": "control-main",
      "role": "baseline",
      "label": "实际对照方法",
      "expected_metric": "accuracy",
      "command": { "argv": ["bun", "run", "experiments/evaluate.ts", "control-main"] }
    },
    {
      "protocol_id": "isolated-evaluation",
      "role": "container_reproduction",
      "expected_metric": "accuracy",
      "command": {
        "argv": ["docker", "run", "--rm", "your-evaluation-image", "bun", "run", "experiments/evaluate.ts", "{experiment_id}"],
        "timeout_seconds": 600
      }
    }
  ]
}
```

此示例只声明接口，需要用户提供真实评价脚本、数据和已构建镜像；不会自动实现算法或下载镜像。容器入口可使用 `target_experiment_id` 精确绑定一个实验；共享入口必须带 `{experiment_id}`。只接受结构化 `docker run` / `podman run`，不把名为 `repro:container` 的本机脚本当作隔离证明。

`command.cwd` 相对于工作区解析，`command.env` 应用于实际进程。deep、submission 和 custom 默认启用容器执行；quick 和 standard 跳过容器，只生成探索性结果，不能支持最终科研结论。

## 指标输出

脚本须输出实际测得的指标，例如：

```text
PAPERCODE_METRICS {"experiment_id":"method-main","metrics":[{"name":"accuracy","value":0.37,"direction":"higher_better"}]}
```

也支持完整 JSON、逐行 JSON 和 `accuracy=0.37`。零值、负值和科学计数法保留。需要越低越好的指标时，在协议及 JSON 指标中声明 `lower_better`。

缺失科研指标将阻断结论，退出码不能替代 accuracy、loss 或测试通过率。仅 typecheck_pass、lint_pass 等明确表示进程检查状态的指标允许由退出码得到。

## 验收条件

所有声明实验必须具有唯一、完整的本机和容器记录，成功退出、有限且方向正确的主指标。容器执行由本次独立 cidfile 和 runtime inspect 核验容器身份、退出码、镜像内容 ID 与隔离属性；导入字段和模式标签不能替代此过程。两边主指标必须在计划 `reproduction_tolerance` 内一致，默认绝对与相对容差均为 1e-6。

任何缺项、重复实验、错误计划、失败、无执行证据、缺失指标或超出容差均阻断正式科研结论；forced draft 保留观察和限制。

本轮自动测试模拟 runtime 响应验证执行器和拒绝路径，未运行真实 Docker。真实镜像的端到端复现仍须另行验证。
