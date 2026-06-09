import type { Bi, Lang } from '@/types';

/* ============================================================
   Global bilingual dictionary (EN / 中文)
   ============================================================ */
export const DICT = {
  'brand.name': { en: 'Atlas', zh: 'Atlas' },
  'brand.sub': { en: 'Estate Intelligence', zh: '智能体房产平台' },
  'search.placeholder': { en: 'Search agents, docs, tools…', zh: '搜索智能体、文档、工具…' },
  'user.name': { en: 'Siyuan Chen', zh: '陈思远' },
  'user.role': { en: 'Enterprise Admin', zh: '企业管理员' },
  'topbar.upgrade': { en: 'Upgrade', zh: '升级' },

  'nav.workspace': { en: 'Workspace', zh: '工作台' },
  'nav.intelligence': { en: 'Intelligence', zh: '智能中枢' },
  'nav.operations': { en: 'Operations', zh: '运营管理' },
  'nav.dashboard': { en: 'Dashboard', zh: '仪表盘' },
  'nav.chat': { en: 'AI Chat', zh: '智能对话' },
  'nav.workflow': { en: 'Workflow Builder', zh: '工作流编排' },
  'nav.knowledge': { en: 'Knowledge Base', zh: '知识库' },
  'nav.tools': { en: 'MCP Tools', zh: 'MCP 工具' },
  'nav.intel': { en: 'Estate Intelligence', zh: '楼市情报' },
  'nav.analytics': { en: 'Data Visualization', zh: '数据大屏' },
  'nav.search': { en: 'Property Search', zh: '房源搜索' },
  'nav.analysis': { en: 'Market Analysis', zh: '市场分析' },
  'nav.investment': { en: 'Investment', zh: '投资分析' },
  'nav.mortgage': { en: 'Mortgage', zh: '房贷分析' },
  'nav.report': { en: 'AI Report', zh: 'AI 报告' },
  'nav.permissions': { en: 'Permissions', zh: '权限中心' },
  'nav.monitoring': { en: 'Monitoring', zh: '监控中心' },
  'nav.capabilities': { en: 'Capability Center', zh: '能力中心' },
  'nav.settings': { en: 'Settings', zh: '设置' },

  'common.run': { en: 'Run', zh: '运行' },
  'common.runs': { en: 'runs', zh: '次调用' },
  'common.filter': { en: 'Filter', zh: '筛选' },
  'common.live': { en: 'LIVE', zh: '实时' },
  'common.viewDetails': { en: 'View details', zh: '查看详情' },
  'common.loading': { en: 'Loading…', zh: '加载中…' },

  'nav.vision': { en: 'Image Understanding', zh: '图像理解' },

  'vision.title': { en: 'Image Understanding', zh: '图像理解' },
  'vision.upload': { en: 'Upload Image', zh: '上传图片' },
  'vision.drag': { en: 'Drag & drop or click to upload', zh: '拖拽或点击上传图片' },
  'vision.formats': { en: 'Supports JPG, PNG, WebP · Max 10 MB', zh: '支持 JPG、PNG、WebP · 最大 10 MB' },
  'vision.analyze': { en: 'Analyze Image', zh: 'AI 分析' },
  'vision.reanalyze': { en: 'Re-analyze', zh: '重新分析' },
  'vision.history': { en: 'Analysis History', zh: '历史记录' },
  'vision.export': { en: 'Export JSON', zh: '导出 JSON' },
  'vision.copy': { en: 'Copy Result', zh: '复制结果' },
  'vision.summary': { en: 'Overview', zh: '总览' },
  'vision.objects': { en: 'Objects', zh: '识别物体' },
  'vision.texts': { en: 'OCR Text', zh: 'OCR 文字' },
  'vision.scene': { en: 'Scene', zh: '场景' },
  'vision.style': { en: 'Style', zh: '风格' },
  'vision.tags': { en: 'Tags', zh: '标签' },
  'vision.analyzing': { en: 'AI is analyzing…', zh: 'AI 分析中…' },
  'vision.uploading': { en: 'Uploading…', zh: '上传中…' },
  'vision.noHistory': { en: 'No analysis history yet', zh: '暂无历史记录' },
  'vision.latency': { en: 'Latency', zh: '耗时' },
  'vision.tokens': { en: 'Tokens', zh: 'Tokens' },

  'nav.rag': { en: 'RAG Knowledge Base', zh: 'RAG 知识库' },

  'rag.title': { en: 'Knowledge Base Q&A', zh: '知识库问答' },
  'rag.upload': { en: 'Upload Document', zh: '上传文档' },
  'rag.uploading': { en: 'Uploading…', zh: '上传中…' },
  'rag.processing': { en: 'Processing…', zh: '解析中…' },
  'rag.ready': { en: 'Ready', zh: '就绪' },
  'rag.error': { en: 'Error', zh: '错误' },
  'rag.noDoc': { en: 'No documents yet', zh: '暂无文档' },
  'rag.noDrop': { en: 'Drag & drop files here or click to upload', zh: '拖拽文件或点击上传' },
  'rag.formats': { en: 'PDF · Word · Excel · PPT · Markdown · Code', zh: 'PDF · Word · Excel · PPT · Markdown · 代码' },
  'rag.ask': { en: 'Ask a question about your documents…', zh: '基于知识库提问…' },
  'rag.send': { en: 'Send', zh: '发送' },
  'rag.sources': { en: 'Sources', zh: '参考来源' },
  'rag.noKb': { en: 'Please upload documents first', zh: '请先上传文档' },
  'rag.thinking': { en: 'Thinking…', zh: '思考中…' },
  'rag.agents': { en: 'Agent Activity', zh: 'Agent 活动' },
  'rag.chunks': { en: 'chunks', zh: '段' },
  'rag.delete': { en: 'Delete', zh: '删除' },
  'rag.similarity': { en: 'Similarity', zh: '相关度' },

  'nav.files': { en: 'File Center', zh: '文件中心' },
} satisfies Record<string, Bi>;

export type DictKey = keyof typeof DICT;

/** Resolve a dictionary key into the active language. */
export function tk(key: DictKey, lang: Lang): string {
  const entry = DICT[key];
  return entry ? entry[lang] || entry.en : key;
}

/** Resolve an arbitrary bilingual pair. */
export function tb(pair: Bi, lang: Lang): string {
  return lang === 'zh' ? pair.zh : pair.en;
}
