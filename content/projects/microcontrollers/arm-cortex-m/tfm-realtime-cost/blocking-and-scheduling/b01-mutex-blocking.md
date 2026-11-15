+++
title = "One mutex, one blocking term: how a Secure call delays other tasks"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "Zephyr serialises every PSA call through one mutex, so the longest single call of a lower-priority task is a blocking term for everyone above it, TF-M user or not."
weight = 10

[params]
  lab = 6
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Intermediate"
+++

After this module you can work out how long a Secure call of one task can hold back another, say which tasks it reaches (including tasks that never call TF-M), read the term off a table of service costs, and compare the three ways an application can protect the mutex: priority inheritance, an immediate ceiling and the scheduler lock. The measurements close to within a fraction of a microsecond for a single release, and to within 0.93 to 1.00 of the bound on a periodic task set.

## Before you start

- **Level 3.** You should know the response-time recurrence and the blocking term from [Response-time analysis in one page](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/), and what one call costs from [The anatomy of a Secure call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/).
- **Tools:** the STM32H573I-DK with the TF-M build used for the study, for the measurements. The arithmetic needs only a calculator.

## The idea

Zephyr's wrapper around the PSA client API protects every `psa_connect()`, `psa_call()` and `psa_close()` with one mutex. The mutex uses priority inheritance. Two consequences follow.

1. **The critical section is one call, not one transaction.** A transaction is connect, call and close, but each of the three takes the mutex separately. The longest time a task can keep the mutex is therefore its longest single `psa_call()`. Call that time S for the task.
2. **The blocking is once per job and comes from below.** A task is blocked at most once per job, by the longest S of any lower-priority task that uses TF-M:

```
B_i = max over lower-priority TF-M users l of S_l
```

The term is charged to task *i* when *i* or any task above it uses TF-M.

The second point has a subtle half. A task that never calls TF-M is still blocked. When a higher-priority task waits for the mutex, the holder inherits that task's priority and runs above everything in between, so the middle task waits for the rest of the call as well. The literature calls this push-through blocking. It is why a design cannot say "my 5 ms task does not use TF-M, so Secure services do not concern it".

If the call were not preemptible at all, every task would pay the whole of S at the start of its job, whether or not it uses TF-M. Zephyr's option for that is `ARM_NONSECURE_PREEMPTIBLE_SECURE_CALLS=n`; the default is preemptible calls, and the study uses the default except where a row says otherwise.

## On this board

The size of S is set by the service. Each value below is one isolated `psa_call()` on the STM32H573I-DK (exp9l, maximum over 20 to 200 repetitions).

| Service | Payload | Longest call |
|---|---|---|
| Random number | 32 B | 38 µs |
| SHA-256 | 4 KB | 1.25 ms |
| AES-256-GCM encrypt | 256 B | 1.65 ms |
| Protected storage (ITS) write | 512 B | 6.4 ms |
| Protected storage (PS) write | 512 B | 81 ms |
| ECDSA P-256 sign, in software | 32 B hash | 103 ms |
| ECDSA P-256 verify, in software | 32 B hash | 299 ms |

These span four orders of magnitude. One signature verification anywhere below a TF-M user is a 0.3 s blocking term for that user, and making Secure calls preemptible does not change it, because the mutex is held for the whole call. The service has to run in a task whose S every TF-M user above it can afford, or those users must not share the mutex with it.

## How it is measured

**One release (exp9a).** A low-priority task makes one long TF-M call, 50 operations and about 2.93 ms. A high-priority task is released inside it at five different instants and makes its own TF-M transaction. A medium-priority Non-Secure task (10 operations) is optionally released together with the high one. Each case has 200 trials per release point, with timestamps from the 240 MHz cycle counter. Three builds are compared: inheritance on, inheritance off (`CONFIG_PRIORITY_CEILING=15`) and non-preemptible Secure calls.

**A periodic set (exp9g).** Three rate-monotonic tasks: TH (2 ms, six Non-Secure operations and one TF-M transaction), TM (5 ms, 25 operations, never calls TF-M) and TL (23.1 ms, one protected activity per job, which changes from case to case). TL's period is not harmonic with the others, so its release sweeps every phase in 100 µs steps over a 4 s run. Before each case every task body is timed alone, and those maxima are the C and S in the bound. In the runs quoted here the releases were timestamped by the kernel timer; the flash cases that need hardware timestamps are in the [flash and cache](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/) section.

## What you should see

### One release: exact to a fraction of a microsecond

With inheritance on (exp9a, run tagged pi_on), the high task completes at a fixed instant measured from the start of the low task's call, whatever the release point. The mean of phase plus response over 200 trials is 3084.44, 3084.48, 3084.51, 3084.46 and 3084.48 µs for the five release points: a spread of 0.07 µs. That instant is the end of the low task's call plus the high task's own transaction (109.6 µs uncontended). The blocking is exactly the part of the Secure call still to run when the high task arrives.

The medium task adds only about 5 µs to the high task's response, because the low task has inherited the high task's priority and the medium task cannot run until the call is over.

### Without inheritance, the medium task joins the queue

With `PRIORITY_CEILING=15` the same experiment shows the classic inversion. The high task's response with the medium task released alongside is 3082.6 µs at the first release point, against 2489.4 µs without it: 593 µs more, which is the medium task's ten operations. The two cases without the medium task do not differ.

### A periodic set (exp9g, TL in a Secure call)

| TL activity | S of TL alone | TH max / bound | TM max / bound |
|---|---|---|---|
| 16 Non-Secure operations | none | 469.0 / 469.0 (1.000) | 1945.4 / 1947.7 (0.999) |
| 8 operations in one call | 495 µs | 909.3 / 959.7 (0.95) | 2812.6 / 2902.6 (0.97) |
| 16 operations | 964 µs | 1378.1 / 1433.2 (0.96) | 3281.3 / 3381.1 (0.97) |
| 24 operations | 1433 µs | 1846.9 / 1901.9 (0.97) | 3752.4 / 3849.8 (0.975) |

TM never calls TF-M, and its worst response still grows by S of TL: push-through blocking, measured. With inheritance off, TH's worst response is 2341.6, 2817.6 and 3286.4 µs for the three call lengths, which is 2.44, 1.97 and 1.73 times its bound with inheritance, with 7, 21 and 41 missed deadlines out of 2000 jobs. TM is no longer blocked at all (1.95 to 1.98 ms in the three cases), because the inversion now falls on the task above it.

### Three protocols (exp9u)

Inheritance is the only protocol Zephyr offers. An application can impose two others: an immediate ceiling, where the caller raises itself to the priority of the highest TF-M user around each call (two `k_thread_priority_set()` calls), and the scheduler lock. With TH at the top, TM a TF-M user and TL making a 962 µs call:

| TH | Protocol | TH max | TM max |
|---|---|---|---|
| TF-M user | inheritance | 1343 µs | 3384 µs |
| TF-M user | immediate ceiling | 1331 µs | 3370 µs |
| TF-M user | scheduler lock | 1329 µs | 3368 µs |
| pure Non-Secure | inheritance | 423 µs | 3289 µs |
| pure Non-Secure | immediate ceiling | 423 µs | 3287 µs |
| pure Non-Secure | scheduler lock | **1284 µs** | 3277 µs |

![Worst response of the two upper tasks under the three protocols for a 963 µs Secure call of the lowest task. Inheritance and the ceiling are indistinguishable.](/images/tfm/fig12_protocols.png)

*Inheritance and the ceiling give the same worst case for every task. The scheduler lock differs only for a task that never calls TF-M: TH goes from 424 to 1284 µs.*

The ceiling moves the blocking from the call site to the start of the job: TH's blocking inside its own call falls from 882 to 45 µs, and the delay reappears as start latency. All 14 bounds hold at 0.93 to 1.00.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| A task that does not use TF-M misses a deadline when a lower task starts using it | push-through blocking: the term applies to every task between the caller and the highest TF-M user |
| The bound is exceeded in a case with a storage write | the write also slows flash-resident code and freezes the core during erases; the mutex term alone is not enough (see [What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/)). In exp9g with kernel-timer timestamps the ITS case came out at 1.06 to 1.09 of the bound |
| Every task is delayed at the start of its job | non-preemptible Secure calls: the caller is raised to the highest priority, so the whole call is a start-of-job delay for all tasks, and each transaction is also about 4.8 µs dearer (about 1.6 µs per PSA call) |
| The response of a middle task grows by a whole task of its own | inheritance is off, or capped by a ceiling lower than the priorities involved |

## Trade-offs and going further

- **Batching lowers cost and raises blocking.** Running k operations inside one call is cheaper for the caller but lengthens S, which is the blocking term of every TF-M user above it. The next module, [Chunking shapes the blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/), turns the same lever the other way.
- **A server thread does not hide the blocking.** Posting the call to one server thread below every task still blocks the first TF-M user above it: the mutex hold is what counts, not who makes the call.
- **Exercise:** with TL's call at 1433 µs, estimate TH's worst response from its uncontended 469 µs and the blocking term, then compare with 1846.9 µs. Where does the remaining difference come from?
- **Exercise:** take three tasks. TH, at the top, never calls TF-M; TM, in the middle, does; TL, at the bottom, makes a 962 µs call. Write down B for each of the three, then check TH's against the pure Non-Secure rows of the protocol table.

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **Board** | STM32H573I-DK, Zephyr with TF-M v2.3.0 (isolation level 1) |
| **Status** | validated on hardware (single release, periodic set) |
| **Read first** | [Response-time analysis in one page](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) · [The anatomy of a Secure call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/) |
| **Evidence** | exp9a (inheritance on, inheritance off, non-preemptible; 200 trials per point); exp9g (periodic set, inheritance on and off); exp9l (service catalogue); exp9u (three protocols) |
| **Related** | [The service catalogue](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c03-service-catalogue/) · [Chunking shapes the blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/) · [Random task sets](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b04-random-task-sets/) · [Budget and identity enforced by the Secure side](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a01-secure-side-budget-and-identity/) |
