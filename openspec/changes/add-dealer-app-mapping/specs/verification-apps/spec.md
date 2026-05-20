## ADDED Requirements

### Requirement: Verification App Owns Its Dealers
Each verification app SHALL own a set of dealers. Dealers are created under a specific app and are not shared across apps. Deleting a verification app SHALL permanently cascade-delete all of its dealers.

#### Scenario: View dealers belonging to an app
- **WHEN** a TENANT_ADMIN views a verification app's detail
- **THEN** the system SHALL include a count of dealers registered to that app
- **AND** provide a link/filter to list those dealers

#### Scenario: Verification app deletion cascades to dealers
- **WHEN** a TENANT_ADMIN deletes a verification app
- **THEN** the system SHALL permanently delete all dealer records whose `verification_app_id` matches that app
- **AND** the deletion SHALL be enforced via `ON DELETE CASCADE` on the `dealers.verification_app_id` FK
- **AND** the API response SHALL confirm how many dealers were removed
