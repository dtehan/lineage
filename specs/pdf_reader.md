# pdf_reader

## Purpose
Provide functionality to read and extract text from PDF files.

## Variables
FILE_PATH: $1
FILE_ACTION: $2  # "summarize" or "extract"

## Instructions

- **CRITICAL**: 
    - If `FILE_PATH` does not exist, do not proceed.  Before reading ANY pdf file, you **must** first check its file size using `ls -lh FILE_PATH` command.
    - if no `FILE_ACTION` is provided, default to "extract".

- **PDF Handling**:
    - If the PDF is larger than 500KB, do **NOT** us the `read_file` tool.
        - Instead, write and execute a Python script (using `pypdf` or `PyMuPDF`) to read `FILE_PATH` in chunks (max 5 pages at a time) and extract text from the PDF.
        - prefer using `uv` over `pip` for installing python packages.
        - `FILE_ACTION` the content incrementally to avoid context overflow.
    - If the PDF is 500KB or smaller, you may use the `read_file` tool to read `FILE_PATH` entire file at once.
    

- **Dependencies** Install any libraries that are necessary to perform the task in a virtual environment.

## Output
- write the `FILE_ACTION` results to a new file with the same name as the PDF but with a `.md` extension.
