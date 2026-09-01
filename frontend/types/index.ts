/** Mirrors backend/app/models/schemas.py - keep the two in sync. */

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
}

export interface TimeSeriesPoint {
  period: string;
  net_sales: number;
  gross_sales: number;
  net_qty: number;
  gross_profit: number;
}

export interface TimeAnalysis {
  date_min: string | null;
  date_max: string | null;
  date_span_days: number;
  daily: TimeSeriesPoint[];
  weekly: TimeSeriesPoint[];
  monthly: TimeSeriesPoint[];
  short_history_warning: string | null;
  strong_trend_reliable: boolean;
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

export interface GroupAnalysisRow {
  group: string;
  net_sales: number;
  share_of_sales_pct: number;
  net_qty: number;
  gross_profit: number;
  gross_margin_pct: number;
  return_rate_pct: number;
  avg_discount_pct: number;
  avg_promotion_pct: number;
}

export interface DiscountBandRow {
  band: string;
  net_sales: number;
  net_qty: number;
  gross_profit: number;
  gross_margin_pct: number;
  row_count: number;
}

export interface PromotionComparisonRow {
  group: "promoted" | "non_promoted";
  avg_net_sales: number;
  avg_units: number;
  avg_selling_price: number;
  avg_gross_profit: number;
  avg_gross_margin_pct: number;
  return_rate_pct: number;
  row_count: number;
}

export interface ReturnRiskRow {
  name: string;
  dimension: "product" | "brand" | "channel";
  return_rate_pct: number;
  returned_units: number;
  refund_amount: number;
  net_sales: number;
}

export interface InventoryRiskRow {
  product: string;
  stock_available: number;
  net_qty: number;
  risk: "low_stock_high_sales" | "high_stock_low_sales";
}

export interface StatisticalModelResult {
  model_status: "ok" | "insufficient_data";
  sample_size: number;
  model_type: string | null;
  mae: number | null;
  rmse: number | null;
  r2: number | null;
  coefficients: Record<string, unknown>[];
  permutation_importance: Record<string, unknown>[];
  notes: string[];
}

export interface FullAnalysisBundle {
  dataset_profile: DatasetProfile;
  data_quality: DataQualityReport;
  kpis: KpiSummary;
  time_analysis: TimeAnalysis;
  correlations: CorrelationResult[];
  driver_ranking: DriverEvidence[];
  brand_analysis: GroupAnalysisRow[];
  product_analysis: GroupAnalysisRow[];
  channel_analysis: GroupAnalysisRow[];
  channel_type_analysis: GroupAnalysisRow[];
  sales_type_analysis: GroupAnalysisRow[];
  discount_analysis: DiscountBandRow[];
  promotion_analysis: PromotionComparisonRow[];
  return_analysis: ReturnRiskRow[];
  inventory_analysis: InventoryRiskRow[];
  statistical_model: StatisticalModelResult;
  limitations: string[];
}

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

export interface AnalysisResponse {
  analysis_id: string;
  bundle: FullAnalysisBundle;
  ai_english: AIAnalysisResult;
  ai_mongolian: AIAnalysisResult | null;
  meta: AnalysisMeta;
}

export type AppStage = "landing" | "analyzing" | "results" | "error";
