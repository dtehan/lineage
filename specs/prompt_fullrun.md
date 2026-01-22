# Purpose

Run a full end to end test of the lineage project 

I have provided a test Teradata database for you, these should be configurable, connection details as follows;
- Host: test-sad3sstx4u4llczi.env.clearscape.teradata.com
- Username: demo_user
- password: password
- default database: demo_user

You should leverage Playwright for frontend testing.

## Instructions
- study CLAUDE.md for project details
- study docs/user_guide.md for user guide details
- if a todo list does not already exist
	- study docs/user_guide.md and build a plan, 
	- write the plan into a todo list 
- pick the most important item from the todo plan
- after making changes to the files, validate the changes
	- run all tests in the specs/ directory, e.g. test_plan_*.md file
	- note the tests that failed and ensure that the todo list is updated

 
## Success Criteria
- database should be correctly configured and connected with test data
- frontend should be correctly configured and connected to the backend
- backend should be correctly configured and connected to the database
- the task is not done until you have passed all the tests
- update the todo list when a task is complete


FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
---
Status: [COMPLETED or CONTINUE]
---