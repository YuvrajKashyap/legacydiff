# Private worker

This folder does slow work outside database updates: running Python, calling NVIDIA, loading source files, and creating ZIP downloads. The database still decides who has access, what was approved, which worker may finish a job, and which results to save. The frontend never imports these files.

Start reading here:

1. `main.ts` starts the worker, reports which files and models are ready, watches for cancellation, and takes one job at a time.
2. `bootstrap.ts`, `database.ts`, and `local-runtime.ts` set up the worker login, wait for allowed database records, and keep service addresses on this computer. Downloads use the caller's login instead.
3. `scenario-jobs.ts` handles the four scenarios. `jobs.ts` handles the original returns example. Both ask the database for a lease, meaning limited-time permission to finish a job. Database functions called reducers check that permission when results arrive.
4. `runner.ts` starts Python, limits its time and output, and stops any programs it started when work is cancelled. The Python code is in `../runner/`.
5. `http.ts` checks which decision the caller may see and creates its download. It never uses the worker's more powerful login to give a participant access.

`catalog.ts` lists reviewed files and available models for the original returns example. `evidence-config.ts` loads the saved source files and records where they came from. `../ai/index.ts` calls NVIDIA, checks whether a model works, and runs the original investigation. `../ai/suite-investigation.ts` reviews the four scenarios. `../ai/evidence.ts` downloads approved files at an exact Git version and checks quoted lines.

Keep access and approval rules in `../database/`, shared data shapes in `../../packages/contracts/`, and screens in `../../frontend/`. AI can suggest a policy, but it cannot approve one or replace results from actually running the programs.
