# Onix data model & functionality notes

Integrator-oriented notes on the Kros **Onix** ERP, to complement the raw
OpenAPI spec ([V1.json](./V1.json)).

**Sources & method.** Derived from (a) the OpenAPI/Swagger `V1` spec, (b) Kros's
official support center — [Web API docs](https://onix.kros.sk/externe-prepojenie/web-api-dokumentacia/),
[Doklady](https://onix.kros.sk/doklady/), [Sklad](https://onix.kros.sk/sklad/),
[ONIX product](https://www.kros.sk/onix/) — and (c) read-only probing of the
the shared demo DB on 2026-05-29. Items marked _(observed)_ come from live
data; _(docs)_ from the support center; the rest from the spec. Workflow/validation
rules not exposed by the API are flagged as **unverified**.

---

## 1. Deployment & access model _(docs)_

- Onix is a **Windows desktop ERP**. The Web API is a local companion service,
  normally reached at **`http://localhost:50803/`**, operating on the app's local
  database. `http://195.146.148.139/ONIX_API/` is Kros's shared **demo** server
  (what this repo's `.env` points at).
- **`DatabasePath`** (required header on every call) **identifies the target Onix
  database**. Its form depends on the Onix version:
  - **Newer versions** run against a **local PostgreSQL server installed alongside
    the app** on the host machine — so `DatabasePath` is effectively a **database
    identifier/name**. The demo `API_DATABASE_PATH` value is a short DB-style name
    (not a file path), consistent with this. _(maintainer note — most likely the
    relevant case here.)_
  - **Older / file-based versions** used a **filesystem path to the `.ndb` file**,
    e.g. `C:\ProgramData\ONIX\Data\KROS\KROS.ndb` (shown in the program's "Database
    information" tab) — this is what the support-center API page documents.

  Either way it's an opaque header string the consumer supplies; the client treats
  it as such, so this distinction doesn't affect integration code.
- **Token** = generated inside Onix (Settings → My program → Users → generate),
  per user + company, full-admin user. Sent as `Authorization: Bearer <token>`.
- The API is a **sync/integration surface**, not the whole app — reports, printing,
  accounting postings, inventory UI, eKasa, etc. are app features with no API.

## 2. Entity graph

```
Partner ──(snapshot embedded into)──► Document (header)
                                         │  belongs to a documentTypeId (evidence)
                                         │  has a Document_State (per type)
                                         ▼
                                      Document Item ──► StockItem (Id_Stock_Items / Stock_Items_Ns_Number)
                                         │            └► Stock     (Id_Stocks / Stock_Code)
                                         ├─ Id_Source_Document / Id_Linked_Item  (doc-to-doc traceability)
                                         ├─ Id_Item_Ancestor + Is_Composite/Is_Sub_Item  (bundles "skladačky")
                                         ├─ batch: Serial_Number, Date_Manufacture, Date_Expiration, Properties_Text
                                         └─ accounting: Account_Md_* (debit) / Account_Dal_* (credit)

StockItem ──► StockItemBalance[] (per Stock)  ·  Groups · Params · Codes(EAN) · Accessories · Alternatives · Suppliers(Partners) · MeasureUnits
Stock (warehouse)        InternalAccounting (1–6, tree)        PricingLists (partner / partner-group / catalog)        BatchProperties (+values)
```

Key point _(observed)_: relationships are carried **both** as internal FKs
(`Id_Stock_Items`, `Id_Stocks`, `Id_Source_Document`, `Id_Linked_Item`,
`Id_Item_Ancestor`) **and** as business keys (`Stock_Items_Ns_Number`,
`Stock_Code`). On write, matching uses the business keys / `Guid_Ext` (see §6).

## 3. Documents (Doklady)

Documents are grouped into **evidencie** (document types, the `documentTypeId`
path param) across three **business cycles** (`BussinesCycleName`) _(observed via
`/documents/types`, names _(docs)_):

- **Predaj (Sales):** Ponuka, Objednávka, Predfaktúra, Faktúra k zálohe, Faktúra
  (vyúčtovacia), Výdajka, Dodací list, Dobropis, Vrátené od zákazníka.
- **Nákup (Purchase):** Odoslaná objednávka, Došlá faktúra, Príjemka, Došlý
  dobropis, Vrátené dodávateľovi.
- **Sklad (Warehouse):** Začiatočný stav (opening balance — required first each
  year), Spotreba, Prebytok, Manko, … (stock movements).

Per-type IDs (e.g. Faktúra = `1000016`, Objednávka = `1000013`, Príjemka =
`1000022`) are **per-database data**, fetched from `GET /documents/types` — do not
hard-code across databases.

**States** _(observed)_: each type has its own state set (`GET
/documents/{type}/states`) — e.g. Faktúra has 7 (Vytvorená/"Created" …), Objednávka
has 5 (Dodané/"Delivered", `IsAutomaticState: true`). States can be manual or
**automatic** (set by workflow triggers). Set via `POST .../states`.

**Header** _(observed, ~90 fields)_: number triple `Ns_Number`/`Ns_Code`/
`Ns_Evid_Code`; an **embedded partner snapshot** (`Partner_*`, with `Partner_Pa_*` =
permanent address and `Partner_Da_*` = delivery address); many dates
(`Date_Document`, `Date_Due`, `Date_Vatrate`, `Date_Delivery_Date`, `Date_Receive`,
`Date_Validity`, …); payment block (`Iban`, `Swift`, `Variable_Symbol`,
`Payment_Status`); dual currency (`Sum`/`Sum_Vat` in `Curr` vs `Sum_Lc`/`Sum_Vat_Lc`
in local currency + `Exchange_Rate`); `Lock`; `Total_Price_Calculation`; `Guid_Ext`.

**Workflow rules** _(docs; some unverified):_ order→invoice conversion; **linked
documents** (`prepojený doklad`, surfaced as `Id_Source_Document`/`Id_Linked_Item`
on items) give traceability and drive stock movements; **bulk lock/unlock**
finalizes documents (a locked doc can't be edited; lock is one-way per spec);
**reservations** prevent over-selling. Saving a document with `Items` **replaces all
existing items** (per spec).

## 4. Warehouse (Sklad)

- **StockItem** `Type`: `1` card (skladová karta), `2` service, `6` equipment.
  Cards can be **composites/bundles** (`Is_Composite`, sub-items via
  `Id_Item_Ancestor`). Fields _(observed)_ include accounting accounts
  (`Account_Stock_Syn/Anl`, `Account_Issue_*`, `Account_Recive_*`, `Account_Profit_*`),
  `Default_Price` (ex-VAT) vs `Default_Price_Vat`, `Managerial_Price(_Type)`,
  measure unit (`ks` = pcs), `Product_Code`/EAN.
- **Stock** (warehouse) has `Stock_Type` and `Valuation_Type` (1 = weighted average,
  2 = FIFO).
- **Balances are derived from document movements** _(docs)_ — there is no "set
  balance" endpoint; you post príjemka/výdajka/prevodka documents and read balances
  via `GET /stockitems/balances` / `propertyBalances`. Opening balances seed the year.
- **Batches / serial numbers** tracked on items via `Serial_Number`,
  `Date_Manufacture`, `Date_Expiration`, `Properties_Text` (+ `BatchProperties`).
- **Pricing**: `PricingLists` link items to partners / partner-groups / catalogs.
  Suppliers attach to a card via its `Partners` sub-table.

## 5. Partners

Identity: `Name`, `Reg` (IČO), `Tax` (DIČ), `Vat_No`, `Partner_Type`, `Vat_Payer`.
Sub-tables _(observed)_: `Addresses[]` (typed — billing/delivery, with
`Is_Default_For_Type`), `BankAccounts[]` (IBAN/Swift), `Contacts[]` (each with nested
`ContactsData[]`). Used as customers (Predaj) and suppliers (Nákup).

## 6. Identity, matching & conventions

- **IDs:** internal `IdRecord` (int64) + business number triple `Ns_Number` (+
  `Ns_Code` + `Ns_Evid_Code`) + optional external `Guid_Ext`. `RecordExternalIdentificator`
  is **your** import id, echoed back in the `Result`.
- **Upsert matching** (`POST` = add-or-edit): the server locates an existing record
  by `Ns_Number` (+ `Ns_Code`/`Ns_Evid_Code`) or `Guid_Ext`; found ⇒ update, else
  insert. `Result.Result` reports the outcome (0 added · 1 + warnings · 2 + errors ·
  3 not added) — **HTTP 200 even on failure** (use `isOk`/`assertOk`).
- **Booleans are encoded `-1` (true) / `0` (false)** _(observed:
  `Is_Postcard_Address: -1`, `Inactive: 0`)_ — NOT `true`/`false` for the
  integer-typed flags.
- **Accounting (double-entry):** items carry `Account_Md_*` (Má dať / debit) and
  `Account_Dal_*` (Dal / credit), split synthetic (`_Syn`) + analytic (`_Anl`).
- **Dual currency** everywhere: foreign (`*`) + local (`*_Lc`) + `Exchange_Rate`.
- **VAT** via `Vat_Rate_SysCode` string codes; rates changed 2025 ("20"→"23",
  "10"→"19", new "5"; plus "0"/"N"/"P"). `prenos daňovej povinnosti` = reverse charge.

## 7. Confidence & open questions

**Confident** (spec + observed): the HTTP contract, DTO shapes & field names, the
entity graph and FK wiring, pagination, identity/matching, the `-1/0` boolean and
dual-currency/accounting conventions.

**Documented but not API-verified:** exact state-transition triggers, order→invoice
conversion mechanics, reservation/locking side-effects, composite (bundle) expansion
on stock movements.

**Unknown / out of band:** validation rules (the spec marks almost nothing
required, but a real document needs a partner, valid stock refs, etc. — surfaced only
as `Result` errors); per-database enum catalogs (type IDs, state IDs, account
numbers); deep Slovak accounting/Intrastat/Omega-sync rules; and all GUI-only
features (reports, printing, postings, inventúra).
