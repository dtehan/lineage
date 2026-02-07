#!/usr/bin/env python3
"""
Setup Test Data for Lineage Testing
Creates test tables and executes data movement to generate lineage.
"""

from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

import teradatasql

from db_config import CONFIG

# Get database name from config
DATABASE = CONFIG["database"]

# Test tables to drop (in order to handle dependencies)
TABLES_TO_DROP = [
    "V_REGIONAL_PERFORMANCE",
    "V_SALES_SUMMARY",
    "RPT_HIGH_VALUE_CUSTOMERS",
    "FACT_SALES_SNAPSHOT_20240122",
    "RPT_MONTHLY_SALES",
    "FACT_SALES_DAILY",
    "FACT_SALES",
    "DIM_DATE",
    "DIM_STORE",
    "DIM_PRODUCT",
    "DIM_CUSTOMER",
    "STG_SALES",
    "STG_PRODUCT",
    "STG_CUSTOMER",
    "SRC_STORE",
    "SRC_SALES",
    "SRC_PRODUCT",
    "SRC_CUSTOMER"
]

# Source layer tables
SOURCE_TABLES_DDL = [
    """
    CREATE MULTISET TABLE {DATABASE}.SRC_CUSTOMER (
        customer_id INTEGER NOT NULL,
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        email VARCHAR(100),
        phone VARCHAR(20),
        created_date DATE,
        source_system VARCHAR(20),
        load_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (customer_id)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.SRC_PRODUCT (
        product_id INTEGER NOT NULL,
        product_name VARCHAR(100),
        category VARCHAR(50),
        unit_price DECIMAL(10,2),
        cost_price DECIMAL(10,2),
        supplier_id INTEGER,
        effective_date DATE,
        load_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (product_id)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.SRC_SALES (
        transaction_id INTEGER NOT NULL,
        customer_id INTEGER,
        product_id INTEGER,
        quantity INTEGER,
        sale_amount DECIMAL(12,2),
        discount_amount DECIMAL(10,2),
        sale_date DATE,
        store_id INTEGER,
        load_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (transaction_id)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.SRC_STORE (
        store_id INTEGER NOT NULL,
        store_name VARCHAR(100),
        region VARCHAR(50),
        city VARCHAR(50),
        state VARCHAR(2),
        open_date DATE,
        load_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (store_id)
    """
]

# Staging layer tables
STAGING_TABLES_DDL = [
    """
    CREATE MULTISET TABLE {DATABASE}.STG_CUSTOMER (
        customer_key INTEGER NOT NULL,
        customer_id INTEGER,
        full_name VARCHAR(101),
        email_address VARCHAR(100),
        phone_number VARCHAR(20),
        customer_since DATE,
        etl_batch_id INTEGER,
        etl_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (customer_key)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.STG_PRODUCT (
        product_key INTEGER NOT NULL,
        product_id INTEGER,
        product_name VARCHAR(100),
        category_name VARCHAR(50),
        unit_price DECIMAL(10,2),
        cost_price DECIMAL(10,2),
        profit_margin DECIMAL(5,2),
        etl_batch_id INTEGER,
        etl_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (product_key)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.STG_SALES (
        sales_key INTEGER NOT NULL,
        transaction_id INTEGER,
        customer_id INTEGER,
        product_id INTEGER,
        store_id INTEGER,
        quantity INTEGER,
        gross_amount DECIMAL(12,2),
        discount_amount DECIMAL(10,2),
        net_amount DECIMAL(12,2),
        sale_date DATE,
        etl_batch_id INTEGER,
        etl_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (sales_key)
    """
]

# Dimension tables
DIMENSION_TABLES_DDL = [
    """
    CREATE MULTISET TABLE {DATABASE}.DIM_CUSTOMER (
        customer_sk INTEGER NOT NULL,
        customer_id INTEGER,
        full_name VARCHAR(101),
        email_address VARCHAR(100),
        phone_number VARCHAR(20),
        customer_since DATE,
        effective_date DATE,
        expiry_date DATE,
        is_current CHAR(1),
        etl_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (customer_sk)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.DIM_PRODUCT (
        product_sk INTEGER NOT NULL,
        product_id INTEGER,
        product_name VARCHAR(100),
        category_name VARCHAR(50),
        unit_price DECIMAL(10,2),
        cost_price DECIMAL(10,2),
        profit_margin DECIMAL(5,2),
        effective_date DATE,
        expiry_date DATE,
        is_current CHAR(1),
        etl_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (product_sk)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.DIM_STORE (
        store_sk INTEGER NOT NULL,
        store_id INTEGER,
        store_name VARCHAR(100),
        region VARCHAR(50),
        city VARCHAR(50),
        state VARCHAR(2),
        open_date DATE,
        etl_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (store_sk)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.DIM_DATE (
        date_sk INTEGER NOT NULL,
        calendar_date DATE,
        day_of_week INTEGER,
        day_name VARCHAR(10),
        month_number INTEGER,
        month_name VARCHAR(10),
        quarter INTEGER,
        year_number INTEGER,
        is_weekend CHAR(1),
        is_holiday CHAR(1)
    ) PRIMARY INDEX (date_sk)
    """
]

# Fact tables
FACT_TABLES_DDL = [
    """
    CREATE MULTISET TABLE {DATABASE}.FACT_SALES (
        sales_sk INTEGER NOT NULL,
        date_sk INTEGER,
        customer_sk INTEGER,
        product_sk INTEGER,
        store_sk INTEGER,
        transaction_id INTEGER,
        quantity INTEGER,
        gross_amount DECIMAL(12,2),
        discount_amount DECIMAL(10,2),
        net_amount DECIMAL(12,2),
        cost_amount DECIMAL(12,2),
        profit_amount DECIMAL(12,2),
        etl_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (sales_sk)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.FACT_SALES_DAILY (
        date_sk INTEGER NOT NULL,
        store_sk INTEGER NOT NULL,
        product_sk INTEGER NOT NULL,
        total_quantity INTEGER,
        total_gross_amount DECIMAL(14,2),
        total_discount_amount DECIMAL(14,2),
        total_net_amount DECIMAL(14,2),
        total_cost_amount DECIMAL(14,2),
        total_profit_amount DECIMAL(14,2),
        transaction_count INTEGER,
        etl_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (date_sk, store_sk, product_sk)
    """,
    """
    CREATE MULTISET TABLE {DATABASE}.RPT_MONTHLY_SALES (
        year_month INTEGER NOT NULL,
        store_sk INTEGER NOT NULL,
        store_name VARCHAR(100),
        region VARCHAR(50),
        total_sales DECIMAL(16,2),
        total_profit DECIMAL(16,2),
        total_transactions INTEGER,
        avg_transaction_value DECIMAL(12,2),
        etl_timestamp TIMESTAMP(0)
    ) PRIMARY INDEX (year_month, store_sk)
    """
]

# Source data inserts (using explicit timestamp to avoid ClearScape CURRENT_TIMESTAMP issues)
TIMESTAMP_VAL = "TIMESTAMP '2024-01-15 10:00:00'"
SOURCE_DATA_INSERTS = [
    # Customer source data
    f"""
    INSERT INTO {DATABASE}.SRC_CUSTOMER (customer_id, first_name, last_name, email, phone, created_date, source_system, load_timestamp)
    VALUES (1001, 'John', 'Smith', 'john.smith@email.com', '555-0101', DATE '2020-01-15', 'CRM', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_CUSTOMER (customer_id, first_name, last_name, email, phone, created_date, source_system, load_timestamp)
    VALUES (1002, 'Jane', 'Doe', 'jane.doe@email.com', '555-0102', DATE '2020-02-20', 'CRM', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_CUSTOMER (customer_id, first_name, last_name, email, phone, created_date, source_system, load_timestamp)
    VALUES (1003, 'Robert', 'Johnson', 'r.johnson@email.com', '555-0103', DATE '2020-03-10', 'WEB', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_CUSTOMER (customer_id, first_name, last_name, email, phone, created_date, source_system, load_timestamp)
    VALUES (1004, 'Emily', 'Williams', 'emily.w@email.com', '555-0104', DATE '2020-04-05', 'WEB', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_CUSTOMER (customer_id, first_name, last_name, email, phone, created_date, source_system, load_timestamp)
    VALUES (1005, 'Michael', 'Brown', 'm.brown@email.com', '555-0105', DATE '2020-05-22', 'CRM', {TIMESTAMP_VAL})
    """,
    # Product source data
    f"""
    INSERT INTO {DATABASE}.SRC_PRODUCT (product_id, product_name, category, unit_price, cost_price, supplier_id, effective_date, load_timestamp)
    VALUES (2001, 'Laptop Pro 15', 'Electronics', 1299.99, 850.00, 100, DATE '2023-01-01', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_PRODUCT (product_id, product_name, category, unit_price, cost_price, supplier_id, effective_date, load_timestamp)
    VALUES (2002, 'Wireless Mouse', 'Electronics', 49.99, 22.00, 100, DATE '2023-01-01', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_PRODUCT (product_id, product_name, category, unit_price, cost_price, supplier_id, effective_date, load_timestamp)
    VALUES (2003, 'Office Chair Deluxe', 'Furniture', 399.99, 180.00, 101, DATE '2023-01-01', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_PRODUCT (product_id, product_name, category, unit_price, cost_price, supplier_id, effective_date, load_timestamp)
    VALUES (2004, 'Standing Desk', 'Furniture', 599.99, 320.00, 101, DATE '2023-01-01', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_PRODUCT (product_id, product_name, category, unit_price, cost_price, supplier_id, effective_date, load_timestamp)
    VALUES (2005, 'Monitor 27 inch', 'Electronics', 449.99, 280.00, 100, DATE '2023-01-01', {TIMESTAMP_VAL})
    """,
    # Store source data
    f"""
    INSERT INTO {DATABASE}.SRC_STORE (store_id, store_name, region, city, state, open_date, load_timestamp)
    VALUES (301, 'Downtown Flagship', 'Northeast', 'New York', 'NY', DATE '2015-06-01', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_STORE (store_id, store_name, region, city, state, open_date, load_timestamp)
    VALUES (302, 'Mall Location', 'Northeast', 'Boston', 'MA', DATE '2016-03-15', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_STORE (store_id, store_name, region, city, state, open_date, load_timestamp)
    VALUES (303, 'Tech Hub Store', 'West', 'San Francisco', 'CA', DATE '2017-09-01', {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_STORE (store_id, store_name, region, city, state, open_date, load_timestamp)
    VALUES (304, 'Suburban Outlet', 'Midwest', 'Chicago', 'IL', DATE '2018-01-20', {TIMESTAMP_VAL})
    """,
    # Sales source data
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5001, 1001, 2001, 1, 1299.99, 100.00, DATE '2024-01-15', 301, {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5002, 1001, 2002, 2, 99.98, 0.00, DATE '2024-01-15', 301, {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5003, 1002, 2003, 1, 399.99, 40.00, DATE '2024-01-16', 302, {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5004, 1003, 2004, 1, 599.99, 50.00, DATE '2024-01-17', 303, {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5005, 1003, 2005, 2, 899.98, 90.00, DATE '2024-01-17', 303, {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5006, 1004, 2001, 1, 1299.99, 0.00, DATE '2024-01-18', 304, {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5007, 1005, 2002, 3, 149.97, 15.00, DATE '2024-01-19', 301, {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5008, 1002, 2005, 1, 449.99, 0.00, DATE '2024-01-20', 302, {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5009, 1004, 2003, 2, 799.98, 80.00, DATE '2024-01-21', 303, {TIMESTAMP_VAL})
    """,
    f"""
    INSERT INTO {DATABASE}.SRC_SALES (transaction_id, customer_id, product_id, quantity, sale_amount, discount_amount, sale_date, store_id, load_timestamp)
    VALUES (5010, 1001, 2004, 1, 599.99, 60.00, DATE '2024-01-22', 301, {TIMESTAMP_VAL})
    """
]

# Date dimension population (simplified for January 2024)
DIM_DATE_INSERT = """
    INSERT INTO {DATABASE}.DIM_DATE (date_sk, calendar_date, day_of_week, day_name, month_number, month_name, quarter, year_number, is_weekend, is_holiday)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
"""

# Data movement queries that create lineage (using explicit timestamps for ClearScape)
DATA_MOVEMENT_QUERIES = [
    # SRC_CUSTOMER -> STG_CUSTOMER (INSERT...SELECT with transformation)
    ("SRC->STG Customer", """
    INSERT INTO {DATABASE}.STG_CUSTOMER (customer_key, customer_id, full_name, email_address, phone_number, customer_since, etl_batch_id, etl_timestamp)
    SELECT
        ROW_NUMBER() OVER (ORDER BY customer_id) AS customer_key,
        customer_id,
        TRIM(first_name) || ' ' || TRIM(last_name) AS full_name,
        LOWER(TRIM(email)) AS email_address,
        phone AS phone_number,
        created_date AS customer_since,
        1 AS etl_batch_id,
        TIMESTAMP '2024-01-15 10:00:00' AS etl_timestamp
    FROM {DATABASE}.SRC_CUSTOMER
    """),

    # SRC_PRODUCT -> STG_PRODUCT (INSERT...SELECT with calculation)
    ("SRC->STG Product", """
    INSERT INTO {DATABASE}.STG_PRODUCT (product_key, product_id, product_name, category_name, unit_price, cost_price, profit_margin, etl_batch_id, etl_timestamp)
    SELECT
        ROW_NUMBER() OVER (ORDER BY product_id) AS product_key,
        product_id,
        product_name,
        category AS category_name,
        unit_price,
        cost_price,
        CAST(CASE WHEN unit_price > 0 THEN ((unit_price - cost_price) / unit_price) * 100 ELSE 0 END AS DECIMAL(5,2)) AS profit_margin,
        1 AS etl_batch_id,
        TIMESTAMP '2024-01-15 10:00:00' AS etl_timestamp
    FROM {DATABASE}.SRC_PRODUCT
    """),

    # SRC_SALES -> STG_SALES (INSERT...SELECT with calculation)
    ("SRC->STG Sales", """
    INSERT INTO {DATABASE}.STG_SALES (sales_key, transaction_id, customer_id, product_id, store_id, quantity, gross_amount, discount_amount, net_amount, sale_date, etl_batch_id, etl_timestamp)
    SELECT
        ROW_NUMBER() OVER (ORDER BY transaction_id) AS sales_key,
        transaction_id,
        customer_id,
        product_id,
        store_id,
        quantity,
        sale_amount AS gross_amount,
        discount_amount,
        sale_amount - discount_amount AS net_amount,
        sale_date,
        1 AS etl_batch_id,
        TIMESTAMP '2024-01-15 10:00:00' AS etl_timestamp
    FROM {DATABASE}.SRC_SALES
    """),

    # STG_CUSTOMER -> DIM_CUSTOMER (direct load, no merge in demo)
    ("STG->DIM Customer", """
    INSERT INTO {DATABASE}.DIM_CUSTOMER (customer_sk, customer_id, full_name, email_address, phone_number, customer_since, effective_date, expiry_date, is_current, etl_timestamp)
    SELECT
        customer_key AS customer_sk,
        customer_id,
        full_name,
        email_address,
        phone_number,
        customer_since,
        DATE '2024-01-15' AS effective_date,
        DATE '9999-12-31' AS expiry_date,
        'Y' AS is_current,
        TIMESTAMP '2024-01-15 10:00:00' AS etl_timestamp
    FROM {DATABASE}.STG_CUSTOMER
    """),

    # STG_PRODUCT -> DIM_PRODUCT
    ("STG->DIM Product", """
    INSERT INTO {DATABASE}.DIM_PRODUCT (product_sk, product_id, product_name, category_name, unit_price, cost_price, profit_margin, effective_date, expiry_date, is_current, etl_timestamp)
    SELECT
        product_key AS product_sk,
        product_id,
        product_name,
        category_name,
        unit_price,
        cost_price,
        profit_margin,
        DATE '2024-01-15' AS effective_date,
        DATE '9999-12-31' AS expiry_date,
        'Y' AS is_current,
        TIMESTAMP '2024-01-15 10:00:00' AS etl_timestamp
    FROM {DATABASE}.STG_PRODUCT
    """),

    # SRC_STORE -> DIM_STORE (direct from source)
    ("SRC->DIM Store", """
    INSERT INTO {DATABASE}.DIM_STORE (store_sk, store_id, store_name, region, city, state, open_date, etl_timestamp)
    SELECT
        ROW_NUMBER() OVER (ORDER BY store_id) AS store_sk,
        store_id,
        store_name,
        region,
        city,
        state,
        open_date,
        TIMESTAMP '2024-01-15 10:00:00' AS etl_timestamp
    FROM {DATABASE}.SRC_STORE
    """),

    # Multi-source -> FACT_SALES (JOIN multiple tables)
    ("Multi->FACT Sales", """
    INSERT INTO {DATABASE}.FACT_SALES (sales_sk, date_sk, customer_sk, product_sk, store_sk, transaction_id, quantity, gross_amount, discount_amount, net_amount, cost_amount, profit_amount, etl_timestamp)
    SELECT
        s.sales_key AS sales_sk,
        d.date_sk,
        c.customer_sk,
        p.product_sk,
        st.store_sk,
        s.transaction_id,
        s.quantity,
        s.gross_amount,
        s.discount_amount,
        s.net_amount,
        s.quantity * p.cost_price AS cost_amount,
        s.net_amount - (s.quantity * p.cost_price) AS profit_amount,
        TIMESTAMP '2024-01-15 10:00:00' AS etl_timestamp
    FROM {DATABASE}.STG_SALES s
    INNER JOIN {DATABASE}.DIM_CUSTOMER c ON s.customer_id = c.customer_id AND c.is_current = 'Y'
    INNER JOIN {DATABASE}.DIM_PRODUCT p ON s.product_id = p.product_id AND p.is_current = 'Y'
    INNER JOIN {DATABASE}.DIM_STORE st ON s.store_id = st.store_id
    INNER JOIN {DATABASE}.DIM_DATE d ON s.sale_date = d.calendar_date
    """),

    # FACT_SALES -> FACT_SALES_DAILY (aggregation)
    ("FACT->Aggregate Daily", """
    INSERT INTO {DATABASE}.FACT_SALES_DAILY (date_sk, store_sk, product_sk, total_quantity, total_gross_amount, total_discount_amount, total_net_amount, total_cost_amount, total_profit_amount, transaction_count, etl_timestamp)
    SELECT
        date_sk,
        store_sk,
        product_sk,
        SUM(quantity) AS total_quantity,
        SUM(gross_amount) AS total_gross_amount,
        SUM(discount_amount) AS total_discount_amount,
        SUM(net_amount) AS total_net_amount,
        SUM(cost_amount) AS total_cost_amount,
        SUM(profit_amount) AS total_profit_amount,
        COUNT(*) AS transaction_count,
        TIMESTAMP '2024-01-15 10:00:00' AS etl_timestamp
    FROM {DATABASE}.FACT_SALES
    GROUP BY date_sk, store_sk, product_sk
    """),

    # Multiple sources -> RPT_MONTHLY_SALES (aggregation with joins)
    ("Aggregate->Monthly Report", """
    INSERT INTO {DATABASE}.RPT_MONTHLY_SALES (year_month, store_sk, store_name, region, total_sales, total_profit, total_transactions, avg_transaction_value, etl_timestamp)
    SELECT
        d.year_number * 100 + d.month_number AS year_month,
        f.store_sk,
        s.store_name,
        s.region,
        SUM(f.total_net_amount) AS total_sales,
        SUM(f.total_profit_amount) AS total_profit,
        SUM(f.transaction_count) AS total_transactions,
        CAST(CASE WHEN SUM(f.transaction_count) > 0 THEN SUM(f.total_net_amount) / SUM(f.transaction_count) ELSE 0 END AS DECIMAL(12,2)) AS avg_transaction_value,
        TIMESTAMP '2024-01-15 10:00:00' AS etl_timestamp
    FROM {DATABASE}.FACT_SALES_DAILY f
    INNER JOIN {DATABASE}.DIM_STORE s ON f.store_sk = s.store_sk
    INNER JOIN {DATABASE}.DIM_DATE d ON f.date_sk = d.date_sk
    GROUP BY d.year_number * 100 + d.month_number, f.store_sk, s.store_name, s.region
    """)
]

def drop_object(cursor, obj_name, obj_type="TABLE"):
    """Drop a database object if it exists."""
    try:
        cursor.execute(f"DROP {obj_type} {DATABASE}.{obj_name}")
        return True
    except teradatasql.DatabaseError as e:
        if "does not exist" in str(e).lower() or "3807" in str(e):
            return False
        return False

def main():
    print("=" * 60)
    print("Test Data Setup for Lineage Testing")
    print("=" * 60)

    # Connect
    print(f"\nConnecting to {CONFIG['host']}...")
    try:
        conn = teradatasql.connect(**CONFIG)
        cursor = conn.cursor()
        print("Connected successfully!")
    except Exception as e:
        print(f"ERROR: Failed to connect: {e}")
        sys.exit(1)

    # Drop existing test objects
    print("\n--- Dropping existing test objects ---")
    for obj_name in TABLES_TO_DROP:
        # Try as view first, then table
        if drop_object(cursor, obj_name, "VIEW"):
            print(f"  Dropped view: {obj_name}")
        elif drop_object(cursor, obj_name, "TABLE"):
            print(f"  Dropped table: {obj_name}")

    # Create source tables
    print("\n--- Creating source layer tables ---")
    for ddl_template in SOURCE_TABLES_DDL:
        ddl = ddl_template.format(DATABASE=DATABASE)
        table_name = ddl.split(f"{DATABASE}.")[1].split()[0]
        print(f"  Creating {table_name}...", end=" ")
        try:
            cursor.execute(ddl)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")
            sys.exit(1)

    # Create staging tables
    print("\n--- Creating staging layer tables ---")
    for ddl_template in STAGING_TABLES_DDL:
        ddl = ddl_template.format(DATABASE=DATABASE)
        table_name = ddl.split(f"{DATABASE}.")[1].split()[0]
        print(f"  Creating {table_name}...", end=" ")
        try:
            cursor.execute(ddl)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")
            sys.exit(1)

    # Create dimension tables
    print("\n--- Creating dimension tables ---")
    for ddl_template in DIMENSION_TABLES_DDL:
        ddl = ddl_template.format(DATABASE=DATABASE)
        table_name = ddl.split(f"{DATABASE}.")[1].split()[0]
        print(f"  Creating {table_name}...", end=" ")
        try:
            cursor.execute(ddl)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")
            sys.exit(1)

    # Create fact tables
    print("\n--- Creating fact tables ---")
    for ddl_template in FACT_TABLES_DDL:
        ddl = ddl_template.format(DATABASE=DATABASE)
        table_name = ddl.split(f"{DATABASE}.")[1].split()[0]
        print(f"  Creating {table_name}...", end=" ")
        try:
            cursor.execute(ddl)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")
            sys.exit(1)

    # Insert source data
    print("\n--- Inserting source data ---")
    for i, insert_template in enumerate(SOURCE_DATA_INSERTS, 1):
        try:
            insert_sql = insert_template.format(DATABASE=DATABASE)
            cursor.execute(insert_sql)
        except Exception as e:
            print(f"  Insert {i} FAILED: {e}")
    print(f"  Inserted {len(SOURCE_DATA_INSERTS)} source records")

    # Insert date dimension data (January 2024)
    print("\n--- Populating date dimension ---")
    day_names = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    from datetime import date, timedelta
    import calendar

    date_records = []
    start_date = date(2024, 1, 1)
    for day_offset in range(31):  # January has 31 days
        d = start_date + timedelta(days=day_offset)
        date_sk = (d - date(1900, 1, 1)).days
        day_of_week = d.weekday()  # Monday = 0
        day_name = calendar.day_name[day_of_week]
        is_weekend = 'Y' if day_of_week >= 5 else 'N'

        date_records.append((
            date_sk,
            d,
            day_of_week + 1,  # Teradata uses 1-7
            day_name[:10],
            d.month,
            calendar.month_name[d.month][:10],
            (d.month - 1) // 3 + 1,
            d.year,
            is_weekend,
            'N'
        ))

    dim_date_sql = DIM_DATE_INSERT.format(DATABASE=DATABASE)
    for record in date_records:
        try:
            cursor.execute(dim_date_sql, record)
        except Exception as e:
            pass  # Ignore duplicates
    print(f"  Inserted {len(date_records)} date records")

    # Execute data movement queries (creates lineage)
    print("\n--- Executing data movement queries ---")
    for name, sql_template in DATA_MOVEMENT_QUERIES:
        print(f"  {name}...", end=" ")
        try:
            sql = sql_template.format(DATABASE=DATABASE)
            cursor.execute(sql)
            print("OK")
        except Exception as e:
            print(f"FAILED: {e}")

    # Verify data
    print("\n--- Verifying data ---")
    tables_to_check = [
        "SRC_CUSTOMER", "SRC_PRODUCT", "SRC_SALES", "SRC_STORE",
        "STG_CUSTOMER", "STG_PRODUCT", "STG_SALES",
        "DIM_CUSTOMER", "DIM_PRODUCT", "DIM_STORE", "DIM_DATE",
        "FACT_SALES", "FACT_SALES_DAILY", "RPT_MONTHLY_SALES"
    ]
    for table in tables_to_check:
        try:
            cursor.execute(f"SELECT COUNT(*) FROM {DATABASE}.{table}")
            count = cursor.fetchone()[0]
            print(f"  {table}: {count} rows")
        except Exception as e:
            print(f"  {table}: ERROR - {e}")

    cursor.close()
    conn.close()

    print("\n" + "=" * 60)
    print("Test data setup completed!")
    print("=" * 60)

    return 0


if __name__ == "__main__":
    sys.exit(main())
