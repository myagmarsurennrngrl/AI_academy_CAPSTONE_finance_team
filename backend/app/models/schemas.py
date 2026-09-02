"""Pydantic schemas shared across the API layer.

These mirror the TypeScript interfaces in frontend/types/index.ts - keep the
two in sync when changing a field here.
"""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Upload / dataset profile
# ---------------------------------------------------------------------------

class DatasetProfile(BaseModel):
    rows: int
    columns: int
    date_min: Optional[str] = None
    date_max: Optional[str] = None
    date_span_days: Optional[int] = None
    brands: int
    products: int
    channels: int
    column_mapping: Dict[str, str]
    unmapped_columns: List[str] = Field(default_factory=list)
    missing_required_fields: List[str] = Field(default_factory=list)
    missing_recommended_fields: List[str] = Field(default_factory=list)


class UploadResponse(BaseModel):
    upload_id: str
    filename: str
    file_size_bytes: int
    profile: DatasetProfile
    can_analyze: bool
    blocking_errors: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Data quality
# ---------------------------------------------------------------------------

class DataQualityIssue(BaseModel):
    severity: Literal["error", "warning", "info"]
    field: Optional[str] = None
    message: str
    affected_rows: Optional[int] = None


class AutoCorrection(BaseModel):
    field: Optional[str] = None
    action: str
    affected_rows: int


class DataQualityReport(BaseModel):
    total_rows: int
    valid_rows: int
    invalid_rows: int
    duplicate_rows: int
    missing_value_count: int
    date_min: Optional[str] = None
    date_max: Optional[str] = None
    warnings: List[str] = Field(default_factory=list)
    issues: List[DataQualityIssue] = Field(default_factory=list)
    auto_corrections: List[AutoCorrection] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# KPIs
# ---------------------------------------------------------------------------

class KpiSummary(BaseModel):
    gross_sales: float
    net_sales: float
    units_sold: float
    net_units: float
    avg_selling_price: float
    avg_net_selling_price: float
    cogs: float
    gross_profit: float
    gross_margin_pct: float
    total_discount: float
    avg_discount_pct: float
    discount_to_gross_sales_pct: float
    total_promotion: float
    avg_promotion_pct: float
    promotion_to_gross_sales_pct: float
    returned_units: float
    return_rate_pct: float
    refund_amount: float
    avg_stock_available: float
    low_stock_sku_count: int
    stockout_observations: int
    # Volume split - sell-out (POS) and sell-in (SHIPMENT) are different
    # business concepts and are never silently summed.
    volume_units: float = 0.0
    sell_out_units: float = 0.0
    sell_in_units: float = 0.0
    pos_row_count: int = 0
    shipment_row_count: int = 0


# ---------------------------------------------------------------------------
# Time analysis
# ---------------------------------------------------------------------------

class TimeSeriesPoint(BaseModel):
    period: str
    net_sales: float
    gross_sales: float
    net_qty: float
    gross_profit: float


class TimeAnalysis(BaseModel):
    date_min: Optional[str] = None
    date_max: Optional[str] = None
    date_span_days: int
    daily: List[TimeSeriesPoint] = Field(default_factory=list)
    weekly: List[TimeSeriesPoint] = Field(default_factory=list)
    monthly: List[TimeSeriesPoint] = Field(default_factory=list)
    short_history_warning: Optional[str] = None
    strong_trend_reliable: bool = False


# ---------------------------------------------------------------------------
# Drivers
# ---------------------------------------------------------------------------

class CorrelationResult(BaseModel):
    field: str
    pearson: Optional[float] = None
    spearman: Optional[float] = None
    n: int


class DriverEvidence(BaseModel):
    driver: str
    importance_score: float
    direction: str
    confidence: Literal["low", "medium", "high"]
    evidence: List[str]


class GroupAnalysisRow(BaseModel):
    group: str
    net_sales: float
    share_of_sales_pct: float
    net_qty: float
    gross_profit: float
    gross_margin_pct: float
    return_rate_pct: float
    avg_discount_pct: float
    avg_promotion_pct: float
    volume_units: float = 0.0


class DiscountBandRow(BaseModel):
    band: str
    net_sales: float
    net_qty: float
    gross_profit: float
    gross_margin_pct: float
    row_count: int


class PromotionComparisonRow(BaseModel):
    group: Literal["promoted", "non_promoted"]
    avg_net_sales: float
    avg_units: float
    avg_selling_price: float
    avg_gross_profit: float
    avg_gross_margin_pct: float
    return_rate_pct: float
    row_count: int


class ReturnRiskRow(BaseModel):
    name: str
    dimension: Literal["product", "brand", "channel"]
    return_rate_pct: float
    returned_units: float
    refund_amount: float
    net_sales: float


class InventoryRiskRow(BaseModel):
    product: str
    stock_available: float
    net_qty: float
    risk: Literal["low_stock_high_sales", "high_stock_low_sales"]


class StatisticalModelResult(BaseModel):
    model_status: Literal["ok", "insufficient_data"]
    sample_size: int
    target: str = "volume_units"
    model_type: Optional[str] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    r2: Optional[float] = None
    coefficients: List[Dict[str, Any]] = Field(default_factory=list)
    permutation_importance: List[Dict[str, Any]] = Field(default_factory=list)
    notes: List[str] = Field(default_factory=list)


class FullAnalysisBundle(BaseModel):
    """The complete deterministic analytical result computed by Python.
    A trimmed/compact version of this is what gets sent to Claude."""
    dataset_profile: DatasetProfile
    data_quality: DataQualityReport
    kpis: KpiSummary
    time_analysis: TimeAnalysis
    correlations: List[CorrelationResult]
    driver_ranking: List[DriverEvidence]
    brand_analysis: List[GroupAnalysisRow]
    product_analysis: List[GroupAnalysisRow]
    channel_analysis: List[GroupAnalysisRow]
    channel_type_analysis: List[GroupAnalysisRow]
    sales_type_analysis: List[GroupAnalysisRow]
    discount_analysis: List[DiscountBandRow]
    promotion_analysis: List[PromotionComparisonRow]
    return_analysis: List[ReturnRiskRow]
    inventory_analysis: List[InventoryRiskRow]
    statistical_model: StatisticalModelResult
    limitations: List[str]


# ---------------------------------------------------------------------------
# Claude / AI output
# ---------------------------------------------------------------------------

class TopDriverInsight(BaseModel):
    rank: int
    driver: str
    direction: str
    business_impact: str
    evidence: str
    confidence: str


class ManagementRecommendation(BaseModel):
    priority: Literal["High", "Medium", "Low"]
    action: str
    reason: str
    expected_business_effect: str


class AIAnalysisResult(BaseModel):
    executive_summary: str
    performance_overview: str
    top_drivers: List[TopDriverInsight] = Field(default_factory=list)
    channel_insights: List[str] = Field(default_factory=list)
    brand_product_insights: List[str] = Field(default_factory=list)
    pricing_discount_insights: List[str] = Field(default_factory=list)
    promotion_insights: List[str] = Field(default_factory=list)
    returns_inventory_risks: List[str] = Field(default_factory=list)
    opportunities: List[str] = Field(default_factory=list)
    management_recommendations: List[ManagementRecommendation] = Field(default_factory=list)
    data_limitations: List[str] = Field(default_factory=list)


class AnalysisMeta(BaseModel):
    mock_ai: bool
    anthropic_model: str
    openai_model: str
    translation_available: bool
    translation_error: Optional[str] = None


class AnalysisResponse(BaseModel):
    analysis_id: str
    bundle: FullAnalysisBundle
    ai_english: AIAnalysisResult
    ai_mongolian: Optional[AIAnalysisResult] = None
    meta: AnalysisMeta


# ---------------------------------------------------------------------------
# Filtering - the single filter vocabulary shared by the dashboard (client-side
# aggregation), the driver-model endpoint and the AI-insight endpoint.
# ---------------------------------------------------------------------------

class FilterSpec(BaseModel):
    """Empty list = no restriction on that dimension. Dates are inclusive
    ISO calendar days (YYYY-MM-DD)."""
    brands: List[str] = Field(default_factory=list)
    products: List[str] = Field(default_factory=list)
    channels: List[str] = Field(default_factory=list)
    channel_types: List[str] = Field(default_factory=list)
    sales_types: List[str] = Field(default_factory=list)
    date_from: Optional[str] = None
    date_to: Optional[str] = None

    def is_empty(self) -> bool:
        return not (
            self.brands
            or self.products
            or self.channels
            or self.channel_types
            or self.sales_types
            or self.date_from
            or self.date_to
        )


class DatasetDimensions(BaseModel):
    brands: List[str] = Field(default_factory=list)
    products: List[str] = Field(default_factory=list)
    channels: List[str] = Field(default_factory=list)
    channel_types: List[str] = Field(default_factory=list)
    sales_types: List[str] = Field(default_factory=list)
    brand_products: Dict[str, List[str]] = Field(default_factory=dict)
    months: List[str] = Field(default_factory=list)


class DatasetResponse(BaseModel):
    """The cleaned, derived row-level dataset in columnar form. The dashboard
    filters and aggregates this in the browser so every KPI, chart and table
    is guaranteed to read from one identical filtered slice."""
    upload_id: str
    filename: str
    profile: DatasetProfile
    data_quality: DataQualityReport
    row_count: int
    excluded_rows: int
    available_fields: List[str]
    dimensions: DatasetDimensions
    columns: Dict[str, List[Any]]


class DriverAnalysisResponse(BaseModel):
    filter_row_count: int
    target: str
    importance_basis: str
    correlations: List[CorrelationResult]
    driver_ranking: List[DriverEvidence]
    statistical_model: StatisticalModelResult
    notes: List[str] = Field(default_factory=list)


class InsightResponse(BaseModel):
    filter_row_count: int
    scope: FilterSpec
    scope_label: str
    kpis: KpiSummary
    ai_english: AIAnalysisResult
    ai_mongolian: Optional[AIAnalysisResult] = None
    meta: AnalysisMeta
    generated_at: str
