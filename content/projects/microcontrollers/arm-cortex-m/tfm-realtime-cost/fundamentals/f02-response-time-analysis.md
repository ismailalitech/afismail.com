+++
title = "Response-time analysis in ten minutes: blocking, interference and the small terms"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "The one recurrence the whole project feeds, with a worked example that shows how a single long Secure call decides whether a deadline is met."
weight = 20

[params]
+++

After this page you can write the response time of a fixed-priority periodic task as a sum of its own execution, the time it is blocked by a lower-priority task, and the time higher-priority tasks take from it; say which of those terms a Secure call changes; and work a small example by hand. The rest of the project measures the terms. This page shows where each one goes.

## Before you start

- **Level 1.** You should know what a periodic task, a priority and a preemption are.
- **Tools:** a calculator. Every number below is repeated with its arithmetic.

## The idea

A periodic task releases a **job** every period T. Each job needs at most C units of processor time and must finish within a deadline D, here equal to T. The **response time** R of a job is the time from its release to its completion. With rate-monotonic priorities (shorter period, higher priority) the classical recurrence for task i is

```
R_i = C_i + B_i + sum over higher-priority tasks j of  ceil(R_i / T_j) * C_j
```

and the task meets its deadline if the fixed point R_i is at most D_i. The three parts:

| Term | Meaning | Where a Secure world touches it |
|---|---|---|
| **C_i** | the task's own execution, including the cost of every protected operation it makes | each TF-M transaction adds its cost to C_i ([C01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/)) |
| **B_i** | blocking: time a higher-priority job waits because a lower-priority task holds something it needs | Zephyr serialises all PSA calls with one mutex, so B_i is the longest single `psa_call()` of any lower-priority TF-M user ([B01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/)) |
| **interference** | work done by higher-priority jobs released during R_i | a longer C_j for a higher-priority task makes every lower task wait longer |

Two facts about the mutex matter. It uses priority inheritance, so a task that never calls TF-M can still be blocked: if a higher task waits for the mutex, the lower holder inherits that priority and runs above everything in between (push-through blocking). And blocking happens once per job, by the longest single critical section, not by the whole transaction, because connect, call and close take the mutex separately.

### The small terms

Four more terms close the gap between this recurrence and what the board does. They are measured in later modules.

| Term | Value on the STM32H573I-DK | Meaning |
|---|---|---|
| epsilon | 10 microseconds | kernel path per job: release, dispatch, return |
| c_p | up to 6 microseconds | cache refill after one preemption across the Secure boundary |
| gamma, delta, C_w | 2.0 to 2.5 times; 1.3 to 2.9 ms; 4.3 to 8.7 ms | the three effects of a write to Secure storage ([S01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/)) |
| C_s + 2 microseconds | handler cost | a periodic Secure interrupt, which preempts everything Non-Secure |

With epsilon and c_p the recurrence becomes `R_i = C_i + B_i + epsilon + sum ceil(R_i/T_j) * (C_j + epsilon + c_p)`.

## On this board

The example uses numbers measured on the STM32H573I-DK. Two tasks run at rate-monotonic priorities with implicit deadlines (experiments exp8a and exp8b): T1 with T = 2000 microseconds and T2 with T = 5000 microseconds. Their execution times, calibrated in the all-Non-Secure run, are C1 = 703.379 microseconds (12 operations of 58.6 microseconds each) and C2 = 1477.380 microseconds. A third, lower-priority task is added only for the blocking examples: it calls SHA-256 over 4 KB, whose longest call S is 1246.6 microseconds (exp9l).

Utilisation first: 703.379 / 2000 + 1477.380 / 5000 = 0.3517 + 0.2955 = 0.647.

**Step 1: nothing below uses TF-M.** B = 0 for both tasks.

- R1 = C1 = 703.379 microseconds, no higher task.
- R2 starts at C2 = 1477.380. ceil(1477.380 / 2000) = 1, so R2 = 1477.380 + 703.379 = 2180.759. ceil(2180.759 / 2000) = 2, so R2 = 1477.380 + 2 * 703.379 = 2884.138. ceil(2884.138 / 2000) = 2 again: the fixed point is **2884.1 microseconds**, well inside 5000.

**Step 2: a lower-priority task calls SHA-256 over 4 KB.** B = 1246.6 for both tasks, whether or not they call TF-M themselves.

- R1 = 703.379 + 1246.6 = **1950.0** microseconds, against D = 2000.
- R2 starts at 1477.380 + 1246.6 = 2723.98. ceil(2723.98 / 2000) = 2, so R2 = 2723.98 + 1406.758 = 4130.74. ceil(4130.74 / 2000) = 3, so R2 = 2723.98 + 2110.137 = 4834.12. ceil(4834.12 / 2000) = 3: fixed point **4834.1 microseconds**, against D = 5000.

One long call moved R2 from 2.9 ms to 4.8 ms and left T1 50 microseconds from its deadline.

**Step 3: add the small terms** (epsilon = 10, c_p = 6, so each higher job costs 703.379 + 16 = 719.379).

- R1 = 703.379 + 1246.6 + 10 = **1960.0** microseconds.
- R2 starts at 1477.380 + 1246.6 + 10 = 2733.98. Two preemptions give 2733.98 + 1438.758 = 4172.74; three give 2733.98 + 2158.137 = 4892.12; ceil(4892.12 / 2000) = 3 again. R2 = **4892.1** microseconds, 108 microseconds from the deadline.

The small terms took the slack from 166 to 108 microseconds. That is why they are in the model.

**Step 4: shape the blocking.** If the hash is split into 16 calls, the longest call falls to 111 microseconds (exp9p, [B02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/)). Then R1 = 703.379 + 111 + 10 = **824.4** and R2 = 1477.380 + 111 + 10 + 2 * 719.379 = **3037.1** microseconds.

## How it is measured

The model is checked, not assumed. Each term has its own experiment, and the bounds are compared with the worst response observed on the board by a **ratio** (observed maximum divided by bound; above 1.0 the bound is violated). In the first study, the two-task set above reproduced the measured response times of T2 within 0.25 percent.

A protected operation in T1 is paid once by T1 and 1.5 times on average by T2, because the 10 ms hyperperiod contains two T2 jobs and T2 is preempted 1.5 times per job. With C2 calibrated once on the all-Non-Secure run, the model predicts the effect of moving one of T1's 12 operations into a TF-M transaction:

| Quantity | Model | Observed |
|---|---|---|
| T1 mean response, increase | 47.017 (measured input) | 47.017 microseconds |
| T2 mean response, increase | 1.5 * 47.017 = 70.5 | 73.350 microseconds |
| T2 maximum response, increase | 2 * 47.017 = 94.0 | 98.129 microseconds |

The model is 2.8 and 4.1 microseconds low, about 4 percent of each increase, a few context switches.

## What you should see

- Step 2 of the example: a single 1.25 ms call, made by a task that is neither T1 nor T2, takes 1.25 ms from both. Blocking is paid by tasks that never call TF-M.
- The same call, chunked, costs the higher tasks 0.11 ms.
- In the board runs of the second study, the observed worst case stayed between 0.83 and 1.00 of the bound in every configuration (see [X01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x01-validation-report/)).

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| The recurrence does not converge | utilisation including the extra terms is above 1; in the open-window storage case the sum of gamma times each utilisation reaches 1 |
| The bound is below an observed response | a term is missing: the per-preemption cost, the kernel path, or the blocking of a task that never calls TF-M |
| Blocking looks too large for a task that never uses TF-M | correct: with priority inheritance it still pays the longest lower-priority call |
| Blocking is unbounded in the model | priority inheritance is off; the holder can be preempted by every task in between |

## Trade-offs and going further

- **A bound is only as good as its inputs.** The execution times here are calibration maxima measured in isolation before each case; a maximum from a short calibration can be exceeded in a long run.
- **The model assumes one serialised Secure path.** Another RTOS or a non-preemptible Secure call changes B_i from "longest call of a lower task" to "every task pays the longest call at the start of its job".
- **Exercise:** repeat Step 2 with a 2 ms period for T1 and the AES-256-GCM call over 256 bytes (1648.8 microseconds, [C03](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c03-service-catalogue/)). Does T1 still meet its deadline?
- **Exercise:** find the longest single call S for which T2 still meets 5000 microseconds in Step 3. Which task limits it first?

## At a glance

| | |
|---|---|
| **Level** | Beginner |
| **How to run** | Reading page with worked arithmetic; nothing to run |
| **Status** | arithmetic checked against the measured values quoted |
| **Read first** | [F01 Two worlds on one core](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/) |
| **Related** | [B01 Blocking through the PSA mutex](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/); [B02 Chunking shapes the blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/); [S01 What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/); [B04 Random task sets](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b04-random-task-sets/) |
| **Evidence** | exp8a and exp8b (two-task set, calibration of C1 and C2); exp9l (cost of SHA-256 over 4 KB); exp9p (chunked hash); exp9g and exp9k (blocking bounds in the three-task set) |
