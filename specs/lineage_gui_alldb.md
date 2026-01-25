# all database lineage view in GUI

## Purpose
Extend the current lineage GUI to support viewing lineage across an entire database and all databases in the connected Teradata instance.

## Requirements
- extend the existing lineage GUI to enable a database to be selected and all tables within that database to be displayed with their lineage
- provide a way to select all databases in the Teradata instance and display lineage for all tables
- ensure that the GUI remains performant and usable when displaying large amounts of lineage data
- implement pagination or lazy loading if necessary to handle large datasets
- update the GUI tests to cover the new functionality

## Success Criteria
- users can select a database and view lineage for all tables within that database
- users can select all databases and view lineage for all tables across the Teradata instance
- the GUI remains responsive and usable with large datasets
- all new functionality is covered by automated tests