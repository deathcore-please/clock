# Home Assistant bridges

These bridges push `light.wipro_rgbcw_12_5w_bulb` and the complete
`todo.shopping_list` to the public dashboard without making Home Assistant
reachable from the internet.

## Install

1. Generate a long random value (at least 32 bytes) in a password manager.
2. In Cloudflare Pages, open **clock -> Settings -> Variables and Secrets**. Add
   `AMBIENT_WEBHOOK_SECRET` as a **Secret** with the random value, then redeploy.
3. Add this to Home Assistant's existing `secrets.yaml`:

   ```yaml
   clock_ambient_authorization: "Bearer YOUR_RANDOM_VALUE"
   ```

4. In Home Assistant, add the **Local to-do** integration if it is not already
   installed, and make sure the list used by the phone widget has the entity ID
   `todo.shopping_list`.
5. Merge [configuration.yaml](configuration.yaml) into the main Home Assistant
   `configuration.yaml`. If `rest_command:` already exists, merge only the child
   command instead of adding a second `rest_command:` key.
6. Merge both list items in [automation.yaml](automation.yaml) into
   `automations.yaml`.
7. In Home Assistant, select **Settings -> System -> Restart Home Assistant ->
   Check configuration**. Once the check succeeds, restart Home Assistant so the
   new REST command is registered. A YAML-only automation reload is not enough
   after changing `rest_command:`.
8. Turn the bulb on/off or change its colour. The clock should update on its next
   two-second poll. The five-minute heartbeat prevents an old state from living
   indefinitely; after 15 minutes without a push, the dashboard returns to black.
9. Add, complete, remove, or reopen an item in `todo.shopping_list`. Home
   Assistant immediately pushes the complete list. It also reconciles the list
   every 30 seconds so renames, due-date edits, description edits, and a request
   missed during startup are repaired automatically.

## Seed and verify the task bridge

The deployment must include the task-state D1 migration and the Cloudflare
Pages project must still have both the `AMBIENT_DB` binding and encrypted
`AMBIENT_WEBHOOK_SECRET` secret. From the project directory, apply all pending
migrations and redeploy before enabling the Home Assistant automation:

```powershell
npm.cmd run d1:migrate:remote
```

After Home Assistant restarts, the startup trigger performs the initial seed.
To seed immediately or retry a failed request manually:

1. Open **Settings -> Automations & scenes**.
2. Open **Push shopping list to clock**.
3. Open its overflow menu and select **Run actions**.

Then open this URL in a browser:

```text
https://clock-cln.pages.dev/api/tasks-state
```

It should return JSON containing `"status":"ready"` and the current incomplete
items from `todo.shopping_list`. If it remains unavailable, inspect the automation trace in
Home Assistant first. A successful trace must show `todo.get_items` followed by
`rest_command.push_clock_tasks_snapshot`; the latter should return HTTP status
`200`. Also confirm the deployed Cloudflare environment has the D1 binding and
secret, then redeploy after correcting either one.

The REST payload is a complete replacement snapshot, including both
`needs_action` and `completed` items. This makes the 30-second reconciliation
safe and repairs dropped or out-of-order event pushes.

The Route 37 commute view deliberately ignores this state and stays monochrome.
