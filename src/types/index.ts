/* ============================================================
   Atlas — Core domain & UI type definitions
   ============================================================ */

export type Lang = 'en' | 'zh';
export type Theme = 'dark' | 'light';

/** A bilingual string pair used across the platform. */
export interface Bi {
  en: string;
  zh: string;
}

/* ---------- Agents ---------- */

export type AgentId =
  | 'search'
  | 'market'
  | 'investment'
  | 'mortgage'
  | 'coordinator'
  | 'school'
  | 'legal'
  | 'transport'
  | 'policy'
  | 'knowledge'
  | 'web'
  | 'planner';

/** Lifecycle states for an agent within a workflow run. */
export type AgentStatus = 'idle' | 'thinking' | 'running' | 'completed' | 'error';

export interface AgentDef {
  id: AgentId;
  icon: string;
  name: Bi;
  /** monospace technical tag, e.g. "search.estate" */
  tag: string;
  desc: Bi;
  /** lifetime invocation count */
  usage: number;
  /** health dot colour */
  health: string;
  /** primary accent colour for the agent */
  color: string;
}

/** Result emitted by an agent during a run. */
export interface AgentRunResult {
  id: AgentId;
  status: AgentStatus;
  /** wall-clock latency in seconds */
  latency: number;
  /** tokens consumed by the step */
  tokens: number;
  summary: Bi;
}

/* ---------- Properties ---------- */

export type PropertyTag = 'school' | 'metro' | 'hot' | 'new' | 'investment';

export interface Property {
  id: string;
  title: Bi;
  district: Bi;
  /** gross floor area in square metres */
  area: number;
  /** total price in CNY */
  totalPrice: number;
  /** unit price in CNY per square metre */
  unitPrice: number;
  bedrooms: number;
  bathrooms: number;
  /** placeholder image hue used for the striped SVG cover */
  cover: string;
  tags: PropertyTag[];
  /** investment ROI score 0-100 */
  roiScore: number;
  /** risk score 0-100 (higher = riskier) */
  riskScore: number;
  favorite: boolean;
}

/* ---------- Market analysis ---------- */

export interface PricePoint {
  month: string;
  haidian: number;
  chaoyang: number;
  fengtai: number;
}

export interface DistrictHeat {
  district: Bi;
  demand: number;
  supply: number;
  /** year-over-year price growth, percentage */
  growth: number;
}

/* ---------- Investment analysis ---------- */

export interface RoiPoint {
  year: string;
  rentalYield: number;
  appreciation: number;
  cumulative: number;
}

export interface RiskDimension {
  dimension: Bi;
  value: number;
}

/* ---------- Mortgage analysis ---------- */

export interface MortgagePlan {
  bank: Bi;
  rate: number;
  /** down-payment ratio, e.g. 0.3 */
  downRatio: number;
  /** monthly payment in CNY */
  monthly: number;
  recommended: boolean;
}

export interface MortgageBreakdown {
  /** total property price */
  price: number;
  downPayment: number;
  loanAmount: number;
  /** annual rate (LPR-based) */
  rate: number;
  /** term in years */
  termYears: number;
  monthlyPayment: number;
  totalInterest: number;
}

/* ---------- Coordinator report ---------- */

export type Recommendation = 'strong-buy' | 'buy' | 'hold' | 'caution' | 'avoid';

export interface FinalReport {
  /** overall composite score 0-100 */
  overallScore: number;
  recommendation: Recommendation;
  investmentAdvice: Bi;
  risks: Bi[];
  mortgageAdvice: Bi;
  /** per-agent sub-scores feeding the composite */
  subScores: { label: Bi; value: number; color: string }[];
}

/* ---------- Dashboard metrics ---------- */

export interface Metric {
  icon: string;
  label: Bi;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  delta: string;
  up: boolean;
  color: string;
  seed: number;
}

/* ---------- Workflow graph ---------- */

export type WfNodeType =
  | 'input'
  | 'agent'
  | 'llm'
  | 'rag'
  | 'mcp'
  | 'condition'
  | 'api'
  | 'memory'
  | 'knowledge'
  | 'output';

export interface WfNode {
  id: string;
  type: WfNodeType;
  x: number;
  y: number;
  label: Bi;
  desc: Bi;
  meta: string[];
  status?: AgentStatus;
}

export type WfEdge = [string, string];

/* ============================================================
   Capability types — chunked upload, auth, media generation
   ============================================================ */

/* ---------- Chunked upload ---------- */

export type ChunkStatus = 'pending' | 'uploading' | 'done' | 'error';

export interface UploadChunk {
  index: number;
  /** byte offset start */
  start: number;
  /** byte offset end (exclusive) */
  end: number;
  size: number;
  status: ChunkStatus;
  /** 0-100 */
  progress: number;
  retries: number;
}

export type UploadPhase =
  | 'idle'
  | 'hashing'
  | 'checking'
  | 'uploading'
  | 'paused'
  | 'merging'
  | 'done'
  | 'instant'
  | 'error';

export interface UploadTask {
  id: string;
  fileName: string;
  fileSize: number;
  /** content hash (md5-like) computed in a worker */
  hash: string;
  chunkSize: number;
  chunks: UploadChunk[];
  phase: UploadPhase;
  /** overall 0-100 */
  progress: number;
  /** instant-upload (server already had this hash) */
  instant: boolean;
  error?: string;
}

/* ---------- Auth (dual-token + SSO) ---------- */

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** epoch ms when the access token expires */
  expiresAt: number;
}

export interface AuthUser {
  id: string;
  name: string;
  phone: string;
  role: string;
  avatar: string;
}

export type SsoProvider = 'google' | 'feishu' | 'wecom' | 'microsoft';

/* ---------- Media generation (text→image, text→video) ---------- */

export type MediaKind = 'image' | 'video';
export type MediaStatus = 'queued' | 'generating' | 'done' | 'error';

export interface MediaJob {
  id: string;
  kind: MediaKind;
  prompt: string;
  status: MediaStatus;
  /** 0-100 */
  progress: number;
  /** hue used for the striped result placeholder when no real URL is available */
  hue: number;
  createdAt: number;
  /** URL of the generated image (DALL-E 3) or video; absent in mock/error cases */
  url?: string;
}

/* ---------- Voice / realtime ---------- */

export type RecorderStatus = 'idle' | 'recording' | 'transcribing' | 'done' | 'error';

/* ---------- AI Chat ---------- */

export type AiProvider = 'openai' | 'claude' | 'deepseek' | 'gemini';

export interface AiModelDef {
  id: string;
  name: string;
  provider: AiProvider;
  /** Supports chain-of-thought / reasoning tokens (o1, DeepSeek-R1, etc.) */
  supportsThinking?: boolean;
}

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatAgentTrace {
  id: string;
  icon: string;
  label: string;
  latency?: string;
  done: boolean;
}

export interface ChatSource {
  key: string;
  label: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  /** Chain-of-thought reasoning tokens (shown collapsed by default). */
  thinking?: string;
  timestamp: number;
  model?: string;
  provider?: AiProvider;
  /** True while the response is still streaming. */
  streaming?: boolean;
  trace?: ChatAgentTrace[];
  sources?: ChatSource[];
  error?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  /** Full message history (persisted). */
  messages: ChatMessage[];
  model: string;
  provider: AiProvider;
}
