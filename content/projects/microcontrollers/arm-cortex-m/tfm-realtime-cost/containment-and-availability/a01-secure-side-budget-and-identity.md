+++
title = "A runaway client: a cap, a budget and an identity"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "How the Secure side can bound what one Non-Secure client takes from everyone else, and why the bound is only as good as the identity it is charged to."
weight = 10

[params]
  lab = 14
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can say what a Secure service has to do to stop one Non-Secure client from taking every other task's deadline, why a per-call cap and a per-window budget do different jobs, and why a budget charged to a tag the client writes itself can be turned against another task. The numbers come from two experiments on the STM32H573I-DK: exp9z for the cap and the budget, and exp9af for the identity.

## Before you start

- **Level: Advanced.** Read [the mutex page](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) first: everything here follows from the fact that Zephyr serialises all PSA calls through one mutex, so the longest call of a lower-priority task is the blocking term of every task above it. [Chunking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/) shows the same term shaped from the service side.
- **Words used.** A *client* is a Non-Secure thread that calls a Secure service. An *operation* is the unit of work of the test service; one costs about 59 µs (a 16-operation call holds the mutex for 0.96 ms and a 50-operation call for 2.95 ms, both calibrated in exp9z).
- **Time:** the five cases of exp9z run in 195 seconds.

## The idea

Without a policy, any client that can call a Secure service can hold the mutex for as long as the service chooses to run. A task of low priority that makes a 2.95 ms call blocks a task with a 2 ms period for longer than its whole period. Nothing in the call tells the service that this is too much.

Two limits fix this, and they bound different things.

- A **cap** bounds the *length* of one call. The service runs at most *cap* operations of a request, stops, and reports how many it ran. The blocking term can then never exceed the cap's duration plus the call path.
- A **budget** bounds the *frequency*. Each client gets a number of microseconds of Secure execution per 10 ms window. A request that arrives over budget is refused at once, in 18 µs round trip, and holds nothing.

Both limits are applied per client, so both depend on knowing who the client is. In the first version the client wrote a tag into its request. That is no identity at all, because a hostile client can write someone else's tag. The fix is for the operating system to tell the Secure side which thread is running, so that the Secure side stamps every message itself.

## On this board

### The task set

Three periodic tasks run in Zephyr with releases and timestamps taken by hardware counters (see [hardware timestamps](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m01-hardware-timestamps/)).

| Task | Priority | Period | Does |
|---|---|---|---|
| TH | 1 (highest) | 2 ms | some Non-Secure work, then one TF-M transaction |
| TM | 2 | 5 ms | Non-Secure work only, never calls TF-M |
| TL | 3 (lowest) | 23.1 ms | the client under test |

The runaway client is TL issuing five 50-operation calls per job, each about 2.95 ms. TL is below TH, so TL's call blocks TH through the mutex. TM never calls TF-M, but it is blocked too: while TH waits for the mutex, TL inherits TH's priority and runs above TM.

### What the runaway does without a policy

In exp9z the runaway case (`Z_RUNAWAY`) makes TH miss 599 of 2000 deadlines (30 %) and TM miss 158 of 800 (20 %). The worst response of TH is 3.43 ms, against a 2 ms period. This is what the model predicts: the blocking term is the 2.95 ms call.

### The cap

With a cap of 16 operations (`Z_RUNAWAY_CAP16`) every deadline is met. Each of TL's calls now holds the mutex for at most 0.96 ms (963 µs worst case in the calibration), and the worst response of TH is 1.42 ms. The bound built from the cap holds at 0.99 of the observed worst case.

### The budget

The cap does not stop TL from calling again and again. A budget of 1 ms per 10 ms window (`Z_RUNAWAY_CAP16_B1000`) refuses 618 of TL's 865 calls and accepts 247. That is 3.5 times fewer accepted calls than with the cap alone. TH meets every deadline, and its worst response stays at 1.40 ms.

A compliant client is not touched: with the same cap and budget (`Z_SEC16_CAP16_B1000`), a TL that makes one 16-operation call per job has all 173 calls accepted, and TH's worst response is 1379 µs, the same as without any policy.

### The identity

In exp9af the budget is charged either to the tag in the request or to the client identity that the SPM stamps on the message. TF-M has an extension for this (the Non-Secure client identifier), in which the RTOS tells the SPM which thread is running, through veneers that must be called from handler mode. Zephyr does not implement it. Here the kernel's thread-switch tracing hooks call the veneers: one load per switch-in, one save per switch-out, and a per-thread token acquired on first use.

## How it is measured

Both experiments use the task set above and the same Secure partition, which gained two commands: set a policy (cap and budget) and run a budgeted call. Each case is one row of a table in the experiment:

```c
{ "Z_RUNAWAY_CAP16",       TL_RUNAWAY, 50U, 1, TM_OPS, 16U, 0U    },
{ "Z_RUNAWAY_CAP16_B1000", TL_RUNAWAY, 50U, 1, TM_OPS, 16U, 1000U },
```

The last two numbers are the cap in operations and the budget in microseconds per window; zero means none. After each case the experiment prints how many of TL's calls the Secure side accepted and rejected. Response times are computed from the hardware timestamps of every job, and every case runs for about four seconds of task time (2000 jobs of TH).

For the identity, exp9af has five cases: one 16-operation call, the runaway with no policy, and the runaway with a 1 ms budget charged to (a) its own tag, (b) TH's tag, which it forges, and (c) the identity the SPM reports. Each is run with the extension built in and without it. The cost of the hooks is measured separately, by two threads that hand a semaphore back and forth 1000 times, so that every round is two context switches.

## What you should see

Results of exp9z (STM32H573I-DK, TH and TM misses out of 2000 and 800 jobs):

| Case | TH misses | TM misses | TH worst response | TL calls accepted / refused |
|---|---|---|---|---|
| One 16-op call, no policy | 0 | 0 | 1379 µs | 173 / 0 |
| Runaway, no policy | 599 (30 %) | 158 (20 %) | 3432 µs | 795 / 0 |
| Runaway, cap 16 | 0 | 0 | 1423 µs | 865 / 0 |
| Runaway, cap 16 and budget 1 ms per 10 ms | 0 | 0 | 1405 µs | 247 / 618 |
| One 16-op call, cap 16 and budget | 0 | 0 | 1379 µs | 173 / 0 |

Results of exp9af (no cap, budget 1 ms per 10 ms window, five 50-operation calls per TL job):

| Whose budget TL's calls are charged to | TH calls accepted of 2000 | TL calls accepted / refused |
|---|---|---|
| its own tag | 2000 | 173 / 692 |
| TH's tag, written by TL (forged) | 1260 | 293 / 572 |
| the identity the SPM stamps | 2000 | 173 / 692 |

With a forged tag the runaway drains 740 of the 2000 calls of the 2 ms task. With the SPM's identity, the runaway drains only its own budget and TH loses no call. Without the extension in the build, the last row looks like the second (TH keeps 1285 of its 2000 calls): every Zephyr thread is then one client of TF-M, so a per-client policy has nothing to tell clients apart with.

The identity has a price on every context switch. A round of two switches takes 8.44 µs without the hooks and 9.64 µs with them, so 0.6 µs per switch. The call cost and the bounds do not change.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| TH still misses deadlines with a budget and no cap | the budget bounds how often, not how long. In exp9af, with a budget and no cap, TH still misses 153 of 2000 deadlines, and 255 when the tag is forged: the first call the budget lets through still runs 2.95 ms |
| The high task loses calls to a low task's overdraft | the budget is charged to a tag that the low task can write; use the identity the SPM stamps |
| All threads appear as one client | the Non-Secure client identifier extension is not enabled, or the hooks are not installed, so the SPM sees one default client |
| A refused call is not noticed | a refused request returns an error at once; the caller must check the status, or its work is lost silently |
| A compliant client sees refusals | its budget is below what it uses per window; in these runs the compliant client (one 16-operation call per job) was never refused |

## Trade-offs and going further

- **The cap is sized from slack.** The tightest task's slack after its existing blocking decides how long a call can be. The cap that was tested, 16 operations, leaves TH at 1.42 ms of a 2 ms period. A larger cap was not run, so any value above 16 is a prediction, not a result.
- **The budget needs a value above what a compliant client uses.** With one 16-operation call per job a 1 ms budget is never reached. A client that needs several such calls per window would be refused, and its work would have to be split or the budget raised.
- **The identity costs every context switch.** The 0.6 µs is paid by every thread, not only by TF-M clients. A design with few Non-Secure clients may prefer a fixed set of client threads and the identity only for them.
- **Exercise:** TH's worst response with the 16-operation cap is 1.42 ms and its period is 2 ms. Using 59 µs per operation, estimate the largest cap that keeps TH within its period, ignoring everything else, and say why the real limit is probably lower.
- **Exercise:** explain in two sentences why a forged tag rejects exactly TH's calls and not TL's, and what changes when the SPM supplies the identity.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | measured, STM32H573I-DK, isolation level 1 |
| **Read first** | [Mutex blocking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) |
| **Related** | [Chunking shapes blocking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/); [Floor and cap for the inference service](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai03-floor-and-cap/); [The connection pool](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a04-connection-pool/); [Response-time analysis](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) |
| **Evidence** | exp9z (secure budget): five cases with cap and budget, one run of 195 s; exp9af (client identity): five cases, with and without the client identifier extension |
