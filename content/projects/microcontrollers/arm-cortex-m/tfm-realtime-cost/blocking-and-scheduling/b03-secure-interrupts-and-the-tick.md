+++
title = "Secure interrupts and the kernel clock: when Secure code runs and nothing else can"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "A periodic Secure interrupt is a top-priority task for the analysis, but a long handler also makes tickless Zephyr lose time, and the way TF-M handles the interrupt decides what the Non-Secure side sees."
weight = 30

[params]
  lab = 8
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can add a periodic Secure interrupt to a response-time analysis, predict how much kernel time a long Secure handler makes tickless Zephyr lose, explain why a long Secure call loses none, and choose between the three ways TF-M can handle a Secure interrupt. The two measurements that matter are these: with handlers of 16, 159 and 634 µs the bounds for the Non-Secure tasks hold at 0.98 to 0.99, and a 10 ms handler costs a kernel with a 1 ms periodic task 8.8 ms of its clock every time it runs.

## Before you start

- **Level 4.** Read [One mutex, one blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) and [Response-time analysis in one page](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/). Know the difference between a Secure **call** (made by a Non-Secure task, and preemptible by Non-Secure interrupts) and a Secure **interrupt handler** (entered from an interrupt, and not preemptible by anything Non-Secure).
- **Tools:** the STM32H573I-DK with the TF-M build. The Secure partition's timer (TIM7) is the interrupt source.

## The idea

A Secure interrupt handler is the one piece of Secure code that no Non-Secure code can interrupt. Three things follow for the analysis.

**1. It is the highest-priority periodic task.** A handler of cost C_s and period P is a task above every Non-Secure task and Non-Secure interrupt. Charge each task's response with ⌈R/P⌉ handler executions of C_s plus about 2 µs of entry and exit. A Non-Secure interrupt that arrives during a handler waits for it, so its release latency grows by the handler length.

**2. It lengthens the Secure calls it lands in.** If a handler fires while a lower task is inside a Secure call, the mutex is held for that much longer. The blocking a TF-M user sees is the call plus every handler that fired during it. The interference term above already charges those handlers, so no new term is needed. If you want the blocking as a number, the call length is a fixed point, because every handler that lands makes the call longer and so exposes it to the next one: S_eff = S + ⌈S_eff / P⌉ × C_s, solved by iterating from S_eff = S.

**3. It can make the kernel lose time.** Tickless Zephyr programs the 24-bit SysTick to the next kernel timeout, at most 2²⁴ / 240 MHz = 69.9 ms away, and a single flag records one expiry. If the SysTick exception is held off for longer than the programmed interval, every expiry after the first is lost. A handler of length L that starts a distance W before the next timeout therefore costs the kernel

```
lost time = max(0, L - W)     (averaged over the phase of the handler: L - W/2)
```

and the loss accumulates, because every later Non-Secure timeout is then late. A Secure **call** is not such a section, because Non-Secure interrupts are taken inside it.

## On this board

The Secure partition's timer fires every P. Its handler runs a loop of W iterations of 0.079 µs each, so the handler lasts 16.1, 158.6 or 633.7 µs for 200, 2000 or 8000 iterations.

### A handler as a top task (exp9n)

The Non-Secure set is TH (2 ms), TM (5 ms) and TL (23.1 ms) from the earlier modules. Each handler enters the bound as a task of cost C_s + 2 µs and period P.

| Handler and period | Secure utilisation | Release latency, max | TH max / bound | TM max / bound |
|---|---|---|---|---|
| none | 0 | 9 µs | 470 / 470 (1.000) | 1942 / 1951 (0.996) |
| 16 µs every 1 ms | 0.018 | 17 µs | 478 / 488 (0.980) | 1967 / 1987 (0.990) |
| 159 µs every 1 ms | 0.161 | 160 µs | 621 / 630 (0.984) | 2877 / 2902 (0.991) |
| 159 µs every 500 µs | 0.321 | 160 µs | 779 / 791 (0.985) | 3670 / 3705 (0.991) |
| 634 µs every 1 ms | 0.636 | 631 µs | 1727 / 1741 (0.992) | overload: 392 jobs, all late |

The Non-Secure release latency equals the handler length, as the idea predicts. In the last row the set is overloaded (total utilisation 1.16): the model declares TM unschedulable, and TM completes only 392 of its 800 jobs in the run, every one of them late (worst response 368 ms).

### A handler that lands inside a Secure call (exp9n, second run)

TL is now inside a Secure call (963 or 1433 µs) while the handler fires. TH is a TF-M user above TL, so it is blocked by the call plus the handlers inside it.

| TL call | Handler | Blocking seen by TH | Call plus handlers inside it | TH max / bound |
|---|---|---|---|---|
| 963 µs | 159 µs every 1 ms | 1049 µs | 1122 µs | 1663 / 1753 (0.948) |
| 963 µs | 159 µs every 500 µs | 1208 µs | 1281 µs | 1980 / 2235 (0.886) |
| 963 µs | 634 µs every 1 ms | 2793 µs | 2865 µs | 3882 / 3975 (0.977) |
| 1433 µs | 159 µs every 1 ms | 1678 µs | 1751 µs | 2291 / 2383 (0.962) |
| 1433 µs | 159 µs every 500 µs | 1996 µs | 2069 µs | 2768 / 2864 (0.966) |

The observed blocking is within 3 to 7 % of the call plus its handlers, the difference being the part of the call already done when TH arrived. The fixed point of the idea above gives 1281, 1440, 2865, 1751 and 2228 µs for the five rows, so it is a safe upper value in every case; it is exact when the phase is worst, as in the third and fourth rows. All ten bounds hold, at 0.84 to 0.99. Some of these sets exceed their periods, so deadline misses occur; the bound is on the response time, and it holds.

### Kernel time lost (exp9o)

The main thread samples the cycle counter (the reference) and the kernel's own time every 100 ms for 6 s per case. The difference is the time the kernel did not see. The result is determined by W, the distance to the next kernel timeout.

| Handler L | Next timeout W | Lost per handler | Prediction L − W/2 |
|---|---|---|---|
| 10 ms | 69.9 ms (no short timeout) | 0.001 ms | 0 |
| 60 ms | 69.9 ms | 0.5 ms | 0 |
| 100 ms | 69.9 ms | 52.1 ms | 65.3 ms |
| 300 ms | 69.9 ms | 271.5 ms | 265.7 ms |
| 10 ms | 5 ms (a thread polling) | 5.19 ms | 7.5 ms |
| 100 ms | 5 ms | 96.8 ms | 97.7 ms |
| 300 ms | 5 ms | 297.2 ms | 298.1 ms |
| 10 ms | 1 ms (a thread polling) | 8.76 ms | 9.5 ms |
| 40 ms | 1 ms | 39.3 ms | 39.6 ms |
| Secure **call**, 88 ms and 293 ms | any | 1 and 3 µs | 0 |

![Kernel time lost per Secure handler against the handler's length, for three distances to the next kernel timeout. The loss follows the handler length except for the part hidden by a distant timeout.](/images/tfm/fig9_tickloss.png)

*With a short timeout in the system the kernel loses almost the whole handler. With none, it loses nothing below the 69.9 ms SysTick maximum.*

With a 300 ms handler and a 5 ms poller, a case meant to last 6 s took 23 s by the cycle counter, and the kernel's `k_cycle_get_32()` lost exactly the same, because it is derived from SysTick. Every real application has a periodic task of a few milliseconds, so in practice W is that period and a handler longer than it makes every later Non-Secure timeout late, cumulatively.

### Three ways TF-M can handle the interrupt (exp9n and exp9o, rerun per model)

| | Raw ISR | FLIH | SLIH (default scheduling) |
|---|---|---|---|
| Handler starts | at once | 0.3 to 2.4 µs later (SPM dispatch) | 1.4 to 5.4 ms later, at the next Non-Secure call |
| 1 ms interrupts handled in 4 s | 4002 | 4002 | 2001 (the pending one is lost) |
| TH / TM max, 159 µs handler every 1 ms | 620 / 2876 µs | 621 / 2879 µs | 632 / 2733 µs |
| TH blocking inside its own call | 5 µs | 5 µs | 166 µs (the handler runs inside it) |
| Kernel time lost, 300 ms handler, 5 ms poller | 297 ms | 297 ms | none (the handler hardly ran) |

A fourth model, SLIH with the SPM scheduling the partition thread right after the interrupt, loses as much kernel time as the raw ISR, and it resets the board as soon as the interrupt lands while a Non-Secure thread is inside a Secure call (25 reboots in a 10-minute capture). TF-M documents that option for single-threaded Non-Secure code, which Zephyr with preemptible Secure calls is not.

## How it is measured

**Bounds (exp9n).** The task set is hardware-timed: releases come from compare channels of a 1 MHz timer and timestamps from the cycle counter, so a late release is visible. Each task body is timed alone first, and the maxima are the C and S in the bound. 4 s and 2000 TH jobs per case.

**Clock (exp9o).** The main thread reads the cycle counter, `k_uptime_ticks()` and `k_cycle_get_32()` every 100 ms for 6 s per case; the loss is the cycle counter's elapsed time minus the kernel's. Handlers run 10 to 600 ms, with three values of W: no short timeout, a thread polling every 5 ms and one polling every 1 ms.

**Models (exp9v).** A build option selects a raw ISR, FLIH or SLIH, and the two experiments are rerun for each.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| Kernel uptime runs slow after a long Secure handler | the handler exceeded the distance to the next timeout; shorten it below the shortest Non-Secure period, or use a free-running timer as the kernel clock |
| Half of the interrupts are missing | SLIH with default scheduling: interrupts that arrive before the end-of-interrupt call are lost |
| The board resets at the first interrupt | SLIH with scheduling on a Non-Secure interrupt, with a thread inside a Secure call |
| A Non-Secure interrupt is late during a flash write, with no Secure handler running | not a handler effect: the core is frozen by a sector erase. In exp9j the interrupt was taken up to 2.5 to 2.7 ms late even with the vector table and the handler in SRAM, and 1 µs late once the port runs the erase wait from SRAM. See [What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) |

## Trade-offs and going further

- **A Secure handler must be shorter than the shortest Non-Secure period, whichever model is used,** and only the raw ISR and FLIH give it a latency. SLIH removes the interference and the time loss but brings a latency equal to the Non-Secure call rate, and lost interrupts.
- **Another clock would remove the clock problem.** A free-running timer as the kernel clock, or a resynchronisation from the Secure side, would make the kernel immune. Putting a low-power timer under Zephyr as the kernel clock did not boot on this port, so the loss is measured here, not removed.
- **Exercise:** a 10 ms Secure handler runs every 100 ms. The shortest Non-Secure period is 4 ms. Estimate the kernel time lost per handler and per second, then say what a 2 ms task sees on its timeouts.
- **Exercise:** iterate S_eff = S + ⌈S_eff / P⌉ × C_s for the 1433 µs call under a 159 µs handler every 500 µs, and compare with the 2069 µs in the last row of the second table. Why is the fixed point higher than what was observed?

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Board** | STM32H573I-DK, Zephyr with TF-M v2.3.0; Secure timer TIM7 |
| **Status** | validated on hardware |
| **Read first** | [One mutex, one blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) |
| **Evidence** | exp9n (periodic Secure interrupt, two runs, and reruns for FLIH, SLIH and SLIH with scheduling); exp9o (kernel time lost, 8 cases including the model reruns); exp9j (interrupt latency with the vector table in SRAM) |
| **Related** | [Budget and identity enforced by the Secure side](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a01-secure-side-budget-and-identity/) · [What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) · [Fixing the freeze](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s03-fixing-the-freeze/) |
