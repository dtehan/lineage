"""
Manual Column Lineage Mappings for Demo/Test Data

These mappings define the column-level lineage relationships for the demo
medallion architecture tables (SRC -> STG -> DIM -> FACT -> RPT).

Format: (source_column_path, target_column_path, transformation_type, confidence_score)
  - Paths use {DATABASE} placeholder, resolved at runtime
  - Transformation types: DIRECT, CALCULATION, AGGREGATION, JOIN, FILTER
  - Confidence scores: 0.0-1.0 (1.0 = highest confidence)

Usage:
  from database.fixtures import COLUMN_LINEAGE_MAPPINGS

Note: For production lineage extraction, use --dbql mode to extract lineage
from DBQL logs via SQL parsing. These fixtures are for testing and demos only.
"""

# Column lineage records based on known data flows in the demo medallion architecture
COLUMN_LINEAGE_MAPPINGS = [
    # =========================================================================
    # SRC_CUSTOMER -> STG_CUSTOMER
    # Bronze to Silver layer: source system extraction with basic transformations
    # =========================================================================
    ("{DATABASE}.SRC_CUSTOMER.first_name", "{DATABASE}.STG_CUSTOMER.full_name", "CALCULATION", 1.00),
    ("{DATABASE}.SRC_CUSTOMER.last_name", "{DATABASE}.STG_CUSTOMER.full_name", "CALCULATION", 1.00),
    ("{DATABASE}.SRC_CUSTOMER.customer_id", "{DATABASE}.STG_CUSTOMER.customer_id", "DIRECT", 1.00),
    ("{DATABASE}.SRC_CUSTOMER.email", "{DATABASE}.STG_CUSTOMER.email_address", "DIRECT", 1.00),
    ("{DATABASE}.SRC_CUSTOMER.phone", "{DATABASE}.STG_CUSTOMER.phone_number", "DIRECT", 1.00),
    ("{DATABASE}.SRC_CUSTOMER.created_date", "{DATABASE}.STG_CUSTOMER.customer_since", "DIRECT", 1.00),

    # =========================================================================
    # SRC_PRODUCT -> STG_PRODUCT
    # Bronze to Silver: product staging with margin calculation
    # =========================================================================
    ("{DATABASE}.SRC_PRODUCT.product_id", "{DATABASE}.STG_PRODUCT.product_id", "DIRECT", 1.00),
    ("{DATABASE}.SRC_PRODUCT.product_name", "{DATABASE}.STG_PRODUCT.product_name", "DIRECT", 1.00),
    ("{DATABASE}.SRC_PRODUCT.category", "{DATABASE}.STG_PRODUCT.category_name", "DIRECT", 1.00),
    ("{DATABASE}.SRC_PRODUCT.unit_price", "{DATABASE}.STG_PRODUCT.unit_price", "DIRECT", 1.00),
    ("{DATABASE}.SRC_PRODUCT.cost_price", "{DATABASE}.STG_PRODUCT.cost_price", "DIRECT", 1.00),
    ("{DATABASE}.SRC_PRODUCT.unit_price", "{DATABASE}.STG_PRODUCT.profit_margin", "CALCULATION", 1.00),
    ("{DATABASE}.SRC_PRODUCT.cost_price", "{DATABASE}.STG_PRODUCT.profit_margin", "CALCULATION", 1.00),

    # =========================================================================
    # SRC_SALES -> STG_SALES
    # Bronze to Silver: sales staging with net amount calculation
    # =========================================================================
    ("{DATABASE}.SRC_SALES.transaction_id", "{DATABASE}.STG_SALES.transaction_id", "DIRECT", 1.00),
    ("{DATABASE}.SRC_SALES.customer_id", "{DATABASE}.STG_SALES.customer_id", "DIRECT", 1.00),
    ("{DATABASE}.SRC_SALES.product_id", "{DATABASE}.STG_SALES.product_id", "DIRECT", 1.00),
    ("{DATABASE}.SRC_SALES.store_id", "{DATABASE}.STG_SALES.store_id", "DIRECT", 1.00),
    ("{DATABASE}.SRC_SALES.quantity", "{DATABASE}.STG_SALES.quantity", "DIRECT", 1.00),
    ("{DATABASE}.SRC_SALES.sale_amount", "{DATABASE}.STG_SALES.gross_amount", "DIRECT", 1.00),
    ("{DATABASE}.SRC_SALES.discount_amount", "{DATABASE}.STG_SALES.discount_amount", "DIRECT", 1.00),
    ("{DATABASE}.SRC_SALES.sale_amount", "{DATABASE}.STG_SALES.net_amount", "CALCULATION", 1.00),
    ("{DATABASE}.SRC_SALES.discount_amount", "{DATABASE}.STG_SALES.net_amount", "CALCULATION", 1.00),
    ("{DATABASE}.SRC_SALES.sale_date", "{DATABASE}.STG_SALES.sale_date", "DIRECT", 1.00),

    # =========================================================================
    # STG_CUSTOMER -> DIM_CUSTOMER
    # Silver to Gold: customer dimension with surrogate key
    # =========================================================================
    ("{DATABASE}.STG_CUSTOMER.customer_key", "{DATABASE}.DIM_CUSTOMER.customer_sk", "DIRECT", 1.00),
    ("{DATABASE}.STG_CUSTOMER.customer_id", "{DATABASE}.DIM_CUSTOMER.customer_id", "DIRECT", 1.00),
    ("{DATABASE}.STG_CUSTOMER.full_name", "{DATABASE}.DIM_CUSTOMER.full_name", "DIRECT", 1.00),
    ("{DATABASE}.STG_CUSTOMER.email_address", "{DATABASE}.DIM_CUSTOMER.email_address", "DIRECT", 1.00),
    ("{DATABASE}.STG_CUSTOMER.phone_number", "{DATABASE}.DIM_CUSTOMER.phone_number", "DIRECT", 1.00),
    ("{DATABASE}.STG_CUSTOMER.customer_since", "{DATABASE}.DIM_CUSTOMER.customer_since", "DIRECT", 1.00),

    # =========================================================================
    # STG_PRODUCT -> DIM_PRODUCT
    # Silver to Gold: product dimension with surrogate key
    # =========================================================================
    ("{DATABASE}.STG_PRODUCT.product_key", "{DATABASE}.DIM_PRODUCT.product_sk", "DIRECT", 1.00),
    ("{DATABASE}.STG_PRODUCT.product_id", "{DATABASE}.DIM_PRODUCT.product_id", "DIRECT", 1.00),
    ("{DATABASE}.STG_PRODUCT.product_name", "{DATABASE}.DIM_PRODUCT.product_name", "DIRECT", 1.00),
    ("{DATABASE}.STG_PRODUCT.category_name", "{DATABASE}.DIM_PRODUCT.category_name", "DIRECT", 1.00),
    ("{DATABASE}.STG_PRODUCT.unit_price", "{DATABASE}.DIM_PRODUCT.unit_price", "DIRECT", 1.00),
    ("{DATABASE}.STG_PRODUCT.cost_price", "{DATABASE}.DIM_PRODUCT.cost_price", "DIRECT", 1.00),
    ("{DATABASE}.STG_PRODUCT.profit_margin", "{DATABASE}.DIM_PRODUCT.profit_margin", "DIRECT", 1.00),

    # =========================================================================
    # SRC_STORE -> DIM_STORE
    # Direct source to dimension (simple reference data)
    # =========================================================================
    ("{DATABASE}.SRC_STORE.store_id", "{DATABASE}.DIM_STORE.store_id", "DIRECT", 1.00),
    ("{DATABASE}.SRC_STORE.store_name", "{DATABASE}.DIM_STORE.store_name", "DIRECT", 1.00),
    ("{DATABASE}.SRC_STORE.region", "{DATABASE}.DIM_STORE.region", "DIRECT", 1.00),
    ("{DATABASE}.SRC_STORE.city", "{DATABASE}.DIM_STORE.city", "DIRECT", 1.00),
    ("{DATABASE}.SRC_STORE.state", "{DATABASE}.DIM_STORE.state", "DIRECT", 1.00),
    ("{DATABASE}.SRC_STORE.open_date", "{DATABASE}.DIM_STORE.open_date", "DIRECT", 1.00),

    # =========================================================================
    # Multi-source -> FACT_SALES
    # Star schema fact table: dimension lookups + staging data
    # =========================================================================
    ("{DATABASE}.STG_SALES.sales_key", "{DATABASE}.FACT_SALES.sales_sk", "DIRECT", 1.00),
    ("{DATABASE}.DIM_DATE.date_sk", "{DATABASE}.FACT_SALES.date_sk", "JOIN", 1.00),
    ("{DATABASE}.DIM_CUSTOMER.customer_sk", "{DATABASE}.FACT_SALES.customer_sk", "JOIN", 1.00),
    ("{DATABASE}.DIM_PRODUCT.product_sk", "{DATABASE}.FACT_SALES.product_sk", "JOIN", 1.00),
    ("{DATABASE}.DIM_STORE.store_sk", "{DATABASE}.FACT_SALES.store_sk", "JOIN", 1.00),
    ("{DATABASE}.STG_SALES.transaction_id", "{DATABASE}.FACT_SALES.transaction_id", "DIRECT", 1.00),
    ("{DATABASE}.STG_SALES.quantity", "{DATABASE}.FACT_SALES.quantity", "DIRECT", 1.00),
    ("{DATABASE}.STG_SALES.gross_amount", "{DATABASE}.FACT_SALES.gross_amount", "DIRECT", 1.00),
    ("{DATABASE}.STG_SALES.discount_amount", "{DATABASE}.FACT_SALES.discount_amount", "DIRECT", 1.00),
    ("{DATABASE}.STG_SALES.net_amount", "{DATABASE}.FACT_SALES.net_amount", "DIRECT", 1.00),
    ("{DATABASE}.STG_SALES.quantity", "{DATABASE}.FACT_SALES.cost_amount", "CALCULATION", 1.00),
    ("{DATABASE}.DIM_PRODUCT.cost_price", "{DATABASE}.FACT_SALES.cost_amount", "CALCULATION", 1.00),
    ("{DATABASE}.STG_SALES.net_amount", "{DATABASE}.FACT_SALES.profit_amount", "CALCULATION", 1.00),
    ("{DATABASE}.FACT_SALES.cost_amount", "{DATABASE}.FACT_SALES.profit_amount", "CALCULATION", 1.00),

    # =========================================================================
    # FACT_SALES -> FACT_SALES_DAILY (Aggregation)
    # Gold layer: daily aggregation of transactional facts
    # =========================================================================
    ("{DATABASE}.FACT_SALES.date_sk", "{DATABASE}.FACT_SALES_DAILY.date_sk", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES.store_sk", "{DATABASE}.FACT_SALES_DAILY.store_sk", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES.product_sk", "{DATABASE}.FACT_SALES_DAILY.product_sk", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES.quantity", "{DATABASE}.FACT_SALES_DAILY.total_quantity", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES.gross_amount", "{DATABASE}.FACT_SALES_DAILY.total_gross_amount", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES.discount_amount", "{DATABASE}.FACT_SALES_DAILY.total_discount_amount", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES.net_amount", "{DATABASE}.FACT_SALES_DAILY.total_net_amount", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES.cost_amount", "{DATABASE}.FACT_SALES_DAILY.total_cost_amount", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES.profit_amount", "{DATABASE}.FACT_SALES_DAILY.total_profit_amount", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES.sales_sk", "{DATABASE}.FACT_SALES_DAILY.transaction_count", "AGGREGATION", 1.00),

    # =========================================================================
    # FACT_SALES_DAILY + DIM -> RPT_MONTHLY_SALES
    # Reporting layer: monthly sales summary with denormalized dimensions
    # =========================================================================
    ("{DATABASE}.FACT_SALES_DAILY.store_sk", "{DATABASE}.RPT_MONTHLY_SALES.store_sk", "AGGREGATION", 1.00),
    ("{DATABASE}.DIM_STORE.store_name", "{DATABASE}.RPT_MONTHLY_SALES.store_name", "JOIN", 1.00),
    ("{DATABASE}.DIM_STORE.region", "{DATABASE}.RPT_MONTHLY_SALES.region", "JOIN", 1.00),
    ("{DATABASE}.DIM_DATE.year_number", "{DATABASE}.RPT_MONTHLY_SALES.year_month", "CALCULATION", 1.00),
    ("{DATABASE}.DIM_DATE.month_number", "{DATABASE}.RPT_MONTHLY_SALES.year_month", "CALCULATION", 1.00),
    ("{DATABASE}.FACT_SALES_DAILY.total_net_amount", "{DATABASE}.RPT_MONTHLY_SALES.total_sales", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES_DAILY.total_profit_amount", "{DATABASE}.RPT_MONTHLY_SALES.total_profit", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES_DAILY.transaction_count", "{DATABASE}.RPT_MONTHLY_SALES.total_transactions", "AGGREGATION", 1.00),
    ("{DATABASE}.FACT_SALES_DAILY.total_net_amount", "{DATABASE}.RPT_MONTHLY_SALES.avg_transaction_value", "CALCULATION", 1.00),
    ("{DATABASE}.FACT_SALES_DAILY.transaction_count", "{DATABASE}.RPT_MONTHLY_SALES.avg_transaction_value", "CALCULATION", 1.00),
]
