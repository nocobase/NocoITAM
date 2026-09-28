# Upgrading a running installation to template beta.43

The source upgrade is merged. A database created by the previous release needs
three things done in this order, once per installation.

## 1. Re-home the authorization migration history

`@nocobase/app-plugin-authorization` split: three of its migrations moved into
new packages and two were retired. The migrator refuses to run while executed
history names a migration a participating package no longer ships, so those
rows are corrected first. There is no CLI command for a migration that changed
owner — `db:repair` realigns checksums, not package names.

```sql
UPDATE __nocobase_migrations
   SET package_name = '@nocobase/app-plugin-authz-default-access'
 WHERE name = '202608210002_create_default_access_rules';
UPDATE __nocobase_migrations
   SET package_name = '@nocobase/app-plugin-authz-sharing-rules'
 WHERE name = '202608210003_create_sharing_rules';
UPDATE __nocobase_migrations
   SET package_name = '@nocobase/app-plugin-authz-restriction-rules'
 WHERE name = '202608210004_create_restriction_rules';

DELETE FROM __nocobase_migrations
 WHERE name IN (
   '202608250001_repair_authorization_administrator',
   '202608250002_create_default_pages_permission_set'
 );
```

Back up the database first. The three rows keep their tables — the new
packages ship the same migrations under the same names, so re-homing stops
them from running a second time against tables that already exist.

## 2. Realign the checksums the plugin upgrade changed

```bash
pnpm db:repair --dry-run   # review
pnpm db:repair
```

Plugin sources changed between versions, and this application's permission-set
seed now writes encoded titles. Repair rewrites the recorded checksums; it
executes nothing.

## 3. Apply migrations and seeds

```bash
pnpm db:apply
```

This runs the new plugin migrations and
`202609230001_encode_permission_set_titles`, which rewrites permission set
titles into the encoded form the new authorization store reads. Without it
every read of the permission sets throws.

## Configuration

`config.yml` needs the notification channels as a name-to-configuration map:

```yaml
notification:
  channels:
    in-app:
      provider: in-app
```

The channel name is what the ITAM notifier addresses when it sends, so keep
`in-app` unless you also change `server/providers/itam/notifier.ts`.

## 4. The repairs an upgraded database needs

`pnpm db:apply` also runs the five migrations below. Each repairs state that
only an upgraded database carries — a fresh install never has it — and each
was checked against a copy of the live database before being applied to it.
Their `down` is deliberately empty where the reverse would restore the defect.

| Migration                                          | What it repairs                                                                                                                                                  | How it showed                                                                                                                                                                                                                               |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `202609230002_drop_stale_model_image_url_metadata` | An orphan `imageUrl` field in the `models` collection metadata                                                                                                   | The authorizer resolves a collection through its metadata, and a field with no column throws: every `main.models` decision came back `AUTHORIZATION_HANDLER_FAILED`, so reference names read `…` and `/api/itam/master/models` answered 403 |
| `202609230003_write_ai_collection_metadata`        | The AI plugin's tables had no metadata document (they were created before the store existed), and `ai_settings.default_llmservice` kept an older name conversion | Without a document the Repository infers every column as text, `updatedAt` is not sortable, and `/api/ai/aiConversations:list` answered 500 — the assistant panel could not open                                                            |
| `202609230004_drop_ticket_settings`                | `thresholds.ticketTimeoutHours` and the `numbering.ticket` rule, left in the stored settings when the ticket module was removed                                  | Both surfaced on the settings page with no label to render                                                                                                                                                                                  |
| `202609230005_repair_double_encoded_json`          | JSON columns written with an extra `JSON.stringify` after beta.43 made the query layer encode them itself                                                        | Reads parse defensively so nothing looked wrong, but a JSON condition can never match such a row                                                                                                                                            |
| `202609230006_normalize_legacy_datetimes`          | Datetime columns holding beta.22's epoch milliseconds beside beta.43's text                                                                                      | SQLite compares the two as text, so every legacy value sorted before every new one: the "in stock over 90 days" count read 1 instead of 6                                                                                                   |

`202609240001_move_operations_to_resources` followed a day later: it moves
this application's 28 business operations off the Collection grants and onto
the `itam.<collection>` resources declared for them, which is where beta.43
expects an operation to live. Until it ran, every one of those operations
answered 403 and its button was hidden.

The write sites behind the JSON and datetime migrations were fixed in the same change — the
services and seeds pass a JSON value rather than its text, and a datetime
comparison goes through `dbDateTime()`.

## 5. What the upgrade dropped and this application put back

- `cli/index.ts` came over from the template without the loader for
  `cli/dev-commands/`, which took `pnpm data:reset` with it. The loader is
  back, still behind the "running from source" check so a deployment never
  carries those commands.
