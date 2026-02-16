"""
Cache key generation for hierarchical, pattern-based invalidation.

Key structure: lineage:{graph_type}:{identifier}:{params}
Examples:
  lineage:graph:column:demo_user.customer:customer_id:upstream:5
  lineage:graph:table:demo_user.customer:both:5
  lineage:graph:database:demo_user

Pattern invalidation examples:
  lineage:graph:*:demo_user.customer:*  → All customer table cache
  lineage:graph:*:demo_user.*           → Entire demo_user database cache
"""


def make_column_lineage_key(dataset_name: str, field_name: str, direction: str, max_depth: int) -> str:
    """Generate cache key for column-level lineage."""
    ds = dataset_name.strip().lower()
    fn = field_name.strip().lower()
    return f"lineage:graph:column:{ds}:{fn}:{direction}:{max_depth}"


def make_table_lineage_key(dataset_name: str, direction: str, max_depth: int) -> str:
    """Generate cache key for table-level lineage."""
    ds = dataset_name.strip().lower()
    return f"lineage:graph:table:{ds}:{direction}:{max_depth}"


def make_database_lineage_key(database_name: str, max_depth: int) -> str:
    """Generate cache key for database-level lineage."""
    db = database_name.strip().lower()
    return f"lineage:graph:database:{db}:{max_depth}"
