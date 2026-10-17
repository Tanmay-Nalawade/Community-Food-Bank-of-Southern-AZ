# Importing the existing KeyCafe keys as vehicles

`keycafe-vehicles.csv` lists the keys already in the Food Bank's KeyCafe account. The import
script creates a vehicle in the app for each row marked `yes` and links it to that **existing**
KeyCafe key. No new keys are created in KeyCafe.

Run all commands from the app's folder on the server.

## 1. Fill in the spreadsheet

Open `imports/keycafe-vehicles.csv` in Excel, or any spreadsheet program.

| Column | What to do |
|---|---|
| `import` | `yes` to create a vehicle for this key, `no` to skip it. Spare keys are already set to `no`, because a spare belongs to a vehicle that has its own main key. |
| `keycafe_key_id`, `keycafe_key_name`, `keycafe_description` | From KeyCafe, for reference. **Don't change these.** |
| `year`, `make`, `model` | Pre-filled with a best guess from the KeyCafe name. Check each one, and fill in any that are blank. Make and model are required. |
| `license_plate` | **Required.** Each plate must be unique. |
| `current_mileage` | **Required.** The current odometer reading. The vehicle's first trip starts from it. |

Save it as **CSV** with the same file name. Keep the column names as they are.

If the KeyCafe keys have changed since this file was made, you can make a fresh one from the
live KeyCafe account. This replaces the file, so do it before filling it in:

```
docker compose exec -T app node scripts/export-keycafe-keys.js > imports/keycafe-vehicles.csv
```

## 2. Check it (changes nothing)

```
docker compose exec -T app node scripts/import-keycafe-vehicles.js - < imports/keycafe-vehicles.csv
```

The script checks every row against KeyCafe and the app, and lists any problem with its line
number. For example, a missing plate, a plate used twice, or a key that's already linked to a
vehicle. Fix them in the spreadsheet and run it again until it says **"Everything checks out"**.

## 3. Import

Run the same command with `--apply` at the end:

```
docker compose exec -T app node scripts/import-keycafe-vehicles.js - --apply < imports/keycafe-vehicles.csv
```

- **All or nothing:** either every `yes` row becomes a vehicle, or none do.
- **Renaming:** each linked key is renamed in KeyCafe to the app's format, for example
  `2010 Ford Transit (ABC1234)`. The fleet unit number at the start of the current names
  (like `2100 -`) isn't part of that format. If KeyCafe refuses a rename, the script lists that
  key. The vehicle is still linked, and the key keeps its KeyCafe name.
- **Running it again is safe.** Rows that were already imported (same key and plate) are skipped.
  You can fill in a few rows, import them, and add the rest later.

Without Docker, use `npm run import-keycafe-vehicles -- imports/keycafe-vehicles.csv` (add
`--apply` to import).

## 4. Afterwards

In the app, go to **IT Admin → API Status** and click **Check all keys**. Every imported vehicle
should show as **Verified**.
