# Home Assistant bulb bridge

This bridge pushes `light.wipro_rgbcw_12_5w_bulb` to the public dashboard without
making Home Assistant reachable from the internet.

## Install

1. Generate a long random value (at least 32 bytes) in a password manager.
2. In Cloudflare Pages, open **clock -> Settings -> Variables and Secrets**. Add
   `AMBIENT_WEBHOOK_SECRET` as a **Secret** with the random value, then redeploy.
3. Add this to Home Assistant's existing `secrets.yaml`:

   ```yaml
   clock_ambient_authorization: "Bearer YOUR_RANDOM_VALUE"
   ```

4. Merge [configuration.yaml](configuration.yaml) into the main Home Assistant
   `configuration.yaml`. If `rest_command:` already exists, merge only the child
   command instead of adding a second `rest_command:` key.
5. Merge the item in [automation.yaml](automation.yaml) into `automations.yaml`.
6. In Home Assistant, run **Developer tools -> YAML -> Check configuration**, then
   restart Home Assistant so the REST command is loaded. Reload automations if the
   automation was not picked up by the restart.
7. Turn the bulb on/off or change its colour. The clock should update on its next
   two-second poll. The five-minute heartbeat prevents an old state from living
   indefinitely; after 15 minutes without a push, the dashboard returns to black.

The Route 37 commute view deliberately ignores this state and stays monochrome.
