+++
title = "Removing the freeze and the slowdown: placement and port fixes"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "Both flash-write effects are properties of the TF-M port, and each has its own fix: keep the cache on to remove the slowdown, run the erase from SRAM to remove the Secure side's stall, or move the storage to the other flash bank."
weight = 30

[params]
  lab = 12
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can say which fix removes which effect of a storage write, what each fix leaves behind, and how to tell from a measurement whether a fix worked. You also meet the measurement mistake that hid the freeze for a while, and why a hardware timer was needed to see it.

## Before you start

- **Level 4.** Read [S01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) and [S02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s02-open-and-closed-window/). The two symbols used here are gamma (flash-resident code runs about 2 times slower while the instruction cache is off) and delta (the core freezes during a sector erase).
- **What you need to read the tables.** "Late" means a 1 ms hardware interrupt that arrived more than 50 µs after it should have. "Lost" means an interrupt that did not arrive at all because the freeze lasted into the next one.
- **Time:** the measurements take a few minutes each; the port changes are small.

## The idea

The two effects have different causes, so they have different cures.

- **gamma comes from the cache.** The driver switches the instruction cache off before every program and erase and on again after the invalidation. The cure is to leave the cache on and invalidate afterwards.
- **delta comes from the bank.** The Secure driver polls the flash busy flag while executing from the bank it is erasing, so its own instruction fetch stalls the core. Two cures: execute the erase sequence from SRAM, or erase a bank that the code is not executing from.

Every freeze observed on this platform is a flash operation in the bank the code executes from. That one sentence is the whole of delta.

## On this board

Three changes were built. The two on the Secure side are opt-in, so that the stock behaviour is unchanged when they are off.

| Change | What it does | Removes |
|---|---|---|
| Storage in bank 2 | PS and ITS move to the end of bank 2. The storage is made Non-Secure and written through the Non-Secure flash control register, with the Non-Secure SAU region extended to the end of flash | delta, for the operations moved |
| Cache kept on | the driver no longer disables the instruction cache across program and erase, and invalidates it afterwards | gamma |
| Erase from SRAM | the erase and quad-word program sequences, including the busy wait, run from a 1 KB SRAM section of the Secure image (a linker region, a copy-table entry and a shortened MPU region) | the Secure side's own stall |

The Secure-side patch (cache kept on, erase from SRAM) is about one hundred lines in total. A Secure erase of a bank-2 sector is rejected by the flash controller with a programming-sequence error, for a reason that was not determined, which is why bank 2 is written through the Non-Secure side. The run named `bank2_secure_erasefail` records it: "erase failed", then "Partition initialization FAILED".

## How it is measured

The measurement is the one of S01, repeated for each variant of the build so that the tables are comparable.

- **exp9i** (1 ms hardware interrupt, 2,000 interrupts per case, a probe from flash and a probe from SRAM) for the placement variants and for the port fix. Variants: `default` (stock), `bank2` (storage in bank 2, rollback counter still in bank 1), `bank2_norollback` (nothing left in bank 1) and `mitigated` (cache kept on, erase from SRAM).
- **exp9j** (vector table and handler in SRAM, 4 ms period, 1,000 interrupts per case) for the stock port and the mitigated port. The 4 ms period is needed to see stalls longer than 1 ms.

The measured quantities are the hardware latency of the interrupt (the timer counter read at handler entry), the number of late and lost interrupts, the flash probe slowdown, and the write duration.

## What you should see

### Placement: moving the storage to bank 2

Hardware latency of a 1 ms interrupt and probe slowdown while a lower-priority task writes storage (exp9i, 2,000 interrupts per row):

| Storage | Write | Latency, max (µs) | Late, over 50 µs | Flash probe slowdown |
|---|---|---|---|---|
| bank 1 (stock) | ITS, 512 B | 890 | 286 | 2.09 |
| bank 1 (stock) | PS, 512 B | 999 | 297 | 1.89 |
| bank 2, counter in bank 1 | ITS, 512 B | 0 | 0 | 2.12 |
| bank 2, counter in bank 1 | PS, 512 B | 986 | 157 | 1.91 |
| bank 2, nothing in bank 1 | ITS, 512 B | 0 | 0 | 2.11 |
| bank 2, nothing in bank 1 | PS, 512 B | 0 | 0 | 2.08 |

Three things follow. The ITS write with storage in bank 2 produces no late interrupt at all, and no lost interrupt, where stock produced one lost interrupt per write. gamma is unchanged: the driver still disables the cache, so the slowdown remains at 2.1. And PS kept freezing the core as long as its rollback-protection counter stayed in bank 1, stopping only when PS touched bank 2 alone.

![Fraction of 1 ms interrupts later than x while a lower-priority task writes storage, for ITS and PS, with the storage in bank 1 and in bank 2.](/images/tfm/fig4_latency_banks.png)

*The plateau between 30 and 600 µs is the per-quad-word program stall, and the tail is the sector erase. Moving the storage to the other bank removes every stall of the operations moved.*

### Port fix: cache kept on, erase from SRAM

Stock and mitigated port, ITS and PS writes of 512 bytes:

| Measurement | Stock | Mitigated |
|---|---|---|
| Flash probe slowdown, ITS (exp9i) | 2.09 (max 2.15) | 1.0004 (max 1.02) |
| Flash probe slowdown, PS (exp9i) | 1.89 (max 2.15) | 1.0001 (max 1.02) |
| Mean ITS write duration (exp9i) | 7.97 ms | 4.96 ms |
| Maximum interrupt latency, SRAM handler, ITS (exp9j, 1,000 interrupts) | 2,547 µs | 1 µs |
| Maximum interrupt latency, SRAM handler, PS (exp9j) | 2,744 µs | 1 µs |
| Interrupts later than 50 µs, ITS (exp9j) | 325 of 1,000 | 0 |

Keeping the cache on removes gamma entirely: the flash-resident probe runs at 1.000 during ITS and PS writes, the storage keeps working, and the ITS write is more than a third shorter (7.97 to 4.96 ms in these two runs), because the driver no longer pays a disable, invalidate and enable cycle around each operation. Running the erase from SRAM removes the Secure side's stall: a handler placed in SRAM, with the vector table in SRAM, runs on time through every erase, with a maximum latency of 1 µs over 1,000 interrupts per case, where the stock port shows 2.5 to 2.7 ms with a third of the interrupts late.

![Stock versus mitigated port while a lower-priority task writes ITS. Left: the flash-resident probe with the cache kept on. Right: latency of a RAM-resident Non-Secure interrupt with the Secure busy wait moved to SRAM.](/images/tfm/fig7_mitigation.png)

*Left: gamma disappears. Right: delta disappears for a handler that does not itself depend on flash.*

### What is left

Non-Secure code that is still in flash keeps its own stall. In exp9j with the mitigated port, the handler is on time, but a thread started by it begins up to 2.9 ms late (median 420 µs for ITS, maximum 2,899 µs). Closing that gap needs the whole Non-Secure release path, the handler, the scheduler and the thread, in SRAM. Three relocation variants were built with Zephyr's code relocation, and none of them boots: the control-loop runs (exp9m) named `mitigated_reloc`, `mitigated_reloc2` and `mitigated_reloc3` all end in a boot loop and a timeout, because the kernel and architecture code that performs the relocation copy cannot itself be relocated. This is left open.

### The measurement that was wrong

An earlier release latency of 148 µs was measured in a handler that was itself frozen: it ran late, and stamped the release late, so the delay it was meant to measure was hidden inside it. The hardware counter shows up to 890 to 999 µs at 1 ms (capped by the period) and up to 2.7 ms at 4 ms. The first figure was wrong by more than a factor of ten.

## When it goes wrong

| Symptom | Cause |
|---|---|
| Moving PS to bank 2 does not stop the freezes | its rollback-protection counter is still in bank 1: 986 µs maximum and 157 late interrupts remain |
| A Secure erase of a bank-2 sector fails at start-up | the flash controller rejects it with a programming-sequence error; write bank 2 through the Non-Secure flash control register instead |
| The SRAM handler is on time but the task it releases is not | the scheduler and the thread are still in flash; the relocation of those is the open item |
| gamma is still 2.1 after moving the storage | placement does not touch the cache; keep the cache on in the driver |

## Trade-offs and going further

- **Placement trades flash layout and protection for timing.** The storage becomes Non-Secure memory and the Non-Secure SAU region is extended to the end of flash, so the isolation that the Secure world gave the stored data is gone. Check that against your threat model before using it. It costs no execution time.
- **The port changes are small but they are changes to a security component.** They are opt-in, and each one removes exactly one effect, so they can be adopted separately and measured separately.
- **gamma is not delta.** An engineer who keeps the cache on and sees the 2 times slowdown vanish has not fixed the freeze, and one who moves the storage has not fixed the slowdown. Measure both after each change.
- **Exercise:** compare the two PS rows of the placement table and the ITS rows. What do they show about where PS keeps state that ITS does not, and why does that state decide whether the core still freezes?
- **Exercise:** the stock port gives 2,547 µs at 4 ms and 890 µs at 1 ms for ITS. Explain why the two maxima differ, and what you would see with a 10 ms period.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | measured on one board; the relocation of the Non-Secure release path is not solved |
| **Read first** | [S02 Who can preempt the write](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s02-open-and-closed-window/) |
| **Evidence** | exp9i (`default`, `bank2`, `bank2_norollback`, `bank2_secure_erasefail`, `mitigated`), exp9j (`default`, `mitigated`), exp9m (`stock`, `mitigated`, three `mitigated_reloc` boot-loop runs), all on the STM32H573I-DK with TF-M 2.3 |
| **Related** | [S01 What a Secure storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/); [M01 Hardware timestamps](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m01-hardware-timestamps/); [B03 Secure interrupts and the tick](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b03-secure-interrupts-and-the-tick/) |
