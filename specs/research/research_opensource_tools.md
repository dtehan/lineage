# Data Lineage Visualization: Open-Source Tools Research

## Overview

Research covering major open-source data lineage tools: Apache Atlas, OpenLineage/Marquez, DataHub, Amundsen, dbt-docs, SQLLineage, OpenMetadata, and Spline.

---

## 1. Apache Atlas

**GitHub Repository**: [https://github.com/apache/atlas](https://github.com/apache/atlas)

### Graph Rendering Library
- Uses **D3.js** with **Dagre** for directed graph layout
- Currently migrating from Backbone.js to React (JIRA: [ATLAS-5033](https://issues.apache.org/jira/browse/ATLAS-5033))
- Backend uses JanusGraph as the graph database

### Table/Column Visualization
- Lineage maps are auto-generated from query information
- Column-level lineage is viewable when browsing to specific columns
- Users have requested the ability to see all column lineage within a table view in a single diagram

### Bidirectional Lineage
- Follows data lineage upstream and downstream automatically
- Generates lineage based on query inputs/outputs from hooks (Hive Hook, Sqoop Hook, HBase Hook)

### Key Features
- Enterprise-grade governance with taxonomical metadata
- Prescriptive and forensic data visibility models
- Integration via Kafka topics (Atlas Hook, Atlas Entity)

### Sources
- [Apache Atlas Official Site](https://atlas.apache.org/)
- [Using Apache Atlas to view Data Lineage - Cloudera](https://community.cloudera.com/t5/Community-Articles/Using-Apache-Atlas-to-view-Data-Lineage/ta-p/246305)
- [Apache Atlas JIRA - Migrate to React](https://issues.apache.org/jira/browse/ATLAS-5033)

---

## 2. OpenLineage / Marquez

**GitHub Repositories**:
- OpenLineage: [https://github.com/OpenLineage/OpenLineage](https://github.com/OpenLineage/OpenLineage)
- Marquez: [https://github.com/MarquezProject/marquez](https://github.com/MarquezProject/marquez)

### Graph Rendering Library
- React with TypeScript frontend
- Uses **d3-dag** for DAG visualization
- API supports retrieval for rendering with D3, React Flow, or GraphViz
- Recent updates removed unused React components for the new lineage graph implementation

### Table/Column Visualization
- Recent releases include column lineage linking with sticky tab titles
- Column lineage links moved to table definition view
- Jobs and datasets shown as interconnected nodes

### Bidirectional Lineage
- Current lineage graph shows latest job version lineage
- Tracks inputs/outputs changes and updates graph automatically
- Maintains dataset and job version history

### Performance Optimizations
- Complete frontend reinvention using React improved performance significantly
- GraphQL endpoint available for flexible querying

### Third-Party Integration - LineageViewer
- [https://github.com/DataVisuals/LineageViewer](https://github.com/DataVisuals/LineageViewer)
- Uses **Cytoscape.js** for high-performance graph rendering
- Supports multiple layout algorithms: hierarchical, circular, grid, force-directed, DAG, Sugiyama

### Sources
- [Marquez Project](https://marquezproject.ai/)
- [Marquez Current Lineage Documentation](https://marquezproject.github.io/marquez/current-lineage/current-lineage.html)
- [Marquez GitHub Releases](https://github.com/MarquezProject/marquez/releases)

---

## 3. DataHub (LinkedIn)

**GitHub Repository**: [https://github.com/datahub-project/datahub](https://github.com/datahub-project/datahub)

### Graph Rendering Library
- Uses **visx** (formerly React VX) - Airbnb's visualization library
- visx combines D3 for calculations with React for DOM updates
- Provides low-level visualization primitives

### Table/Column Visualization
- Column lineage viewable by **expanding table columns**
- Hover or click on columns to see their specific lineage
- Clean design philosophy: users view as much or as little as they need
- Column-level lineage supported since v0.8.28

### Bidirectional Lineage
- Lineage Explorer focuses on a single central entity
- Shows all upstream and downstream entities from that node
- Double-click recenters visualization on another node

### Performance Optimizations
- **Downsampling**: For nodes with 100+ relationships, DataHub downsamples to avoid graph overload
- Time-based filtering: Filter lineage graphs based on time windows
- Layout logic keeps dependency graphs easy to understand even with large node counts

### Supported Sources
Teradata, Databricks, BigQuery, Snowflake, Looker, Power BI, Tableau

### Sources
- [DataHub Lineage Documentation](https://docs.datahub.com/docs/features/feature-guides/lineage)
- [Column-Level Lineage Comes to DataHub](https://datahub.com/blog/column-level-lineage-comes-to-datahub/)
- [Data in Context: Lineage Explorer in DataHub](https://datahub.com/blog/data-in-context-lineage-explorer-in-datahub/)
- [DataHub GitHub Issue #1731 - Column Level Lineage Design](https://github.com/linkedin/datahub/issues/1731)

---

## 4. Amundsen

**GitHub Repository**: [https://github.com/amundsen-io/amundsen](https://github.com/amundsen-io/amundsen)

### Graph Rendering Library
- Flask backend with **React frontend**
- Internal improvements at Stemma.ai used **React Flow**
- Current open-source UI is described as "alpha" for lineage

### Table/Column Visualization
- Displays Upstream and Downstream columns based on table position in data flow
- Dynamically generates lineage graphs showing dependencies
- List view recommended for complex lineages (100+ tables cause cluttered view)

### Bidirectional Lineage
- Shows upstream/downstream relationships
- Real-time change history visualization

### Known Limitations
- [GitHub Issue #1443](https://github.com/amundsen-io/amundsen/issues/1443): Lineage does not scale well with 100+ upstream/downstream tables
- React Flow implementation not yet contributed to open-source

### Sources
- [Amundsen GitHub Repository](https://github.com/amundsen-io/amundsen)
- [Amundsen Data Lineage Setup with dbt](https://atlan.com/amundsen-data-lineage-set-up/)

---

## 5. dbt Lineage (dbt-docs)

**Documentation**: [https://docs.getdbt.com/docs/explore/explore-projects](https://docs.getdbt.com/docs/explore/explore-projects)

### Graph Rendering Library
- Uses **Cytoscape.js** for graph rendering
- **Dagre algorithm** for left-to-right DAG layout
- AngularJS-based graphService manages graph data, layout, styling, and interactions

### Table/Column Visualization
- Column-level lineage accessible via Columns tab expansion
- Shows column cards for models, sources, and snapshots
- Filter and Highlight options for specific columns

### Layout Algorithm
- graphService implemented as AngularJS factory
- Directed acyclic graph (DAG) rendering
- Left-to-right hierarchical layout

### Key Features
- Interactive exploration of dbt resources
- Visualization of dependencies between models, sources, exposures
- Graph-viz directive integrates with Cytoscape.js

### Sources
- [dbt Graph Visualization - DeepWiki](https://deepwiki.com/dbt-labs/dbt-docs/3.4-graph-visualization)
- [dbt Column-level Lineage Documentation](https://docs.getdbt.com/docs/explore/column-level-lineage)
- [Cytoscape.js-dagre Extension](https://github.com/cytoscape/cytoscape.js-dagre)

---

## 6. SQLLineage

**GitHub Repository**: [https://github.com/reata/sqllineage](https://github.com/reata/sqllineage)
**Documentation**: [https://sqllineage.readthedocs.io/](https://sqllineage.readthedocs.io/)

### Graph Rendering Library
- Uses **NetworkX** (Python graph library) for lineage storage
- DiGraph for table-level lineage representation
- Unified DAG for both table and column lineage

### Column-Level Lineage
- Available via CLI with `--level column` option
- Python API: `result.get_column_lineage()` returns `List[Tuple[Column, Column]]`
- Visual representation available via `--graph-visualization` toggle

### Key Features
- Powered by sqlfluff and sqlparse parsers
- Multi-dialect support (ANSI, Teradata, Snowflake, etc.)
- SQLAlchemy integration for metadata retrieval

### Alternative - LineageX
- One-liner Python library creating interactive webpages
- Column-level lineage extraction from SQL queries

### Sources
- [SQLLineage GitHub](https://github.com/reata/sqllineage)
- [SQLLineage Column-Level Design](https://sqllineage.readthedocs.io/en/latest/behind_the_scene/column-level_lineage_design.html)
- [OpenMetadata SQLLineage Fork](https://github.com/open-metadata/openmetadata-sqllineage)

---

## 7. OpenMetadata

**GitHub Repository**: [https://github.com/open-metadata/OpenMetadata](https://github.com/open-metadata/OpenMetadata)
**Documentation**: [https://docs.open-metadata.org/](https://docs.open-metadata.org/)

### Graph Rendering Library
- **React Flow** (now @xyflow/react) for node-based UI
- Custom edge types defined in codebase
- React-based frontend with TypeScript

### Table/Column Visualization
- **Column layer enabled by default** (as of v1.4.0)
- Can cause usability issues with 20-40+ columns per table
- No-code drag-and-drop editor for lineage
- Supports tables, topics, pipelines, dashboards, ML models, containers

### Bidirectional Lineage
- Configurable upstream/downstream node display (up to 3 levels each)
- Nodes per layer configuration
- Lineage details include SQL query, pipeline info, and column lineage

### Performance Considerations
- [GitHub Issue #16404](https://github.com/open-metadata/OpenMetadata/issues/16404): Large column counts (20-40+) make lineage graph difficult to use
- Lineage view supports multiple exploration layers

### Key Features
- Manual lineage editing via no-code editor
- SQL parser-based column lineage extraction
- Service, domain, and data product layers

### Sources
- [OpenMetadata GitHub](https://github.com/open-metadata/OpenMetadata)
- [Explore the Lineage View](https://docs.open-metadata.org/latest/how-to-guides/data-lineage/explore)
- [Column-Level Lineage Documentation](https://docs.open-metadata.org/latest/how-to-guides/data-lineage/column)

---

## 8. Spline (Apache Spark Lineage)

**GitHub Repository**: [https://github.com/AbsaOSS/spline](https://github.com/AbsaOSS/spline)
**Documentation**: [https://absaoss.github.io/spline/](https://absaoss.github.io/spline/)

### Architecture
- Spline Spark Agent (Scala library in Spark driver)
- Spline Server (Producer/Consumer APIs)
- ArangoDB for storage (graph database)
- Web UI for visualization

### Lineage Capabilities
- Automatic lineage capture from Spark SQL execution plans
- Fine-grained column-level lineage
- Multiple detail levels: data source, operation, computation

### Key Features
- No code modification needed for existing ETL
- Uses QueryExecutionListeners to capture plans
- Supports OpenLineage integration

### Sources
- [Spline GitHub](https://github.com/AbsaOSS/spline)
- [Capital One - Capturing Data Transformations with Spline](https://www.capitalone.com/tech/software-engineering/spline-spark-data-lineage/)
- [AWS - Build Data Lineage with Spline](https://aws.amazon.com/blogs/big-data/build-data-lineage-for-data-lakes-using-aws-glue-amazon-neptune-and-spline/)

---

## Summary: Graph Library Comparison

| Tool | Primary Library | Layout Algorithm | Column Display |
|------|-----------------|------------------|----------------|
| **Apache Atlas** | D3.js + Dagre | Dagre (directed) | On column browse |
| **Marquez** | D3/d3-dag, React | d3-dag | Linked to table definition |
| **DataHub** | visx (React VX) | Custom | Expand table to show |
| **Amundsen** | React Flow (internal) | N/A | Upstream/Downstream columns |
| **dbt-docs** | Cytoscape.js | Dagre | Expand column cards |
| **SQLLineage** | NetworkX | DiGraph | CLI option |
| **OpenMetadata** | React Flow | Custom | Default expanded (v1.4+) |
| **Spline** | Web UI | Graph DB | Multi-level detail |

---

## Key UI Patterns for Column-Level Lineage

1. **Progressive Disclosure**: Start with collapsed table nodes; expand on demand to show columns
2. **Selective Highlighting**: When column selected, highlight its specific lineage path
3. **Filtering Options**: Show only relevant columns and dependencies
4. **Neighborhood View**: Show only immediate connections, expand progressively
5. **Distance Indicators**: Display "hop" count from selected asset
6. **Color Coding**: Distinguish transformed, passthrough, and renamed columns

---

## Performance Optimization Strategies

1. **Downsampling**: Limit displayed relationships for nodes with 100+ connections (DataHub approach)
2. **Virtualization**: Render only visible elements, dynamically add/remove during pan/zoom
3. **Lazy Loading**: Load lineage data on demand as user explores
4. **Depth Limiting**: Default to 3-5 levels, allow manual expansion
5. **Time-based Filtering**: Filter lineage by time windows
6. **Graph Algorithms**: Use dynamic graph analytics for complex lineages rather than full visualization

---

## Recommendations for React Flow + ELKjs Implementation

Based on the research, the following patterns align well with your tech stack:

1. **React Flow + ELKjs** provides:
   - Native React integration
   - Highly configurable layered layout algorithm
   - Support for ports (useful for column-level connections)
   - Async layout computation

2. **Table Node Design**:
   - Implement collapsible table nodes (follow DataHub/OpenMetadata pattern)
   - Use React Flow's custom node feature for table rendering
   - Consider showing column count badge when collapsed

3. **Column-Level Visualization**:
   - Use handles/ports on columns for precise edge connections
   - Implement hover highlighting for column lineage paths
   - Add filter functionality to focus on specific columns

4. **Performance**:
   - Implement depth limiting (default 3 upstream/downstream)
   - Add downsampling for high-cardinality nodes
   - Use React Flow's built-in viewport culling
   - Consider lazy loading for large graphs

### Sources
- [React Flow ELKjs Examples](https://reactflow.dev/examples/layout/elkjs)
- [React Flow Auto Layout Overview](https://reactflow.dev/learn/layouting/layouting)
- [Building Complex Graph Diagrams with React Flow and ELK.js](https://dtoyoda10.medium.com/building-complex-graph-diagrams-with-react-flow-elk-js-and-dagre-js-8832f6a461c5)
- [yFiles Large Graph Performance](https://docs.yworks.com/yfiles-html/dguide/advanced/large_graph_performance.html)
