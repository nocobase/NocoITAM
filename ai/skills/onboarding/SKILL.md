---
name: onboarding
description: Before and after a new hire joins, get IT everything they should be equipped with. The system has already worked out from the onboarding kit what they should get, what they already have, which device, accessory or seat in stock can fill each item, and what is still missing. You explain it, propose it all as one batch for the user to confirm, draft purchase orders for the shortfall, and add what has to be done outside the system. Use when someone is joining, when the user asks "what do we need to prepare for someone who joins next week", or when the conversation starts from the person page's "Onboarding" card or the "Onboarding prep" to-do.
---

# Onboarding

**You do not decide what to provide, and you do not pick which unit to give.** The company has set standard kits by department and position (Reference data → Departments → Onboarding kits), and the system works out this person's onboarding from them: how many of each item, what they already have, **which device, accessory or entitlement in stock** can fill it, and how many stock cannot cover. The "Onboarding" card at the top of the person page's "In their name" tab shows this result, and users can complete all of it with the buttons themselves.

So your job is the few things the card cannot do: **explain**, **propose the actions as one batch**, **draft purchase orders for the shortfall**, and **the things outside the system**. Do not read back what the card already shows, and do not swap in a device you think fits better — the system picks devices that are in stock and not reserved, preferring the same location first and the longest warranty next; one you pick yourself may already be reserved by someone else.

**The suggestions may already include your own picks from the background.** When the onboarding owner clicks "Choose" on the card, you pick from the candidates for them in the background. Picks that are still free come first among the suggestions, with `source: "noco"` and the `reason` you wrote then; the onboarding plan's `advice` gives the status and summary of that pick. In the conversation, propose what the onboarding plan says, and where there is a `reason`, mention it briefly.

## 1. Get the onboarding plan first

A conversation started from the person page carries this person in the page context (`people` and their id); use that id to get the onboarding plan. If it is not there:

1. **The person**: look them up with `itam search people --q <name>`. If nothing is found, say so, and ask the user to create the person record first (name, department, position and hire date are required to match a kit); you may propose it in the plan with `create_record`, for the user to confirm. If there is **no hire date**, ask first — before the hire date you reserve, after it you assign, so the date decides what to do.
2. **Their onboarding plan**: `itam onboarding plan <person id>`. It returns the kit that applies and, for each item, what is prepared, suggested and short.

**Items marked not needed** (`waived: true`) are items the onboarding owner confirmed this person does not need, for example they brought their own monitor or got a different computer: do not propose them, do not buy them, and do not count them in "N of M prepared" (`waived` is the number of such items). When stating the conclusion, you may add "another K items marked not needed". When the user says they do not need an item, tell them to click "Mark as not needed" on that item in the "Onboarding" card; you do not mark it for them.

**No kit applies** (`kit` is empty): explain that neither their department nor their position has a kit, and no parent department has one either; suggest adding one under Reference data → Departments → Onboarding kits. **Do not put together a list yourself**, and do not equip them from the wording in the business guidance — the onboarding kit is what counts.

## 2. State the conclusion first

Say it in two or three sentences, then propose the actions:

- Which kit is used (the department default or one for a particular position), and the hire date
- N of M prepared: what they already have (assigned, reserved)
- What each suggestion fills an item with: the device number for a device, the name and quantity for an accessory, the entitlement name for software
- What stock cannot cover but will come in time (`planned`): a purchase order on its way (which order, and from which day it can be used, `availableOn`) or a return from a leaver (who, and from which day it can be used). These have no button now; assign them when they arrive
- The shortfall: what is missing, how many, and the latest day to order (`orderBy`; if that day has passed, say the order should be placed as soon as possible)

If you propose only the suggested part and say nothing about the shortfall, the user cannot tell whether you judged the shortfall or missed it.

## 3. Propose the actions

**Propose only the onboarding plan's suggestions**, all in **one** plan (the itam-work skill: `itam plan create`), not one device at a time. The suggestions have already been checked against stock and free seats; do not check them again with `itam availability`. The plan shows in the conversation as a card and is written only once the user confirms it. Whether they confirm it, reject it, or a step fails partway, you receive the result; report according to it.

- **Devices**
  - Hire date after today: a `reserve_device` step that reserves it for them (`reservedForType: person`), **until the hire date**. A reservation is not an assignment: the device stays in stock and is assigned on the day they join.
  - Already joined (hire date today or earlier): an `assign_device` step that assigns it to them directly.
- **Accessories, consumables, components**: an `issue_stock` step that issues them the quantity in the onboarding plan. Issuing before they join means the items have already been handed over; if the user wants to wait until the day they join, do not propose it yet, and say so in a sentence.
- **Software**: an `assign_seat` step. **You must pass both `holderType: person` and `holderId` (their person id)**. For a subscription also pass `account`, using the `account` that suggestion carries in the onboarding plan (their e-mail); if it has none, ask. If you pass only the account without `holderId`, the seat is recorded against the account and does not belong to them: onboarding does not count them as prepared, yet the seat is already taken.

After the plan is carried out, look at `itam onboarding plan` again and state N of M prepared from the new result. Do not compute it yourself.

## 4. Draft purchase orders for the shortfall

**Do not order again what is already on order.** The onboarding plan is computed together with all joiners (the earliest to join is served first): "New hire" purchase orders opened for them that have not arrived, and other purchase orders already placed that will arrive in time, are all counted; devices and seats returned by leavers are counted too. `orders` lists these orders (order number, status). Each item's `onOrder` is the quantity on purchase orders and `returning` the quantity being returned, and `shortfall` is only the part **nothing can cover**. If every `shortfall` is 0 and `orders` is not empty, do not draft anything: tell the user which order the shortfall is already on and how far that order has got (a "Draft" needs submitting for approval, "Pending approval" is waiting for someone, "Ordered" is waiting for delivery).

Where `shortfall` remains, **draft purchase orders by vendor**: combine one vendor's shortfall into one order and keep different vendors apart. Each order is one `create_purchase_order` step in the plan (it can be in the same plan as the actions above):

- Reason `newHire` ("New hire"), "Needed by" = the hire date, "Department" = their department. When one order covers several joiners, "Needed by" is the earliest hire date; if their departments differ, ask the user
- Lines: one line per shortfall, quantity = how many are missing. Devices and accessories go by model (`modelId`), with `itemType` taken from that item in the onboarding plan; software goes by software product (`softwareProductId`), with `itemType` `perpetual` or `subscription`; if it is empty in the onboarding plan, ask the user
- A shortfall where the kit names a **category** ("any laptop") has no model: first use `itam model match` or ask the user which model to buy. Do not decide for them
- **The vendor is required; judge it yourself first**: for devices and accessories, look at the vendors on that model's last few purchase orders (`itam search purchaseOrders`); for software, look at the vendors of the product's existing entitlements and purchase orders. Use what you work out directly, and state the evidence in the conclusion ("bought from X last time"). If nothing turns up, or several vendors appear and you are unsure, then ask the user
- If you do not know the unit price, leave it empty
- In the description, write the new hire's name and hire date, so the order can later be traced to the person it was opened for

A drafted purchase order is a draft. Submitting it for approval is still done by the user on the purchase order page.

## 5. What only a person can handle

Do not propose these. List them, and say what to do and whom to ask:

- **Accounts and permissions**: assigning a seat only records it on the register; it **does not open an account in the software itself**. For each piece of software assigned, write a sentence: which admin console to open their account in, and which group to add them to. The same goes for things outside the register, such as e-mail, door access and VPN.
- **Device preparation**: a reserved device usually still needs the operating system installed, software installed and an asset label attached before the hire date; remind the person responsible for devices.
- **On the day they join**: a reserved device must be assigned to them on their hire date; the "Onboarding" card then shows an "Assign" button. The "Onboarding prep" to-do keeps listing them until they are fully equipped.
- **The kit itself is wrong** (the position actually needs no monitor, a piece of software is missing): change it under Reference data → Departments → Onboarding kits. You do not change kits.
