const _CATEGORY_MAP = {
  quota_exceeded: {
    kind: 'quota',
    badge: '额度不足',
    title: '生成额度已用尽',
    summary: '当前 LLM 额度已耗尽，无法继续生成。',
    actions: [
      '稍后重试——额度通常会在数小时内恢复。',
      '联系管理员确认 OpenRouter 账户余额。',
      '尝试降低任务字数要求以减少 token 消耗。',
    ],
  },
  content_safety_blocked: {
    kind: 'safety',
    badge: '内容安全',
    title: '内容未通过安全校验',
    summary: '输入或生成内容触发了模型的安全过滤机制。',
    actions: [
      '调整主题描述，避免可能触发安全过滤的措辞。',
      '简化需求后重新提交。',
      '如果认为是误判，换一种表达方式描述相同内容。',
    ],
  },
  rag_index_error: {
    kind: 'rag',
    badge: '索引失败',
    title: '文件索引构建失败',
    summary: '上传的附件在解析或向量索引阶段出错。',
    actions: [
      '确认附件格式为 PDF/DOCX/TXT/MD 且未损坏。',
      '去掉附件后重试，确认纯文本生成是否正常。',
      '如文件较大，尝试拆分后再上传。',
    ],
  },
  engine_unavailable: {
    kind: 'engine',
    badge: '引擎不可用',
    title: '生成引擎暂时不可用',
    summary: 'LLM 服务连接超时或暂时不可用。',
    actions: [
      '等待 1-2 分钟后重试。',
      '检查网络连接是否正常。',
      '如持续失败，确认后端环境变量 OPENROUTER_API_KEY 是否有效。',
    ],
  },
  LLM_CONFIG_ERROR: {
    kind: 'config',
    badge: '配置缺失',
    title: '模型服务未配置',
    summary: '后端 LLM API 密钥未配置，无法调用模型服务。',
    actions: [
      '联系管理员在后台配置 LLM Provider 或设置 OPENROUTER_API_KEY。',
      '确认 .env 文件中已填写有效的 API 密钥后重启服务。',
    ],
  },
  LLM_GENERATION_ERROR: {
    kind: 'engine',
    badge: '生成失败',
    title: '模型服务暂时不可用',
    summary: 'LLM 调用失败，可能是网络超时或模型服务端错误。',
    actions: [
      '等待 1-2 分钟后重试。',
      '如持续失败，检查后端日志确认模型服务状态。',
    ],
  },
  LLM_RATE_LIMIT: {
    kind: 'engine',
    badge: '请求频繁',
    title: '请求过于频繁',
    summary: '模型服务触发了频率限制，请稍后再试。',
    actions: [
      '等待 1 分钟后重试。',
      '减少并发请求数量。',
    ],
  },
  cancelled: {
    kind: 'cancelled',
    badge: '已取消',
    title: '任务已取消',
    summary: '该任务已被手动取消。',
    actions: [
      '如需继续，可重新提交任务。',
    ],
  },
};

function matches(message, patterns) {
  return patterns.some((pattern) => pattern.test(message));
}

function buildFailure(kind, badge, title, summary, actions, rawMessage) {
  return {
    kind,
    badge,
    title,
    summary,
    actions,
    rawMessage
  };
}

export function explainTaskFailure(task, code = 500) {
  const status = String(task?.status || '').trim().toLowerCase();
  const rawMessage = String(task?.errorMessage || '').trim();
  const category = task?.errorCategory || null;

  if (status === 'cancelled') {
    const c = _CATEGORY_MAP.cancelled;
    return buildFailure(c.kind, c.badge, c.title, c.summary, c.actions, rawMessage || '用户取消');
  }

  // No failure to report for non-failed tasks without error messages,
  // or for completed tasks (errorMessage may be informational metadata)
  if (status === 'completed') {
    return null;
  }
  if (!rawMessage && status !== 'failed' && code !== 500) {
    return null;
  }

  // Use backend error category when available
  if (category && _CATEGORY_MAP[category]) {
    const c = _CATEGORY_MAP[category];
    return buildFailure(c.kind, c.badge, c.title, c.summary, c.actions, rawMessage);
  }

  const message = rawMessage || '任务执行失败，请稍后重试。';

  if (matches(message, [/模型服务未配置/i, /LLM_CONFIG_ERROR/i, /API.*密钥/i, /MODEL_SERVICE_APP_ID/i, /MODEL_SERVICE_SECRET/i])) {
    return buildFailure(
      'config',
      '配置问题',
      '模型服务配置未完成',
      '当前后端没有拿到完整的模型服务鉴权配置，所以任务在创建后会直接失败。',
      [
        '检查后端环境变量 MODEL_SERVICE_BASE_URL、MODEL_SERVICE_APP_ID、MODEL_SERVICE_SECRET。',
        '确认修改后重启后端，再提交一个纯文本任务验证。'
      ],
      message
    );
  }

  if (
    matches(message, [
      /FILE_BASE_URL/i,
      /文件URL/i,
      /文件地址/i,
      /本机可访问/i,
      /127\.0\.0\.1/i,
      /localhost/i,
      /远程模型服务无法读取/i,
      /远程模型服务访问/i
    ])
  ) {
    return buildFailure(
      'file-access',
      '文件访问问题',
      '附件或模板地址无法被模型服务访问',
      '当前模型服务在远端运行时，读取不到 127.0.0.1 或 localhost 这类仅本机可访问的文件地址。',
      [
        '把 FILE_BASE_URL 改成模型服务可以访问到的公网地址。',
        '如果只是验证链路，先不要上传附件或模板，直接提交纯文本任务。'
      ],
      message
    );
  }

  if (matches(message, [/外部任务已创建，但本地同步失败/i])) {
    return buildFailure(
      'sync',
      '同步问题',
      '远程任务已创建，但本地同步失败',
      '模型服务侧可能已经收到任务，但后端本地没有把任务记录同步完整。',
      [
        '先刷新当前任务列表，确认是否已经出现新的任务记录。',
        '如果仍然失败，再重新提交一次任务并查看后端日志。'
      ],
      message
    );
  }

  if (
    matches(message, [
      /模型服务暂时不可用/i,
      /调用模型服务/i,
      /查询任务状态失败/i,
      /connection/i,
      /refused/i,
      /timeout/i,
      /timed out/i
    ])
  ) {
    return buildFailure(
      'service',
      '服务问题',
      '模型服务暂时不可用',
      '模型服务地址不通、鉴权失败或查询超时，都会导致这类失败。',
      [
        '检查 MODEL_SERVICE_BASE_URL 是否指向当前可用地址。',
        '确认模型服务凭证有效，或稍后再重试一次。'
      ],
      message
    );
  }

  if (
    matches(message, [
      /模板文件/i,
      /用户文件/i,
      /会话不存在/i,
      /文件不存在/i,
      /仅支持/i,
      /不支持/i
    ])
  ) {
    return buildFailure(
      'business',
      '业务问题',
      '任务输入或引用资料不符合要求',
      '当前任务引用的模板、附件或会话数据没有通过后端校验，所以任务被拒绝执行。',
      [
        '检查模板文件是否存在，并确认类型为 docx 或 pdf。',
        '确认所选附件属于当前账号，且当前会话仍然有效。'
      ],
      message
    );
  }

  return buildFailure(
    'unknown',
    '执行失败',
    '任务执行失败',
    '当前任务没有完成，建议先查看原始错误，再结合后端日志继续排查。',
    [
      '先重试一个纯文本任务，确认是否为偶发问题。',
      '如果持续失败，请记录 taskId 并查看后端日志。'
    ],
    message
  );
}
