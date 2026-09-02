/** API contracts mirror backend/app/models/schemas.py - keep the two in sync.
 *  Client-only types (SalesRow, Filters, ...) live at the bottom. */

// ---------------------------------------------------------------------------
// Upload / dataset profile
// ---------------------------------------------------------------------------

export interface DatasetProfile {
  rows: number;
  columns: number;
  date_min: string | null;
  date_max: string | null;
  date_span_days: number | null;
  brands: number;
  products: number;
  channels: number;
  column_mapping: Record<string, string>;
  unmapped_columns: string[];
  missing_required_fields: string[];
  missing_recommended_fields: string[];
}

export interface UploadResponse {
  upload_id: string;
  filename: string;
  file_size_bytes: number;
  profile: DatasetProfile;
  can_analyze: boolean;
  blocking_errors: string[];
}

export type IssueSeverity = "error" | "warning" | "info";

export interface DataQualityIssue {
  severity: IssueSeverity;
  field: string | null;
  message: string;
  affected_rows: number | null;
}

export interface AutoCorrection {
  field: string | null;
  action: string;
  affected_rows: number;
}

export interface DataQualityReport {
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  duplicate_rows: number;
  missing_value_count: number;
  date_min: string | null;
  date_max: string | null;
  warnings: string[];
  issues: DataQualityIssue[];
  auto_corrections: AutoCorrection[];
}

// ---------------------------------------------------------------------------
// Row-level dataset (columnar transport)
// ---------------------------------------------------------------------------

export interface DatasetDimensions {
  brands: string[];
  products: string[];
  channels: string[];
  channel_types: string[];
  sales_types: string[];
  brand_products: Record<string, string[]>;
  months: string[];
}

export type ColumnValue = string | number | null;

export interface DatasetResponse {
  upload_id: string;
  filename: string;
  profile: DatasetProfile;
  data_quality: DataQualityReport;
  row_count: number;
  excluded_rows: number;
  available_fields: string[];
  dimensions: DatasetDimensions;
  columns: Record<string, ColumnValue[]>;
}

// ---------------------------------------------------------------------------
// Filters (server vocabulary)
// ---------------------------------------------------------------------------

export interface FilterSpec {
  brands: string[];
  products: string[];
  channels: string[];
  channel_types: string[];
  sales_types: string[];
  date_from: string | null;
  date_to: string | null;
}

// ---------------------------------------------------------------------------
// KPIs / statistics
// ---------------------------------------------------------------------------

export interface KpiSummary {
  gross_sales: number;
  net_sales: number;
  units_sold: number;
  net_units: number;
  avg_selling_price: number;
  avg_net_selling_price: number;
  cogs: number;
  gross_profit: number;
  gross_margin_pct: number;
  total_discount: number;
  avg_discount_pct: number;
  discount_to_gross_sales_pct: number;
  total_promotion: number;
  avg_promotion_pct: number;
  promotion_to_gross_sales_pct: number;
  returned_units: number;
  return_rate_pct: number;
  refund_amount: number;
  avg_stock_available: number;
  low_stock_sku_count: number;
  stockout_observations: number;
  volume_units: number;
  sell_out_units: number;
  sell_in_units: number;
  pos_row_count: number;
  shipment_row_count: number;
}

export interface CorrelationResult {
  field: string;
  pearson: number | null;
  spearman: number | null;
  n: number;
}

export type ConfidenceLevel = "low" | "medium" | "high";

export interface DriverEvidence {
  driver: string;
  importance_score: number;
  direction: string;
  confidence: ConfidenceLevel;
  evidence: string[];
}

export interface StatisticalModelResult {
  model_status: "ok" | "insufficient_data";
  sample_size: number;
  target: string;
  model_type: string | null;
  mae: number | null;
  rmse: number | null;
  r2: number | null;
  coefficients: { feature: string; standardized_coefficient: number }[];
  permutation_importance: { feature: string; importance_mean: number; importance_std: number }[];
  notes: string[];
}

export interface DriverAnalysisResponse {
  filter_row_count: number;
  target: string;
  importance_basis: "model_permutation_importance" | "univariate_association" | string;
  correlations: CorrelationResult[];
  driver_ranking: DriverEvidence[];
  statistical_model: StatisticalModelResult;
  notes: string[];
}

// ---------------------------------------------------------------------------
// AI output
// ---------------------------------------------------------------------------

export interface TopDriverInsight {
  rank: number;
  driver: string;
  direction: string;
  business_impact: string;
  evidence: string;
  confidence: string;
}

export type RecommendationPriority = "High" | "Medium" | "Low";

export interface ManagementRecommendation {
  priority: RecommendationPriority;
  action: string;
  reason: string;
  expected_business_effect: string;
}

export interface AIAnalysisResult {
  executive_summary: string;
  performance_overview: string;
  top_drivers: TopDriverInsight[];
  channel_insights: string[];
  brand_product_insights: string[];
  pricing_discount_insights: string[];
  promotion_insights: string[];
  returns_inventory_risks: string[];
  opportunities: string[];
  management_recommendations: ManagementRecommendation[];
  data_limitations: string[];
}

export interface AnalysisMeta {
  mock_ai: boolean;
  anthropic_model: string;
  openai_model: string;
  translation_available: boolean;
  translation_error: string | null;
}

export interface InsightResponse {
  filter_row_count: number;
  scope: FilterSpec;
  scope_label: string;
  kpis: KpiSummary;
  ai_english: AIAnalysisResult;
  ai_mongolian: AIAnalysisResult | null;
  meta: AnalysisMeta;
  generated_at: string;
}

// ---------------------------------------------------------------------------
// Client-side model
// ---------------------------------------------------------------------------

/** One cleaned, derived sales record. Numbers are already canonical (backend
 *  derive_core_fields); the browser only sums and divides. */
export interface SalesRow {
  date: string; // YYYY-MM-DD
  month: string; // YYYY-MM
  ts: number; // epoch ms (UTC midnight)
  brand: string;
  product: string;
  channel: string;
  channelType: string;
  salesType: string; // "POS" | "SHIPMENT" | other label
  isShipment: boolean;
  qty: number;
  returnQty: number;
  netQty: number;
  shipmentQty: number | null;
  netShipmentQty: number | null;
  volume: number; // sales quantity: net shipment for SHIPMENT rows, net qty otherwise
  sellOut: number;
  sellIn: number;
  stock: number | null;
  price: number;
  cost: number;
  discountPct: number | null;
  promoPct: number | null;
  grossSales: number;
  discountAmt: number;
  promoAmt: number;
  refundAmt: number;
  netSales: number;
  cogs: number;
  grossProfit: number;
}

export interface Filters {
  brands: string[];
  products: string[];
  channels: string[];
  channelTypes: string[];
  salesTypes: string[];
  dateFrom: string | null;
  dateTo: string | null;
}

export type DimensionKey = "brands" | "products" | "channels" | "channelTypes" | "salesTypes";

export type Locale = "mn" | "en";

export type ComparisonBasis = "ly" | "prior";

// ---------------------------------------------------------------------------
// Authentication (mirrors backend/app/models/schemas.py auth section)
// ---------------------------------------------------------------------------

export type Role = "admin" | "user";

export interface AuthUser {
  username: string;
  role: Role;
}

export interface UserPublic extends AuthUser {
  created_at: string;
}

export interface LoginResponse {
  token: string;
  expires_at: string;
  user: UserPublic;
}

// ---------------------------------------------------------------------------
// Forecasting (mirrors backend/app/models/schemas.py forecast section)
// ---------------------------------------------------------------------------

export type ForecastTarget = "net_sales" | "volume_units" | "gross_profit";

export interface ForecastRequest {
  target: ForecastTarget;
  /** last month to forecast, inclusive (YYYY-MM) */
  forecast_until: string;
  filters: FilterSpec;
  include_partial_month?: boolean;
}

export interface HistoryPoint {
  month: string;
  actual: number;
  fitted: number | null;
}

export interface ForecastPoint {
  month: string;
  point: number;
  lower: number;
  upper: number;
}

export interface ForecastBacktestRow {
  model: string;
  label: string;
  description: string;
  available: boolean;
  reason: string | null;
  folds: number;
  wape: number | null;
  mape: number | null;
  mae: number | null;
  rmse: number | null;
  bias: number | null;
  selected: boolean;
}

export interface ForecastSummary {
  forecast_total: number;
  forecast_monthly_avg: number;
  last_12_months_total: number;
  same_period_last_year_total: number | null;
  same_period_last_year_months: number;
  yoy_change_pct: number | null;
  accuracy_wape: number | null;
  accuracy_mape: number | null;
}

export interface ForecastResponse {
  target: ForecastTarget;
  scope_label: string;
  filter_row_count: number;
  history_month_min: string;
  history_month_max: string;
  training_months: number;
  partial_last_month_excluded: boolean;
  horizon_months: number;
  forecast_until: string;
  selected_model: string;
  selected_label: string;
  selection_reason: string;
  implementation: string | null;
  backtest_window_months: number;
  history: HistoryPoint[];
  forecast: ForecastPoint[];
  backtest: ForecastBacktestRow[];
  summary: ForecastSummary;
  notes: string[];
}

/** Which product module the signed-in user is working in. */
export type AppModule = "drivers" | "forecast";
