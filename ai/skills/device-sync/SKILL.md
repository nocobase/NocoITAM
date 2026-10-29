---
name: device-sync
introduction:
  title: MDM review
scope: SPECIFIED
description: When the devices a device management platform (MDM, such as Intune or Jamf Pro) reports do not match the register, explain the differences for IT, find the register device an ambiguous record should be linked to, and organize a batch of devices not on the register into one plan for the user to confirm. Use when the user asks "why has this device gone silent" or "what do I do with these extra devices in MDM", or starts from the device page's "Management platform" group, the MDM review page, or the "MDM review" to-do.
tools: []
---

# MDM review

**You do not compute the differences.** Every day the system pulls the device list from each connected MDM, links it to register devices by serial number, and then applies rules to work out what does not match: a device in use that has not synced for a long time (Silent), a platform primary user who is not the person the register assigns the device to (Other user), a device the register says is not in use that is online (Status differs), a device on a platform but not on the register (not on the register), and a device in use that should be managed but is on no platform (Unmanaged). The MDM review page (three tabs: "Mismatched", "Only in MDM" and "Only on the register"; the ones kept off the register open from "Only in MDM"), the device page's "Management platform" group and the "MDM review" to-do show this result, and users can settle all of it with the buttons themselves.

So your job is the few things the pages cannot do: **explain** what most likely lies behind a difference, **find evidence** for which device an ambiguous record should be linked to, and **organize a batch** of devices not on the register **into one plan**. Do not read back what the page already shows, and do not make the user's decisions — every step you propose waits for their confirmation.

## 1. Get the data first

- **One device**: a conversation started from the device page carries this device in the page context (`devices` and its id). Use `itam device-sync review --device-id <id>` to get its records on each platform (`platformRecords`) and its differences (`differences`), and `itam record get devices <id>` to see its status, who it is assigned to and its recent history.
- **One kind of difference**: `itam device-sync review --view checks` (Mismatched), `--view unregistered` (Only in MDM, that is, not on the register), `--view unmanaged` (Only on the register, that is, Unmanaged), `--view exempted` (Not to be managed: devices in use marked by hand as staying out of MDM, with the reason), `--view ignored` (Kept off the register: those marked by hand as kept off the register, and personal devices the review rules ignore).
- If it returns `connected: false`, no MDM is connected yet: tell the user an administrator connects one under "Settings → MDM", or configures it in the server's config.yml. Do not invent differences.

The same device may be in both Intune and Jamf (common for Macs), so it has two platform records. Judge by the one with the **later last sync**; the differences are computed from it too.

## 2. Explain a difference (the most likely cause first, then how to check it)

- **Silent** (`stale`): a device in use has not synced for longer than the silent threshold in days, or the platform no longer reports it. Look at the history first: was it recently sent for repair, lent out, or passed to someone else? Then look at the platform record's last sync time and primary user. Common causes: left switched off in a drawer, the employee is on long leave, the device is lost but not recorded, or it was reinstalled and never enrolled in MDM again. Suggest the user contact the person using it or its owner to confirm. If it is confirmed lost, use "Mark lost" on the device page; if it is confirmed returned, record the return. You do **not** propose marking it lost yourself — a person has to check first.
- **Other user** (`userMismatch`): the platform primary user (`personId` / `userName`) differs from the person the register assigns the device to. Common causes: the device was handed to a colleague without a transfer on the register, the last person to sign in to a shared computer was taken as the primary user, or an employee set up a device for someone else with their own account. Be able to say which one it is: check whether the primary user and the register's user are in the same department, and whether the platform record's enrolment time is after the assignment. If the user confirms the device really changed hands, put a `transfer_device` step in the plan that transfers it to the platform primary user. If it is a shared device or a temporary sign-in, tell them to click "Ignore" on the device page (the register is right) — you do not put this step in the plan.
- **Status differs** (`statusMismatch`):
  - The register says "In stock" but it is online: someone is using it. If the platform has a primary user, confirm, then assign it to them with `assign_device`.
  - The register says "Lost" but it is online: it has been found. Suggest the user first confirm who has it, then use "Restore to stock" on the device page, or assign it directly.
  - The register says "Disposed", "Pending disposal" or "Retired" but it is online: there may be a data security risk (a disposed device should not still be able to sign in to company accounts). Explain the risk and suggest checking and acting in MDM at once (an administrator locks or wipes it on the platform; this system cannot and will not do it for them). Nothing needs to change on the register.
- **Unmanaged**: a device in use is on no MDM and needs to be enrolled on the platform side. This system cannot enrol it for them; only say which devices they are and who has them. For devices that really should not be in MDM (for example Linux workstations, or lab devices that are not on the network), propose "Not to be managed" with `exempt_device`, with `reason` stating which kind it is, for the user to confirm and carry out. If the device later appears in MDM, the mark lapses automatically. Do not propose the ones you are unsure of; list them and ask the user to confirm.

## 3. Devices not on the register (organize the whole batch into one plan)

Judge each one. Each is exactly one of these three:

1. **Register**: when the platform's model matches a register model (`suggestedModelId`; if it does not, try `itam model match --text "<manufacturer model>"` once), create the device with `create_record`: `collection: "devices"`, with the serial number (`serialNo`), the name (the platform device name), the model, the location (`locationId`, required — if you do not know where it is kept, ask the user, or use the primary user's office location) and the ownership (`owned` for a company device). Once it is created, the system links the platform record to it by serial number automatically. If the platform has a primary user (`personId`), put `assignTo: { targetType: "person", targetId: <personId> }` in the same step's `input`, so it is assigned to them as it is registered, with no separate `assign_device` step. List the ones whose model cannot be matched at all, and ask the user to create the model first (Reference data → Models); **you do not create models**.
2. **Link to a device**: a serial number shared by several register devices (`matchState: "ambiguous"`, with the candidates in `candidates`); a register device with the same name but a different serial number (`sameNameDevices`, usually a replaced motherboard or a mistyped serial — look at it first and **do not register it**, or there will be a duplicate device); or the user says it is a particular device already on the register. Propose `link_managed_device` only when the evidence is strong: exactly one candidate's user is the platform primary user, or its name and number match. Otherwise list the candidates with the evidence for each, and ask the user to choose.
3. **Keep off the register**: clearly not company assets, or not meant for the register — test virtual machines, build servers, contractors' devices, machines whose serial is a placeholder value (such as To be filled by O.E.M.). Propose it with `ignore_managed_device`, with `reason` stating clearly which kind it is, in the language the request names. Do not include the ones you are unsure of; ask about them separately.

Personal devices (employee-owned) do not appear here by default. They appear only when the user has turned off "Ignore personal devices". Do not register these devices unless the user explicitly asks.

## 4. How to state the conclusion

Start with two or three sentences: how many differences or how many devices not on the register, what each one is, and which matter most (disposed or lost devices that are online come first). Then propose everything that can be done in one plan. List what is not in the plan (what needs a person to check, what you are unsure of) separately in the conversation, and say why.

## 5. What you do not do

- Do nothing to MDM (lock, wipe, change the primary user): this system only reads the platforms.
- Do not "Mark lost" for the user: a person has to check first. Propose ignoring a difference (the register is right) with `dismiss_device_difference` only when the evidence is strong (for example, the primary user in MDM is clearly an IT account that enrolled the device on someone's behalf), state the reason, and let the user confirm and carry it out. List the ones you are unsure of for the user to decide.
- Do not create models, manufacturers or people.
- Do not register personal devices as company assets unless the user explicitly asks.
