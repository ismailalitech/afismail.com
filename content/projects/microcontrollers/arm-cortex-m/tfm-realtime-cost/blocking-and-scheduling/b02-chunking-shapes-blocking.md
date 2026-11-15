+++
title = "Chunking and batching: choosing how long a Secure call may be"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "The blocking term is the longest single Secure call, so it can be designed: split a crypto service into many short calls, or batch work into one long one, and know which services cannot be split at all."
weight = 20

[params]
  lab = 7
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Intermediate"
+++

After this module you can turn a long Secure service into a number of shorter calls, predict both the shorter longest call and the extra time the caller pays, decide whether a given service can be split at all (hashing and encryption can, storage writes cannot), and say what batching does in the opposite direction. The measured effect is large: a 4 KB SHA-256 split into 16 calls has a longest call 11 times shorter, and the response of the highest-priority task falls from 1675 to 585 µs.

## Before you start

- **Level 3.** Read [One mutex, one blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) first. Its blocking term, the longest single `psa_call()` of a lower-priority TF-M user, is the quantity this module shapes.
- **Tools:** the STM32H573I-DK with the TF-M build, for the measurements. The arithmetic needs only a calculator.

## The idea

The blocking a task suffers is set by the longest single call below it, not by the total work a lower task does. So the same work can be issued in two shapes:

- **Chunked:** n shorter calls. The longest call shrinks to roughly its n-th share plus the overhead of one call; the caller's total time grows by one call overhead for each extra call.
- **Batched:** one longer call that does k operations. The caller's total time shrinks, because the transaction overhead is paid once; the longest call grows by k times the work.

Chunking buys a lower blocking term for the tasks above, at the price of the caller; batching does the opposite. The blocking term is therefore a design parameter of the service, not a fixed property of the platform.

A multipart operation also needs a setup call and a finish call, so n chunks mean n + 2 calls. Measured on this board, each call beyond the first costs about 30 µs for the hash and about 35 µs for the authenticated cipher. That gives a rule of thumb that the data below confirm to within about 10 %:

```
longest call  ≈  S(1) / n + about 30 µs
total time    ≈  C(1) + (n + 1) × about 30 µs
```

## On this board

### Splitting crypto services (exp9p, isolated)

Each row is one operation as the caller sees it. "Calls" counts every API call (setup, updates and finish); "longest" is the longest individual call, which is the blocking term S; the two factors are relative to the single-call version.

| Service | Chunks | Calls | Total time | Longest call | Total × | Longest × |
|---|---|---|---|---|---|---|
| SHA-256, 4 KB | 1 | 1 | 1252 µs | 1257 µs | 1.00 | 1.000 |
| | 2 | 4 | 1346 µs | 632 µs | 1.08 | 0.503 |
| | 4 | 6 | 1407 µs | 334 µs | 1.12 | 0.266 |
| | 8 | 10 | 1530 µs | 185 µs | 1.22 | 0.147 |
| | 16 | 18 | 1774 µs | 111 µs | 1.42 | 0.088 |
| | 32 | 34 | 2263 µs | 74 µs | 1.81 | 0.059 |
| AES-256-GCM, 256 B | 1 | 1 | 1621 µs | 1627 µs | 1.00 | 1.000 |
| | 8 | 11 | 1974 µs | 220 µs | 1.22 | 0.135 |

![Left: longest single call and total cost relative to one call, for SHA-256, AES-GCM and ITS writes, isolated. Right: worst response of the two upper tasks on the periodic set when the lowest task hashes 4 KB in 1, 4 or 16 calls, with the bound.](/images/tfm/fig10_chunking.png)

*Crypto chunks well; storage does not. Right: the worst responses of TH and TM fall as the call is split, and follow the bound.*

### On a periodic set (exp9r)

The set is the one from the previous module in its hardware-timed form (exp9k): TH (2 ms, one TF-M transaction), TM (5 ms, never calls TF-M) and TL (23.1 ms), with releases generated and timestamped by hardware timers. TL now hashes 4 KB, as one call or as 4 or 16 multipart calls. The bound uses TL's longest single call as B and ε = 10 µs.

| TL activity | Longest call | TH max / bound | TM max / bound | TH jobs blocked |
|---|---|---|---|---|
| 16 Non-Secure operations | none | 470 / 470 (1.000) | 1943 / 1951 (0.996) | 0 |
| hash, 1 call | 1260 µs | 1675 / 1730 (0.968) | 3585 / 3681 (0.974) | 146 |
| hash, 4 calls | 335 µs | 809 / 805 (1.004) | 2748 / 2757 (0.997) | 174 |
| hash, 16 calls | 111 µs | 585 / 582 (1.006) | 2525 / 2533 (0.997) | 255 |

Three things to read from this table.

1. **The bound tracks the longest call.** TH's worst response falls from 1675 to 809 to 585 µs, and TM's from 3585 to 2525 µs, even though TM never calls TF-M: its push-through blocking is now also one short call.
2. **The caller pays.** TL's own cost rises by 12 % and 41 % (1260, 1413, 1775 µs). No deadline is missed anywhere.
3. **Blocking becomes frequent and short instead of rare and long.** TH is blocked on 146, 174 and 255 jobs, each time for less, which is what a worst-case analysis wants.

In the two chunked cases the bound is exceeded by 3 to 4 µs (0.4 to 0.6 %). The difference is the hand-off of the mutex: TH blocks, the kernel switches to TL, TL unlocks, and the kernel switches back. Those two context switches are not in the single per-job overhead. Adding about 10 µs per blocking to the bound brings the ratios to 0.99.

### The other direction: batching (exp9b)

exp9b uses a two-task set (T1 at 2 ms with 12 operations, high priority; T2 at 5 ms with 25 operations) and replaces k of T1's operations by the same work done in the Secure partition, in three ways.

| Pattern | What it does | Cost added per operation |
|---|---|---|
| Separate | k transactions: connect, call and close each time | 44.8 to 47.0 µs |
| Persistent | one connection opened at start, k calls per job | 20.4 µs (at k = 12) |
| Batched | one transaction per job whose single call runs k operations | 47.0 µs in total, whatever k is |

All 22 configurations ran with no missed deadline and no Secure error, and a response-time simulation calibrated on k = 0 predicted T2's mean and maximum within 0.15 % and 0.28 %. A persistent connection halves the per-operation cost. Batching makes the cost constant, but the single call then holds the mutex for k operations (an operation is about 58.8 µs of work), so it lengthens the blocking term of every TF-M user above. At k = 12 the separate pattern already takes 62 % of the CPU for T1.

### What chunking cannot do: storage

A storage write costs the same whatever its size. After the filesystem was cleaned between runs (exp9p, rerun with every asset removed, no errors), an ITS write took 5.0 ms for 64 or 512 bytes, and a PS write 62 to 74 ms.

| Service | Assets | Total time | Longest call |
|---|---|---|---|
| ITS set, 512 B | 1 / 2 / 4 / 8 | 5.03 / 9.95 / 20.0 / 39.4 ms | 5.03 / 5.05 / 5.06 / 5.08 ms |
| PS set, 512 B | 1 / 2 / 4 / 8 | 73.6 / 125.5 / 244.4 / 489.4 ms | 73.6 / 64.3 / 61.7 / 61.7 ms |

Splitting a storage write multiplies the total and leaves the longest call where it was. The blocking term of a storage writer cannot be shaped this way; it has to be accepted, or the writer has to be moved where no deadline task shares its mutex.

What the task above the writer then suffers is shown by exp9m, a 2 ms PI control loop (priority 1, no TF-M use) regulating a simulated plant, with TL writing 512 bytes to ITS below it. 2000 control jobs per case:

| TL activity | Late jobs | Start latency, max | Actuation interval, max | Steady-state RMSE | Max error |
|---|---|---|---|---|---|
| none | 0 | 9 µs | 2.004 ms | 0.0191 | 0.057 |
| write, preemptible | 78 | 2.91 ms | 4.88 ms | +4 % | +25 % |
| write under `k_sched_lock` | 476 | 7.56 ms | 9.56 ms | +29 % | +62 % |

For a controller that never calls TF-M, the preemptible write is the better choice: it only pays the erase freeze (2.9 ms, 4 % of jobs), while the lock makes it wait for the whole write (7.6 ms, 24 % of jobs). The freeze itself is explained in [What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/).

## How it is measured

**Isolated (exp9p).** The measuring thread runs alone, at priority 0, and reads the DWT cycle counter around every API call. For each operation it reports the total of all calls and the longest single call, 50 repetitions per crypto row. The output line has the form:

```
CHUNK,<service>,<total_B>,<n_chunks>,<calls>,<reps>,
      <total_mean_cyc>,<total_max_cyc>,<single_max_cyc>
```

**Periodic (exp9r).** The hardware-timed set above, with 2000 TH jobs per case; every task body is timed alone first, and those maxima are the C and S in the bound.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| The bound is exceeded by a few microseconds in the chunked cases | the mutex hand-off, two context switches per blocking, is not in ε; add about 10 µs per blocking |
| Storage rows fail after a few assets | the storage holds a limited number of assets and the test exhausted it; remove every asset between configurations (the first two exp9p runs failed this way) |
| The ITS write costs 9 ms in one run and 5 ms in another | the write cost follows the state of the storage; see [What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) |
| A chunked caller now misses its own deadline | the extra calls add to its cost: 41 % more for 16 calls of the hash |

## Trade-offs and going further

- **Chunk size is a bargain with the caller.** Going from 16 to 32 hash chunks shortens the longest call from 111 to 74 µs but raises the total from 1774 to 2263 µs. Beyond a point the extra overhead outweighs the gain.
- **Chunking has a floor.** The longest call cannot fall below one share of the work plus one call overhead. The same idea applies to a neural-network inference, covered in [Secure AI inference](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/).
- **Exercise:** from the SHA-256 rows, estimate the overhead of one extra call. Use it to predict the longest call and the total time for AES-256-GCM over 256 B in 4 chunks (7 calls), then compare with the measured 398 µs and 1831 µs. Why is the prediction a little low on the total?
- **Exercise:** TH has a 2 ms period and a 500 µs margin for blocking. Which of the hash variants (1, 4 or 16 calls) are acceptable, and what does each cost TL?

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **Board** | STM32H573I-DK, Zephyr with TF-M v2.3.0 |
| **Status** | validated on hardware |
| **Read first** | [One mutex, one blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) |
| **Evidence** | exp9p (isolated chunking, with the cleaned storage rerun); exp9r (periodic set, 1 / 4 / 16 calls); exp9b (22 configurations, three invocation patterns); exp9m (control loop above a storage writer) |
| **Related** | [The service catalogue](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c03-service-catalogue/) · [Granularity decides the misses](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai02-granularity-decides-misses/) · [Budget and identity enforced by the Secure side](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a01-secure-side-budget-and-identity/) |
