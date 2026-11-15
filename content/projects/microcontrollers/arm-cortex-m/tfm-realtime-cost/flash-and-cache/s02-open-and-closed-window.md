+++
title = "Who can preempt the write: the closed window and the open window"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "How much Non-Secure work runs slow during a storage write depends on one question: does a TF-M user above the writer block? The answer separates a one-job penalty from a schedulability cliff, and the write cost itself turns out to depend on what the storage holds."
weight = 20

[params]
  lab = 11
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can look at a task set and say, before running it, whether a storage write will slow one job or every job above the writer, why the second case can starve the writer completely, and what the write itself costs as a function of what the application keeps in storage.

## Before you start

- **Level 4.** Read [S01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) for gamma (code from flash runs 2.0 to 2.5 times slower while the cache is off), delta (the erase freeze) and C_w (the write cost), and [B01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) for the mutex that serialises TF-M calls, with priority inheritance.
- **The task set.** Three periodic tasks with rate-monotonic priorities.

| Task | Priority | Period | Does |
|---|---|---|---|
| TH | 1 (highest) | 2 ms | 6 Non-Secure operations, then one TF-M transaction |
| TM | 2 | 5 ms | 25 Non-Secure operations, never calls TF-M |
| TL | 3 (lowest) | 23.1 ms | one protected activity per job; here a 512-byte ITS write |

TL's period is not a divisor of the 10 ms hyperperiod of the other two, so its release slides over every phase of TH and TM in 100 µs steps, and a run covers the worst case of each pattern.

## The idea

The cache stays off for as long as the writer is preempted inside the flash driver, so the question is who preempts it, and for how long. Two situations, plus a third that avoids the question.

**Closed window.** TH calls TF-M and priority inheritance is on. The first TH job released after the write starts runs its Non-Secure part at gamma, then asks for the mutex and blocks. TL inherits TH's priority, nothing below it can run, and TL finishes the write. TH is one thread, so its later jobs cannot run during the write, and TM cannot preempt TL while it holds TH's priority. Exactly one TH job per write runs slow. The window is closed by the first TF-M user that blocks, at most one TH period after the write starts. The cost to TH is the slowdown of one job plus the write as blocking:

```
R_h = gamma * C_h,NS + C_w + C_h,txn + epsilon
```

**Open window.** Replace TH's transaction by a seventh Non-Secure operation. Now nothing above TL ever blocks on the mutex, so nothing closes the window. Every preempting job runs at gamma, and the write advances only in their idle time. The writer's response is the fixed point of

```
W = C_w + sum over j above the writer of  ceil(W / T_j) * gamma * C_j
```

That equation has no solution when the slowed utilisation, the sum of gamma times U_j over the tasks above the writer, reaches 1. The write then never completes. This is not a slowdown but a cliff. With the measured gamma, the nominal task set sits at 1.15 (1.26 with the prior of 2.53), and the cliff is reached at a nominal utilisation of 0.50. The tasks above the writer also take the erase freezes on their own releases, so delta enters their response time too.

**Non-preemptible write.** Wrap the write in `k_sched_lock()`, or build with non-preemptible Secure calls. Nobody runs with the cache off, gamma disappears, and the write becomes an ordinary blocking term for every task, TF-M user or not: `B_i += max C_w`. The freezes still happen but fall inside that term.

## On this board

All three cases use the task set above, run for 4 seconds each (2,000 TH jobs), on the STM32H573I-DK with TF-M 2.3. The prior values used by the analysis are gamma = 2.53 and delta = 2.7 ms, the largest values observed in [S01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/).

## How it is measured

**exp9k: the periodic task set with hardware timestamps.** Releases come from three compare channels of a free-running 1 MHz hardware timer; the handler re-arms each channel by adding the period, so the nominal release of job n is n times the period, whenever the handler actually runs. The release latency is the counter value minus the compare value at handler entry, measured by the timer. Start and finish times come from the cycle counter (DWT), which runs through a freeze. Before each case every task body is run alone to measure its isolated cost.

This matters here more than anywhere: the earlier version of the experiment (exp9g) stamped releases inside a kernel timer handler, and a release that fell into a freeze was stamped late, so response times were under-measured by up to delta. With the hardware timestamps, the kernel-timer method under-reports the worst response by up to 2.9 ms.

The cases are named by what TL does and how the build is set: `ITS512` (preemptible write), `ITS512_LOCK` (the same under `k_sched_lock()`), and the variants `preempt` (TH calls TF-M, closed window), `preempt_notfm` (TH's transaction replaced by a Non-Secure operation, open window), `preempt_notfm_tm6` (also TM reduced from 25 to 6 operations, so the slowed utilisation drops to 0.57) and `nonpreempt`.

**exp9w: what the write costs.** Each configuration is a number of assets of a given size, written in turn. The storage is cleaned, then each configuration is written 300 times (ITS) or 60 times (PS), and every write is timed with the cycle counter.

## What you should see

### The closed window: one slow job per write

In the closed-window run (exp9k, `preempt`), TH's Non-Secure part takes 352 µs normally and about 807 µs, 2.3 times as long, in the slow job. Counting TH jobs that run slow inside each of TL's 173 writes gives exactly one slow job in 170 writes and none in 3. No TM job runs slow, and no TH job other than the first after the write starts.

The response-time bound built from the closed-window equations is not exceeded: observed maxima are 0.83 to 0.98 of the bound for TH and 0.67 to 0.76 for TM over three runs. The bound one would write without the mechanism, gamma applied to every preempting job for the whole write, has no solution for this task set: TH and TM at gamma need 115 to 126 % of the processor.

TH still misses deadlines in this setup: 645 of 2,004 jobs (exp9k, `preempt`). That is the write itself, which is longer than TH's 2 ms period, paid as blocking. The model predicts it; it does not remove it.

### The open window: the cliff

| Case | Slowed utilisation | What the analysis says |
|---|---|---|
| TM at 25 operations, no TF-M user above the writer | 1.15 (1.26 with the prior) | no fixed point: the write does not complete |
| TM reduced to 6 operations | 0.57 | the fixed point exists; the write takes about 2.4 times its isolated cost |

With the converging variant, TH is hit twice. It runs at gamma for the whole window, and it takes the erase freezes on its own releases: its worst job is a 2.82 ms freeze plus a 0.86 ms slowed job, 3.69 ms against a 2 ms period, and 11 % of its deadlines are missed by the freeze alone. The bound that adds delta as blocking of the release and as jitter of the interfering task holds at 0.98 (TH) and 0.62 (TM) of the observed worst case.

### Non-preemptible write

The bound holds at 0.986 to 0.994 when C_w is the longest write observed. The freezes remain (release latency up to 2.9 ms) but fall inside the blocking term.

### What a write costs: the storage state

The same 512-byte ITS write takes 4.3 to 8.7 ms across the task-set runs. The exp9w sweep shows where the spread comes from. Median write cost over 300 writes (ITS) or 60 writes (PS):

| Configuration | Live data | Median write |
|---|---|---|
| ITS, 1 asset of 64 B | 0.06 KB | 3.92 ms |
| ITS, 1 asset of 512 B | 0.5 KB | 4.98 ms |
| ITS, 4 assets of 128 B | 0.5 KB | 5.05 ms |
| ITS, 8 assets of 64 B | 0.5 KB | 4.98 ms |
| ITS, 2 assets of 512 B | 1 KB | 6.20 ms |
| ITS, 4 assets of 512 B | 2 KB | 8.45 ms |
| ITS, 8 assets of 512 B | 4 KB | 13.14 ms |
| PS, 1 asset of 64 B | 0.06 KB | 55.0 ms |
| PS, 1 asset of 512 B | 0.5 KB | 73.8 ms |
| PS, 4 assets of 512 B | 2 KB | 92.4 ms |

The three 0.5 KB rows are the point: one asset of 512 bytes, four of 128 and eight of 64 cost the same, so the cost does not depend on which asset is written, or on the history. The filesystem rewrites its whole live set on every write. For ITS the cost is a straight line, about 3.8 ms plus 2.3 ms per KB of live data, with residuals below 0.15 ms. PS is rougher: about 59 ms plus 18 ms per KB, and its points do not sit on the line as closely.

![Write cost against the live data in the filesystem, for ITS and for PS. Every write rewrites the live set, so the cost is linear in the stored bytes and independent of the asset written.](/images/tfm/fig11_storage_state.png)

*Median write cost against live data. The spread seen between runs is the live set of the moment, not noise.*

So C_w is not a tail to be measured but a design-time function of what the application stores. The analysis needs the maximum over the storage states the application can reach. Twenty calibration writes never reached the maximum seen in a 4 s schedule: a bound built on the calibration maximum was exceeded by 0.7 to 9 %, while one built on the longest observed write held at 0.99.

## When it goes wrong

| Symptom | Cause |
|---|---|
| The write never completes in a run | the open window with slowed utilisation at or above 1; the equation has no solution |
| Every job above the writer is slow, not one | no task above the writer blocks on the mutex: check that TH really calls TF-M and that inheritance is on |
| A bound that holds on the calibration run fails in a longer run | the write cost was taken from too few writes or from a smaller live set than the application can reach |
| Response times look 2 to 3 ms too short | releases were stamped in a kernel handler that was frozen; use hardware releases and timestamps |

## Trade-offs and going further

- **A TF-M user above the writer is a protection.** It turns a possible cliff into a one-job penalty, at the price of blocking. A non-preemptible write is more pessimistic for the high tasks, but its bound is simple and does not depend on who is above.
- **Keep the live set small.** C_w grows by about 2.3 ms for every KB of live ITS data, and only the total counts, not the number of assets.
- **Exercise:** TH's Non-Secure part takes 352 µs every 2 ms. Compute its utilisation normally and at gamma = 2.53, and say how much of the processor that leaves for TM and the writer in the open window.
- **Exercise:** an application keeps 3 KB of live data in ITS. Estimate its C_w from the line above, then state how much longer a task above the writer is blocked if the live set grows to 4 KB.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | measured on one board, one port; the open-window numbers are reported as the analysis states them |
| **Read first** | [S01 What a Secure storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) |
| **Evidence** | exp9k (hardware-timestamped task set: `preempt`, `preempt_notfm`, `preempt_notfm_tm6`, `nonpreempt`), exp9w (storage-state sweep, 2,580 timed writes), on the STM32H573I-DK with TF-M 2.3 |
| **Related** | [S03 Removing the freeze and the slowdown](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s03-fixing-the-freeze/); [B01 Blocking through the mutex](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/); [B04 Random task sets](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b04-random-task-sets/) |
