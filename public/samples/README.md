# Sample files

- `assets-import.csv` — try the CSV import wizard on the Assets page (models, locations, departments and vendors are matched by name; unknown names are reported per row).
- `delivery-note-20260908.pdf` / `.txt` — a delivery note for purchase-order receiving and the "parse document" AI capability (the `.txt` is the same text, for pasting).
- `quote-20261008.pdf` / `.txt` — a vendor quote in Chinese for AI capture on a new purchase order and for "parse document" on a draft's lines. Seven lines carry the part codes of seeded models (laptop, monitor, keyboard, mouse, toner, memory) or name a seeded software product (IntelliJ IDEA, a subscription); the Dell WD25TB4 dock is on no seed, so it comes back unmatched.
- `delivery-note-20261015.pdf` / `.txt` — the delivery note for that quote, for receiving by delivery document: serials for the laptops, monitors and docks, only 3 of the 5 docks (a partial delivery), and the subscription not shipped.
