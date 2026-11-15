+++
title = "What a fault costs: eleven faults, one answer of 1.5 seconds"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "How long the device is gone after a fault in either world, who handles the fault, and what a Secure integrity check costs the task set."
weight = 20

[params]
  lab = 15
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can say what happens to a TF-M system when a Secure partition or a Non-Secure thread faults, how long the device is unavailable, why the answer depends on the Non-Secure kernel's fatal-error setting, and how to size a Secure task that checks the Non-Secure image without breaking the task set. The first part is exp9ad, the second exp9ag, both on the STM32H573I-DK with TF-M at isolation level 1.

## Before you start

- **Level: Advanced.** You should know what the two worlds are and what a Secure call is ([TrustZone and PSA calls](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/)). For the second part, read [chunking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/): the integrity check is a chunked service.
- **Words used.** A *fault* is an exception the processor cannot continue from: a bad access, an undefined instruction, a call through a null pointer. *Containment* would mean that only the faulting partition is lost and the rest keeps running. *Recovery time* is the time from the fault until the first Non-Secure instruction of the next boot.
- **Tools:** the board, and a host that stamps every console line with its own clock.

## The idea

A real-time system has two questions about a fault: how far does it spread, and how long is the device gone. TF-M offers isolation between the Secure world and the application, so the natural hope is that a fault in a Secure partition stops that partition and nothing else.

At isolation level 1 there is no partition restart. The result of the experiment is uniform and plain: no fault is contained. Every fault, in either world, ends in a full reset of the device. What changes between cases is not whether the device resets but whether the reset happens at all, and that depends on who handles the fault.

## On this board

### The eleven faults

The experiment makes the system fault on request, in eleven ways. The last column is the recovery time with the Non-Secure kernel set to reset on a fatal error (exp9ad, one pass of all eleven cases): seconds from the fault to the first Non-Secure instruction of the next boot.

| Kind | Who faults | What it does | Recovery |
|---|---|---|---|
| S data access | Secure partition, while serving a call | writes to an unmapped address | 1.560 s |
| S undefined instruction | Secure partition | executes an undefined instruction | 1.499 s |
| S null function | Secure partition | calls through a null pointer | 1.534 s |
| S psa_panic | Secure partition | calls `psa_panic()` | 1.498 s |
| NS null function | Non-Secure thread | calls through a null pointer (address 0 is Secure) | 1.503 s |
| NS k_panic | Non-Secure thread | calls `k_panic()` | 1.527 s |
| NS write Secure SRAM | Non-Secure thread | writes to Secure memory | 1.499 s |
| NS read Secure flash | Non-Secure thread | reads Secure flash | 1.536 s |
| NS undefined instruction | Non-Secure thread | executes an undefined instruction | 1.506 s |
| NS write outside every region | Non-Secure thread | writes to 0xFFFFFFF0, outside every Non-Secure region | 1.501 s |
| NS bus fault | Non-Secure thread | writes to a reserved address in the Non-Secure peripheral region | 1.531 s |

### How long the device is gone

With the Non-Secure kernel configured to reset on a fatal error, all eleven faults recover, in 1.50 to 1.56 seconds (the table above; the image is 25 KB). The detection adds at most the 64 ms of a register dump. Nearly all of the 1.5 s is the bootloader verifying the images in software, the same cost that sets the downtime of an update (see [update downtime](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a03-update-downtime/)).

### Who handles the fault

The STM32H5 port sets a bit in the system control block at Secure start-up (`AIRCR.BFHFNMINS`) so that BusFault, HardFault and NMI target the Non-Secure state wherever they are raised. A bus fault inside the Secure partition therefore lands in Zephyr's fault handler, which prints "Exception occurred in Secure State" and applies the Non-Secure kernel's fatal-error policy. Zephyr's default policy is to halt. With it, a Secure data access fault leaves the device dead, with the Secure world stopped in the middle of the fault, and TF-M's own policy, a reset, never runs. In the study two of the four Secure faults ended this way.

UsageFault is banked, and every violation of the Security Attribution Unit is a SecureFault. The other Secure faults, and the Non-Secure accesses to Secure memory, reach TF-M directly, which resets without any console output.

So the Non-Secure kernel's fatal-error configuration is part of the Secure side's availability on this port. There are two ways to close the gap. One is `CONFIG_RESET_ON_FATAL_ERROR` in Zephyr, which is the setting that gave the eleven recoveries above. The other is an opt-in at Secure start-up that clears the bit, so that every bus fault from either world reaches TF-M; the device then resets whatever the Non-Secure policy is, and the Non-Secure kernel keeps only its banked faults, such as the undefined instruction.

## How it is measured

The device resets after every fault, so the experiment cannot keep its state in ordinary memory. A small structure is placed in `.noinit` SRAM, which survives a system reset, and it sequences the cases across reboots:

```c
struct recovery_state {
    uint32_t magic;
    uint32_t step;
    uint32_t kind;
    uint32_t ticks_before_fault;
};

static __noinit struct recovery_state state;
```

Every console line is stamped on the host with the host's clock, so the experiment is timed from outside the device. Three markers are used: the first Non-Secure instruction after boot, a line just before the fault, and a line on the next boot that names the fault it recovered from. The recovery time is the distance between the second and the third. The capture is told that fault dumps are expected and must not end it.

## What you should see

The recovery times are in the table of the eleven faults above. With Zephyr's default (halt) instead of reset-on-fatal, the runs record that a Secure data access fault, a Non-Secure bus fault and a Non-Secure undefined instruction all stop in Zephyr's fault handler and never recover, while the write outside every region, a SecureFault, resets in 1.52 s without console output. A check at isolation level 2, with the workload partition built as a PSA root of trust, gave the same outcome: all eleven recover, in 1.49 to 1.54 s.

### A Secure task that checks the Non-Secure image

The same availability thinking applies to something the Secure side does on purpose: measuring the integrity of the Non-Secure image. In exp9ag the partition hashes a 64 KB region of the image, one chunk per activation, and compares every full pass with the first. Two drivers are compared on the three-task periodic set used throughout this project (see [random task sets](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b04-random-task-sets/)):

- a chunk per **Secure timer interrupt**, which runs atomically and preempts every Non-Secure task;
- a chunk per **job of the lowest task**, through a service call, which is preemptible and holds the mutex once per chunk.

The detection latency of a change is the number of chunks in the region times the period of the driver.

![Detection latency of a change in the 64 KB image against the worst response of the 2 ms task, for chunks run from a Secure interrupt and for chunks run by a call from the lowest task. Filled markers: the 2 ms task misses deadlines.](/images/tfm/integrity-latency-vs-response.png)

*Faster detection costs the high task more response time. Open markers are the configurations in which it meets its 2 ms period (exp9ag).*

| Driver and chunk | Detection latency | Worst response of the 2 ms task | Its misses |
|---|---|---|---|
| Interrupt, 1 KB every 10 ms | 640 ms | 1643 µs | 0 |
| Interrupt, 1 KB every 2 ms | 128 ms | 1643 µs | 0 |
| Interrupt, 4 KB every 10 ms | 160 ms | 2479 µs | 9 of 2000 |
| Interrupt, 4 KB every 5 ms | 80 ms | 2477 µs | 24 of 2000 |
| Interrupt, 16 KB every 10 ms | 40 ms | 5928 µs | 915 of 2002 |
| Call, 1 KB per job | 1478 ms | 723 µs | 0 |
| Call, 4 KB per job | 370 ms | 1554 µs | 0 |
| Call, 16 KB per job | 92 ms | 4934 µs | 326 |
| Call, 64 KB per job | 23 ms | 18195 µs | 1141 |

The rule in the table is about slack. The chunk of an atomic handler must fit in what the tightest task has left after its existing blocking. Here that is the 2 ms period minus a bound of 1424 µs, about 575 µs. A 1 KB chunk takes 279 µs in the handler on average and fits, so a chunk every 2 ms checks the whole image in 128 ms for 14 % of the processor, with no miss. A 4 KB chunk takes 1.11 ms and misses at any period that was tried. Driven from the lowest task, a 4 KB chunk is a 1.1 ms blocking term that detects within 370 ms, and 16 KB breaks the 2 ms task. In every case the check reported no mismatch.

In nine of the ten cases the bounds of the model hold, at 0.94 to 0.997 of the observed worst case. The tenth is the 16 KB handler, which runs 4.4 ms atomically: there the observed worst case exceeds the bound (by 1 % for the 2 ms task, by 31 % for the 5 ms task). That case is far outside what the task set can carry, and the model was not built for it.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| The device stops and the console shows "Exception occurred in Secure State" | a bus fault in the Secure partition reached Zephyr's handler, and the default policy is to halt; set the reset-on-fatal option |
| The device resets with no console output at all | the fault was a SecureFault or a banked fault that TF-M handled; this is the designed path, not a fault of the log |
| A Non-Secure undefined instruction halts even after the bit is cleared at Secure start-up | UsageFault is banked and stays with the Non-Secure kernel; its policy still decides |
| The recovery time is about 1.5 s on every fault | expected: the time is the boot, and almost all of it is image verification in the bootloader |
| An integrity check misses deadlines at any period | the chunk is longer than the slack of the tightest task; shrink the chunk first, then raise the frequency |

## Trade-offs and going further

- **Nothing is contained, so availability is a boot-time question.** To shorten the 1.5 s, the boot must get shorter: the images are verified in software, and a smaller image or a faster check is the only lever. A faster reset does not exist at level 1.
- **Resetting is not always right.** A reset on every Non-Secure fault is the right default for a device that can restart; for one that must not restart while moving, it only moves the problem. This project measured the time, not the consequences for a given application.
- **The integrity check buys latency with frequency.** The chunk is set by slack, not by a utilisation budget. A smaller chunk at a higher rate detects as fast, and costs about the same fraction of the processor.
- **Exercise:** using the table, work out the detection latency of a 2 KB chunk every 2 ms, and decide from the 1 KB and 4 KB rows whether it is likely to fit in the 575 µs of slack. Say what experiment would settle it.
- **Exercise:** the bit that routes bus faults to the Non-Secure state is set by the port, not by TrustZone. Explain what a Secure bus fault would do if the port did not set it, and what the Non-Secure policy would then matter for.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | measured, STM32H573I-DK, isolation level 1 (one pass at level 2) |
| **Read first** | [TrustZone and PSA calls](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/) |
| **Related** | [Update downtime](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a03-update-downtime/); [A runaway client](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a01-secure-side-budget-and-identity/); [Chunking shapes blocking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/); [Limits and open questions](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x02-limits-and-open-questions/) |
| **Evidence** | exp9ad (fault recovery): eleven faults with reset-on-fatal, the default halt configuration, the bit cleared at start-up, and an isolation level 2 pass; exp9ag (integrity measurement): ten cases, with the interrupt driver and the call driver |
