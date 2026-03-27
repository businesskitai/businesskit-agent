# /jobs-manager — Post Job Listing

1. Ask: title, company, location, location_type (remote/onsite/hybrid), employment_type
2. Ask: description (required), requirements, salary range (optional), expires_at
3. `job.create({ title, company, location, location_type, employment_type, description, ... })`
4. Confirm: title, slug, company, status.

Applicants: `job.applications(jobId)` | Archive: `job.archive(id)`
