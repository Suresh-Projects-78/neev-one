# Payroll

Nothing here yet. This folder exists so payroll work has a home alongside the
other feature modules in `src/features/`.

Git does not track empty directories, so this file is what keeps the folder in
the repository. Delete it once there is real code here.

## How a feature module in this project is put together

- Screens and their pieces are `.jsx` files in this folder, one component per
  file, named for what they are (`InventoryModule.jsx`, `BankCashAccounts.jsx`).
- Tests sit beside the file they test, as `<Name>.test.jsx`.
- Server calls go through a wrapper in `src/api/`, not `fetch` in a component.
- A screen reaches the shell by a key in `src/App.jsx`'s render switch, and is
  listed in the settings registry only if it is a settings screen.
- Read `DESIGN.md` before any visual decision: tokens only, two radii, money is
  tabular and right-aligned, one primary action per screen.
