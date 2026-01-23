# Data Lineage Visualization: Commercial Tools Research

## Executive Summary

Research covering major commercial data lineage and data catalog tools: Atlan, Alation, Collibra, Informatica, Microsoft Purview, Google Dataplex, AWS Glue/DataZone, Snowflake, Databricks Unity Catalog, dbt, and Select Star.

---

## 1. Table-Level Lineage: Node Representation

### Common Node Design Patterns

**Card-based Table Nodes:**
Most tools represent tables as rectangular cards/nodes containing:
- Table name prominently displayed at the top
- Database/schema qualifier (often in a subdued color or smaller text)
- Icon indicating asset type (table, view, materialized view, source, etc.)
- Visual indicator for data source/system (color-coding or icon)

**Color Coding by Status/Type:**
- **Collibra**: Yellow background for objects stitched to Data Catalog assets; gray for unstitched objects (temporary tables, etc.)
- **dbt**: Resource-specific colors for models, sources, exposures, seeds, and tests
- **Most tools**: Different colors for different data source types

**Connection Visualization:**
- Directed edges (arrows) show data flow direction
- Left-to-right layout is the most common (source to target)
- Edges connect node boundaries, not specific ports unless showing column-level detail

### Key Documentation URLs:
- [Collibra Technical Lineage Graph](https://productresources.collibra.com/docs/collibra/latest/Content/CollibraDataLineage/TechnicalLineage/ref_technical-lineage-graph.htm)
- [Atlan Lineage Documentation](https://docs.atlan.com/product/capabilities/lineage)
- [Google Dataplex Lineage Views](https://cloud.google.com/dataplex/docs/lineage-views)

---

## 2. Column Display Within Table Nodes

### Two Primary Approaches

**Approach A: Expandable Column List (Most Common)**
- Table node starts collapsed, showing only table name
- Click/expand icon reveals list of columns inside the node
- Columns displayed as a scrollable list within the expanded node
- Examples: Collibra, Alation, Databricks, Snowflake

**Approach B: Side Panel for Column Details**
- Table node stays compact on the graph
- Clicking a table opens a side panel showing column details
- Keeps graph clean while providing detailed information
- Examples: Snowflake Snowsight, Databricks Unity Catalog, Google Dataplex

### Column Information Displayed:
- Column name
- Data type (often shown on hover or in side panel)
- Icons for special column attributes (primary key, nullable, etc.)
- Lineage indicator (showing if column has upstream/downstream connections)

### Key Documentation URLs:
- [Snowflake Data Lineage UI](https://docs.snowflake.com/en/user-guide/ui-snowsight-lineage)
- [Databricks Unity Catalog Lineage](https://docs.databricks.com/aws/en/data-governance/unity-catalog/data-lineage)
- [Alation Lineage User Guide](https://docs.alation.com/en/latest/analyst/Lineage/ExploreCompoundLayout.html)

---

## 3. Column-to-Column Lineage Visualization

### Visualization Techniques

**Hover Highlighting (Most Intuitive):**
- Hovering over a column highlights connected columns in other tables
- Connected edges are emphasized; unrelated elements are dimmed
- Microsoft Purview: "Hover over a selected column... to see the column mapping. All the column instances are highlighted."
- Power BI: "Highlights all the artifacts related to that artifact, and dims the rest"

**Click to Trace/Isolate:**
- Alation: "Hover over a column name. A Trace Lineage button appears. Click to enter Column Trace View"
- Google Dataplex: Click column icon to see graph of all upstream/downstream column connections
- Select Star: Click columns to explore graph with column-level navigation

**Edge Labeling for Transformation Types:**
- Google Dataplex: Edges labeled with dependency type ("Exact copy" or "Other")
- dbt: Column evolution lens shows "Passthrough," "Rename," or "Transformed"
- Helps users quickly understand if data is modified or just passed through

**Color Coding for Transformation Status:**
- dbt: Passthrough and rename columns are clearly labeled and color-coded
- Visual distinction between copied columns vs. transformed columns

### Column Lineage Depth Indicators:
- Snowflake: "Distance" column shows how far away a column is (1 = direct, 2 = two hops, etc.)
- Select Star: Upstream and downstream views with tree hierarchy

### Key Documentation URLs:
- [dbt Column-Level Lineage](https://docs.getdbt.com/docs/explore/column-level-lineage)
- [Google Dataplex Column Lineage](https://cloud.google.com/blog/products/data-analytics/dataplex-supports-column-level-lineage-for-bigquery-data)
- [Microsoft Purview Lineage User Guide](https://learn.microsoft.com/en-us/purview/data-gov-classic-lineage-user-guide)

---

## 4. Interaction Patterns

### Expand/Collapse Behavior

**Progressive Disclosure (Best Practice):**
- Start with minimal view, expand on demand
- Databricks/Snowflake: "By default, one level is displayed in the graph. Click the icon on a node to reveal more connections"
- Google Dataplex: "Focused view automatically expands the graph up to three levels"
- Incremental loading: Google Dataplex loads 5 nodes at a time

**Known Pain Point:**
- Databricks: "One of the more frustrating things is the inability to collapse a node after expanding it. Once a node is expanded, it stays that way, leaving the graph cluttered"
- **Recommendation**: Always support both expand AND collapse functionality

### Click Behaviors

1. **Click on Node**: Opens detail panel or expands node
2. **Click on Edge/Arrow**: Shows transformation details, SQL statement, or job information
3. **Click on Column**: Highlights column lineage path or opens column detail view

### Hover Behaviors

1. **Hover on Node**: Shows tooltip with table metadata (row count, last updated, owner)
2. **Hover on Column**: Shows data type, description, full name
3. **Hover on Edge**: Shows transformation type or process name

### View Switching

- **Graph View vs. List View**: Google Dataplex and Select Star offer both
- **Table-Level vs. Column-Level Toggle**: Alation, Collibra, and Databricks support switching between views
- **Simplified vs. Detailed View**: Google Dataplex offers toggle for condensed view

### Key Documentation URLs:
- [DataHub Lineage UI Guide](https://docs.datahub.com/docs/features/feature-guides/ui-lineage/)
- [Alation Compound Layout View](https://www.alation.com/docs/en/latest/analyst/Lineage/ExploreCompoundLayout.html)
- [Select Star Lineage Features](https://docs.selectstar.com/features/lineage)

---

## 5. Handling Large Graphs

### Virtualization & Performance Strategies

**Neighborhood View (Most Common):**
- Snowflake, Databricks, and most tools use this approach
- Focus on immediate connections, not entire graph
- "This approach simplifies complexity by focusing on immediate connections, makes it easier to interpret large graphs, is scalable, handles large datasets without overwhelming the user"
- Faster rendering with lower resource usage since only part of graph is displayed

**Graph Depth Limits:**
- Google Dataplex: Limited to 20 levels depth and 10,000 links per direction
- Configurable max depth parameter (common: 3-5 levels default, up to 10-20 max)

**Filtering and Search:**
- Filter by column name, direction, time range, dependency type
- Search within lineage graph (Select Star: "Search is available within the Lineage Graph, making it easier to explore tables that have a large number of columns")
- Filter by data source, schema, or system

**Lazy Loading:**
- Load nodes incrementally as user expands
- Google Dataplex: Loads 5 nodes at a time on expansion

**Clustering/Grouping:**
- Alation Compound Layout: "Clusters related lineage nodes by data source"
- Group tables by database/schema to reduce visual complexity

**Minimap/Overview Panel:**
- React Flow and other libraries support minimap for large graphs
- Helps users understand position within larger graph

### Scalability Considerations:
- Graph databases (vs. relational) recommended for better performance
- "In practice, relational DBs are cumbersome and inefficient for working with lineages... Graph databases represent them with relationships, making operations simpler and quicker"

---

## 6. Innovative UI Patterns

### Dual View Options

**Graph + List View (Google Dataplex, Select Star):**
- Graph for visual exploration
- List/tabular view for sorting, filtering, and exporting
- List shows columns like System, Project, Entity, FQN, Direction, Depth

### Metadata Layers/Overlays

**Alation Metadata Layers:**
- Additional visual overlays on lineage graph
- Display trust flags, data quality indicators, or custom field values
- One metadata layer visible at a time

### Actionable Lineage (Atlan)

- In-built actions directly in lineage view
- Raise Jira tickets, trigger Slack discussions, alert downstream users
- No app switching required for collaboration

### AI-Assisted Explanations (Atlan)

- "Atlan AI explains SQL logic and transformation steps in natural language"
- Helps non-technical users understand transformations

### Column Evolution Lens (dbt)

- Visual distinction between passthrough, rename, and transform operations
- Automatic description inheritance for non-transformed columns
- "A reused column automatically inherits its description from the source and upstream model columns"

### Edge Detail on Click

- Clicking edge/arrow shows:
  - SQL statement that created the connection (Snowflake, Databricks)
  - Source and target details (OpenMetadata)
  - Transformation logic and timestamp

### Time-Based Filtering (DataHub)

- Filter edges by last updated time
- Useful for understanding recent changes vs. historical lineage

---

## 7. Tool-Specific Highlights

### Atlan
- **Strength**: Automated column-level lineage across 100+ connectors
- **Unique**: AI explanations of SQL transformations in natural language
- **Pattern**: Actionable lineage with integrated collaboration tools
- [Atlan Data Lineage](https://atlan.com/column-level-lineage/)

### Alation
- **Strength**: Compound Layout view clusters nodes by data source
- **Unique**: Metadata layers for overlaying trust flags, quality indicators
- **Pattern**: Column Trace View separate from Full Lineage view
- [Alation Lineage Documentation](https://www.alation.com/docs/en/latest/analyst/Lineage/index.html)

### Collibra
- **Strength**: Enterprise-grade with QueryFlow technology
- **Unique**: Yellow/gray color coding for catalog-stitched vs. unstitched objects
- **Pattern**: Right-click context menu for switching table/column level
- [Collibra Data Lineage](https://www.collibra.com/products/data-lineage)

### Informatica
- **Strength**: Slider controls for revealing intermediate assets by distance
- **Unique**: Tabular impact summary alongside graph view
- **Pattern**: Drill-down to child assets (down to column level) within diagram
- [Informatica Data Lineage](https://www.informatica.com/products/data-catalog/data-lineage.html)

### Microsoft Purview
- **Strength**: Native Azure integration with Fabric, Databricks, Synapse
- **Unique**: Column hover highlighting with all instances emphasized
- **Pattern**: OpenLineage compatibility for custom lineage
- [Microsoft Purview Lineage](https://learn.microsoft.com/en-us/purview/data-gov-classic-lineage)

### Google Dataplex
- **Strength**: Graph + List dual view with export capability
- **Unique**: Edge labels ("Exact copy" vs "Other" dependency types)
- **Pattern**: Focused view auto-expands 3 levels with filtering
- [Google Dataplex Lineage](https://cloud.google.com/dataplex/docs/lineage-views)

### Snowflake (Snowsight)
- **Strength**: Native, built-in lineage for Snowflake objects
- **Unique**: Distance metric showing hops from current object
- **Pattern**: +/- buttons to show/hide upstream/downstream levels
- [Snowflake Data Lineage](https://docs.snowflake.com/en/user-guide/ui-snowsight-lineage)

### Databricks Unity Catalog
- **Strength**: Runtime capture of column-level lineage across languages
- **Unique**: Lineage Connection panel shows job/notebook details on edge click
- **Limitation**: Cannot collapse nodes once expanded
- [Databricks Unity Catalog Lineage](https://docs.databricks.com/aws/en/data-governance/unity-catalog/data-lineage)

### dbt Explorer
- **Strength**: Column evolution lens (passthrough vs. transform distinction)
- **Unique**: Automatic description inheritance for passthrough columns
- **Pattern**: DAG visualization with dagre algorithm layout
- [dbt Column-Level Lineage](https://docs.getdbt.com/docs/explore/column-level-lineage)

### Select Star
- **Strength**: 4 lineage views (Upstream, Downstream, Dashboards, Explore)
- **Unique**: Search within lineage graph for large tables
- **Pattern**: Tree hierarchy navigation combined with graph exploration
- [Select Star Lineage](https://docs.selectstar.com/features/lineage)

---

## 8. Summary: Best Practices for Implementation

### Table Node Design
1. Card-based design with table name, schema/database, and source icon
2. Color coding by asset type or data source
3. Visual indicator when node has more upstream/downstream connections
4. Expandable to show columns (click or toggle icon)

### Column Visualization
1. Columns as a scrollable list within expanded table node
2. Show column name, data type on hover, lineage indicator
3. Support for column search/filter within large tables
4. Side panel for detailed column metadata

### Column-to-Column Lineage
1. Hover highlighting with dimming of unrelated elements
2. Click-to-trace for focused column lineage view
3. Edge labels indicating transformation type (copy/transform)
4. Color coding for passthrough vs. transformed columns

### Interaction Patterns
1. Progressive disclosure: start collapsed, expand on demand
2. Both expand AND collapse functionality (avoid Databricks limitation)
3. Click edge to see transformation SQL/details
4. Direction toggle (upstream/downstream/both)
5. Depth control (slider or max depth parameter)

### Large Graph Handling
1. Neighborhood view with configurable depth
2. Lazy loading of nodes (5-10 at a time)
3. Clustering by data source/schema
4. Search and filter within lineage
5. Graph + List dual view option
6. Minimap for orientation in large graphs

### Innovative Features to Consider
1. AI-powered transformation explanations
2. Metadata overlays (quality, trust indicators)
3. Time-based filtering for recent changes
4. Integrated actions (alerts, tickets, notifications)
5. Column description inheritance for passthrough columns

---

## Sources

- [Atlan Column-Level Lineage](https://atlan.com/column-level-lineage/)
- [Atlan Lineage Documentation](https://docs.atlan.com/product/capabilities/lineage)
- [Alation Lineage Guide](https://www.alation.com/docs/en/latest/analyst/Lineage/index.html)
- [Alation Compound Layout](https://www.alation.com/docs/en/latest/analyst/Lineage/ExploreCompoundLayout.html)
- [Collibra Data Lineage](https://www.collibra.com/products/data-lineage)
- [Collibra Technical Lineage Graph](https://productresources.collibra.com/docs/collibra/latest/Content/CollibraDataLineage/TechnicalLineage/ref_technical-lineage-graph.htm)
- [Informatica Data Lineage](https://www.informatica.com/products/data-catalog/data-lineage.html)
- [Microsoft Purview Data Lineage](https://learn.microsoft.com/en-us/purview/data-gov-classic-lineage)
- [Microsoft Purview Lineage User Guide](https://learn.microsoft.com/en-us/purview/data-gov-classic-lineage-user-guide)
- [Google Dataplex Lineage Views](https://cloud.google.com/dataplex/docs/lineage-views)
- [Google Dataplex Column Lineage Blog](https://cloud.google.com/blog/products/data-analytics/dataplex-supports-column-level-lineage-for-bigquery-data)
- [Snowflake Data Lineage](https://docs.snowflake.com/en/user-guide/ui-snowsight-lineage)
- [AWS DataZone Data Lineage](https://docs.aws.amazon.com/datazone/latest/userguide/datazone-data-lineage.html)
- [Databricks Unity Catalog Lineage](https://docs.databricks.com/aws/en/data-governance/unity-catalog/data-lineage)
- [dbt Column-Level Lineage](https://docs.getdbt.com/docs/explore/column-level-lineage)
- [Select Star Lineage Features](https://docs.selectstar.com/features/lineage)
- [DataHub Lineage UI Guide](https://docs.datahub.com/docs/features/feature-guides/ui-lineage/)
- [OpenMetadata Lineage Explorer](https://docs.open-metadata.org/latest/how-to-guides/data-lineage/explore)
- [Marquez Project](https://marquezproject.ai/)
- [React Flow Documentation](https://reactflow.dev)
- [Synergy Codes: Custom Diagram Visualizations for Data Lineage](https://www.synergycodes.com/blog/how-custom-diagram-visualizations-support-the-data-lineage-in-data-warehouses)
- [Metaplane Guide to Data Lineage in dbt](https://www.metaplane.dev/blog/ultimate-guide-to-data-lineage-in-dbt)
