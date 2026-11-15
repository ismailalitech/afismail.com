+++
title = "Updating a running device: where the 5.5 seconds go"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "How long a device is down while it installs a signed image, what the staging does to the task set while the system is still up, and what it took to make the update path work on this port."
weight = 30

[params]
  lab = 16
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Intermediate"
+++

After this module you can split a secure firmware update into the part that runs with the system up and the part that runs with it down, say what each costs on this board, and predict the downtime for an image of a given size. The measurements come from two experiments on the STM32H573I-DK: exp9aa measures the downtime of a complete update, and exp9q measures what the staging does to a running task set.

## Before you start

- **Level: Intermediate.** You should know what a signed image and a bootloader are. The staging reuses the flash effects described in [what a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/), so read that page first or keep it open.
- **Words used.** The *staging slot* is the flash area that receives the new image. *Swap* means MCUboot exchanges the two slots through a scratch area, so the old image can be restored. *Overwrite-only* copies the new image over the old one and gives up the restore. *Downtime* is the time from the reboot request to the first Non-Secure instruction of the next boot.
- **Tools:** the board and a host that stamps every console line with its own clock.

## The idea

An update has two phases with very different costs for a real-time system.

1. **Staging, with the system up.** The running image writes a new signed image into the staging slot through the TF-M Firmware Update service. Hundreds of erases and tens of thousands of quad-word programs run on the Secure side while the application keeps its tasks going. The cost is not downtime but blocking: every write holds the PSA mutex, and a task of higher priority that uses TF-M waits for it.
2. **Reboot, with the system down.** The device resets, MCUboot verifies and installs the new image, verifies the result and starts it. Nothing of the application runs. This is the downtime.

The surprise of this measurement is where the downtime is spent: not in the swap alone, but in a bootloader that verifies two images in software before it lets any Non-Secure code run.

## On this board

### The update cycle

In exp9aa the running Non-Secure image copies its own signed image (header, body and trailer records, read from its primary slot) into the staging slot through the service, marks it for installation and reboots. MCUboot then verifies and swaps, or overwrites, and boots the "new" image, which accepts itself and stops. Two image sizes were measured: 23,088 bytes and 432,768 bytes (423 blocks of 1 KB).

### What the staging does to the task set

exp9q repeats the staging below the three-task periodic set of the other modules (TH at 2 ms, TM at 5 ms, TL at 23.1 ms, with TL as the updater). The Secure flash write is a 1 KB block per job; a full erase of the 576 KB slot is one call.

Two figures matter. A single 1 KB write holds the mutex for 2.34 ms. The erase of the whole slot inside the start call holds it for about 120 ms. The slot lies in the second flash bank, so unlike a write to storage in the first bank, nothing freezes the core: the release latency of the tasks stays at 9 µs or less throughout.

### What it took to make the path work

The update path did not work as shipped on this port. The runs show the steps:

- The firmware update partition did not build, because of a missing private include path, and every start call failed. The bootloader forces the second flash bank, where the image slots lie, to Non-Secure, while the Secure flash driver treats every address as Secure and did not allow the slot range, so the controller rejected the Secure erase. An opt-in change to the driver's device table (the slots allowed, bank 2 reached through the Non-Secure control register) fixed it.
- The Non-Secure region of the Security Attribution Unit must include the image's header. Without it, reading the header from the application faults. The first two update runs show it as a boot loop: the device restarted 70 and 48 times in a row without ever reaching an update call.
- The runtime flash driver must be allowed to write the primary slot's trailer. In the first run that completed, `psa_fwu_accept()` returned -146 (a storage failure), and MCUboot would revert the image on the next boot. After the change it returns 0.
- The region for the Secure entry veneers had to hold more than TF-M's own veneers.

## How it is measured

The downtime is timed on the host. Every console line is stamped with the host clock, and the experiment prints three markers:

```text
T_NS_MAIN           first instruction of main after boot
T_REBOOT_REQUEST    just before psa_fwu_request_reboot()
T_ACCEPTED          after psa_fwu_accept() on the next boot
```

The bootloader's own lines fall between them, so the timeline of a reboot can be read directly. The calls of the update service are timed by the cycle counter and printed as `FWU,<step>,<cycles>`. For the task set, exp9q uses the same hardware-timestamped releases as the other modules and four cases: one 1 KB write per job, the same under a scheduler lock, the same with no TF-M user above the updater, and the full slot erase every 20th job.

## What you should see

Downtime, from reboot request to the next Non-Secure `main` (exp9aa):

| Image | Swap with scratch | Overwrite only |
|---|---|---|
| 23,088 bytes | 2.05 s | 1.79 s |
| 432,768 bytes | 5.50 s | 2.91 s |

A normal boot, with no update, takes 1.43 s with the small image and 1.74 s with the large one, from the bootloader's first line to the first Non-Secure instruction. TF-M's own boot is about 30 ms of that.

Where the 5.50 s of the large swap goes, from the host-stamped lines:

| Step | Time |
|---|---|
| Reboot request to the bootloader's decision to install | 0.10 s |
| Verifying the staged image | 0.85 s |
| Swapping the slots through the scratch area | 3.73 s |
| Verifying the image now in the primary slot | 0.79 s |
| Chain to the Non-Secure image | 0.03 s |

Each image costs about 0.6 s to verify plus 0.5 ms per KB, in software. The swap costs 8.6 ms per KB, because every sector passes through the scratch area three times; overwrite-only costs 2.6 ms per KB and gives up the restore. The staging writes themselves, 423 blocks in 1.01 s, run with the system up.

What the staging does to a running task set (exp9q, 2000 jobs of TH and 800 of TM):

| Case | TH misses | TM misses |
|---|---|---|
| One 1 KB write per job, preemptible | 146 (7 %) | 27 |
| The same under a scheduler lock | 76 (4 %) | 4 |
| The same with no TF-M user above the updater | 0 | 0 |
| Full slot erase every 20th job | 703 of 1593 | 679 of 800 |

The 2.34 ms write is longer than TH's 2 ms period, so a TF-M user above the updater misses deadlines however the write is scheduled. If no TF-M user sits above the updater, nothing is missed. The erase blocks every TF-M user for about 120 ms, and TH's worst response in that case is 121 ms.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| Every update start fails | the slot range is not allowed in the Secure flash driver, or bank 2 is not routed to Non-Secure; see the steps above |
| The device restarts over and over and no update call appears | the application faults when it reads its own header, because the SAU region starts at the code and excludes the header; enable the region that includes it |
| The update installs and then reverts after one boot | `psa_fwu_accept()` failed, as with the -146 of the first run, because the runtime driver could not write the trailer |
| The downtime is much larger than expected | the swap writes every sector three times; an overwrite-only configuration is about half of it, at the price of the restore |
| The staging misses deadlines of a high-priority TF-M user | the 1 KB write and the slot erase are blocking terms; the erase is a single call that holds the mutex for about 120 ms |

## Trade-offs and going further

- **Swap against overwrite.** For the 432,768-byte image the swap costs 2.6 s more downtime than overwrite-only, and in return the device can restore the old image. Whether that is worth it is a safety decision, not a timing one.
- **The bootloader decides the floor.** The two software verifications cost 1.4 to 1.7 s, which is also the recovery time of a fault (see [faults and recovery](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a02-faults-and-recovery/)). Making the bootloader faster shortens both.
- **A bound built from a calibration maximum can be exceeded.** The slot erase measured 119 to 149 ms across the recorded update runs, depending on the state of the flash. A bound built on one calibration run may therefore be too low.
- **Exercise:** predict the downtime of a swap update of a 200 KB image from the figures above (about 0.6 s per image of verification plus 0.5 ms per KB, and 8.6 ms per KB for the swap), then compare with the two measured sizes.
- **Exercise:** the 1 KB write holds the mutex for 2.34 ms and TH's period is 2 ms. Say what size of block would let a TF-M user above the updater keep its deadlines, and why that makes the staging take longer.

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **Status** | measured, STM32H573I-DK, isolation level 1 |
| **Read first** | [What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) |
| **Related** | [Faults and recovery](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a02-faults-and-recovery/); [Fixing the freeze](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s03-fixing-the-freeze/); [Mutex blocking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) |
| **Evidence** | exp9aa (update downtime): swap with scratch and overwrite-only, for the small and the large image, plus the runs that showed the header fault and the failed accept; exp9q (update under the task set): four cases, with the slots enabled |
