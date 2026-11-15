+++
title = "Cache-related preemption delay across the TrustZone boundary"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "The instruction cache is shared by both worlds, so a Secure call that preempts a task evicts that task's code. Measured: a TF-M preemption is an ordinary preemption for the cache, with a refill of a few microseconds."
weight = 40

[params]
  lab = 13
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can say what a preemption costs a flash-resident task, how much of that is the kernel and how much is what the preempting job runs, and why a call into the Secure world adds only a few microseconds to it. You can also read a measurement of the effect and tell which rows can be trusted.

## Before you start

- **Level 4.** Read [F02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) for the per-preemption term of the recurrence, and [S01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) for the instruction cache and the cost of running from flash without it.
- **Words.** A *preemption* is one switch from a lower-priority task to a higher-priority job and back. *CRPD* (cache-related preemption delay) is the extra time the preempted task spends refilling the cache lines the preempting job evicted.
- **Tools:** nothing to run; the method is described below.

## The idea

The STM32H573 has an 8 KB instruction cache in front of the flash, and both worlds use it. A Secure call that preempts a Non-Secure task therefore executes Secure code through the same cache, and evicts some of the task's lines. When the task resumes, it pays to fetch them again from flash, where code runs about twice as slowly per byte as from cache.

The earlier version of the analysis left this term out. The question is whether crossing the boundary makes it larger than an ordinary preemption by Non-Secure code. The answer measured here is no: a call into the Secure world evicts about as much as 6.8 KB of plain Non-Secure code, and the extra refill is a few microseconds.

## On this board

Two sizes matter: the 8 KB of the cache, and the footprint of the preempted task's code. A task whose code fits in the cache keeps it between preemptions and can lose some of it. A task whose code does not fit runs from flash at every pass and has nothing left to lose.

The code blocks in the experiment are straight-line Thumb-2 code, named after their nominal size. Their compiled sizes are 3.8, 6.8 and 13.5 KB for the nominal 4, 8 and 16 KB blocks, and 0.8 and 6.8 KB for the two Non-Secure jobs. The table below uses the compiled sizes.

## How it is measured

**exp9t.** A low-priority task runs one straight-line code block over and over, and times every pass with the cycle counter (DWT). A high-priority job is released every millisecond by a kernel timer and runs one of six things:

| Job | What it does |
|---|---|
| EMPTY | returns at once: only the timer handler, two context switches and the kernel code they run |
| NS1K | 0.8 KB of Non-Secure straight-line code |
| NS8K | 6.8 KB of Non-Secure straight-line code, most of the cache |
| TFM_CALL | one `psa_call()` on a persistent connection |
| TFM_TXN | a whole transaction: connect, call, close |
| SHA64 | a SHA-256 over 64 bytes, in the Crypto partition |

Each case runs for 1.5 seconds. Before it starts, the low-priority task runs 200 passes alone to find its uncontended time, `base`, the fastest pass. For a pass that contained exactly one high-priority job:

```
overhead = pass - base - the job's own execution
```

The EMPTY job gives the cost of the switch and the timer handler. The difference between another job and EMPTY is the refill caused by what that job executed. The build has preemptible Secure calls on and priority inheritance configured (`CONFIG_ARM_NONSECURE_PREEMPTIBLE_SECURE_CALLS=y`, `CONFIG_PRIORITY_CEILING=-128`), with the instruction cache enabled.

The source also contains a variant for the Renesas FPB-RA4E1, but the recorded run is the one on the STM32H573I-DK.

## What you should see

### The block that runs from flash

The uncontended time of each block shows what the cache does. Per byte, the 13.5 KB block (39.7 µs per pass) takes twice as long as the 6.8 KB block (9.9 µs): it does not fit the 8 KB cache, runs flash-bound at every pass, and has nothing left to lose. This is the gamma ratio of [S01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) seen from the other side.

### Overhead per single preemption

Mean overhead per preemption, in microseconds, net of the preempting job's own execution (exp9t, about 800 to 1,500 single-preemption passes per cell):

| Preempting job | Task code 3.8 KB | Task code 6.8 KB | Task code 13.5 KB |
|---|---|---|---|
| EMPTY (kernel path only) | 10.8 | 14.1 | 12.0 |
| 0.8 KB of Non-Secure code | 11.8 | 15.2 | 12.0 |
| 6.8 KB of Non-Secure code | 14.4 | 13.2 | 13.0 |
| one `psa_call()` | 13.0 | 17.0 | 12.6 |
| a whole transaction | 13.3 | 17.2 | 12.8 |
| SHA-256 of 64 bytes | 13.9 | 17.5 | 13.1 |

Two things stand out. The empty job already costs 11 to 14 µs. That is the timer handler, two context switches and the kernel code they run from flash, which itself evicts part of the task's lines. Beyond that, what the job executes adds a small amount: over the EMPTY row, a call, a transaction or a SHA-256 adds 0.7 to 3.4 µs on average, and the worst single preemption by a call, a transaction or a SHA-256 was 5.6 µs above the worst empty one. In the 6.8 KB column, where the task's code is close to the cache size and can be hurt most, the call, the transaction and the SHA-256 add 2.9, 3.1 and 3.4 µs.

![Overhead a preempted flash-resident task pays per single preemption, net of the preempting job's own execution, by what that job executed and by the preempted code's footprint.](/images/tfm/fig13_crpd.png)

*The kernel's own path costs 11 to 14 µs. A TF-M call adds no more than 6.8 KB of plain Non-Secure code does. A 13.5 KB block does not fit the cache and shows no refill.*

A TF-M preemption is therefore an ordinary preemption for the cache. In the analysis it costs the kernel path plus a refill of at most 6 µs per higher-priority job, for tasks whose code fits the cache. The 6 µs is the allowance the model uses for a preemption across the Secure boundary, just above the largest difference measured over all jobs here (5.7 µs).

### The rows that are left out

The 1 KB and 2 KB blocks are not in the table. Their passes last 1.1 and 2.2 µs, and the count of passes that contain exactly one job is only 301 of 721,462 (1 KB) and 1 of 473,689 (2 KB) for the EMPTY job, so their means are not comparable with the others.

The job's own execution is subtracted, and it is not small: about 81 to 84 µs for the call, 104 to 108 µs for the transaction and 86 to 89 µs for the SHA-256 in these runs. It is the overhead *beyond* that which this module is about.

## When it goes wrong

| Symptom | Cause |
|---|---|
| A negative difference in one cell (the 6.8 KB job against the 6.8 KB task: 13.2 against 14.1 for the empty job) | the measurement cannot say more than that this job adds no visible refill for that task; do not read a meaning into the sign |
| Means that look better than the worst case | the table gives means; the worst single preemption was up to 5.7 µs above the empty job's, so size the allowance on the maximum |
| The effect disappears for large tasks | a task whose code does not fit the cache runs from flash at every pass and has no cache contents to lose |
| Overhead differs between builds | the kernel path runs from flash, so the 11 to 14 µs belongs to the image you measured |

## Trade-offs and going further

- **A per-preemption term is a bound on a pattern, not a law.** The 6 µs holds for tasks whose code fits the cache and for the jobs measured here. Secure services with a larger code footprint than SHA-256 over 64 bytes were not tried here.
- **The kernel path dominates.** 11 to 14 µs per preemption is the part that scales with the number of preemptions; reducing preemptions helps more than shrinking what the preempting job runs.
- **Exercise:** a task with 3.8 KB of code is preempted 1.5 times per job by a TF-M user. Using the table, bound its extra time per job with the SHA-256 row and with the EMPTY row, and say how much the Secure call adds.
- **Exercise:** the 13.5 KB task shows almost the same overhead for every job. Explain why, and say which row of the table would change first if the instruction cache were 16 KB.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | measured on one board; the footprints tested are 3.8, 6.8 and 13.5 KB |
| **Read first** | [F02 Response-time analysis in one page](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) |
| **Evidence** | exp9t (7 cases of preempting job, including none, times 5 block sizes, 1.5 s per case, DWT timing), on the STM32H573I-DK with TF-M 2.3; one recorded run |
| **Related** | [S01 What a Secure storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/); [B04 Random task sets](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b04-random-task-sets/), where the per-preemption term is validated |
