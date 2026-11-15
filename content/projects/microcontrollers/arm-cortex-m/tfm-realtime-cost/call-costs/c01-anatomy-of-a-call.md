+++
title = "Anatomy of a Secure call: where the 36 microseconds go"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "A TF-M transaction taken apart: fixed cost, cost per byte, cost per vector, and what a cold instruction cache adds. Code in the Secure state is not slower."
weight = 10

[params]
  lab = 3
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Intermediate"
+++

After this module you can write the cost of a TF-M call as a fixed part plus a part per byte and a part per vector, say which of the three phases of a transaction (connect, call, close) costs what, explain why running code in the Secure state is not itself the expense, and predict the cost of a call you have not measured. These numbers are the "C" in [F02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/).

## Before you start

- **Level 2.** [F01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/) explains connect, call and close and what an IOVEC is.
- **Tools:** the STM32H573I-DK with TF-M v2.3.0 (IPC model, isolation level 1), for the measurements.
- **Time:** exp6a to exp6d run about 17 seconds each.

## The idea

When a task asks the Secure world for a service, the processor does three things that can cost time: it changes security state, it carries the request through TF-M, and it copies the data. Three questions separate them.

1. **Is Secure code slower than Non-Secure code?** If it were, every protected operation would cost more in proportion to its length.
2. **What does a call cost with no data?** That is the fixed price of the framework.
3. **How does the price grow with data?** With the number of bytes, and with the number of vectors the bytes are split into.

To time the framework alone, the Secure partition has a service that does no work: it accepts the connection, reads every input vector, writes every output vector and replies. The exp6 figures below are means over 1000 calls after 100 warm-up calls (exp9c uses 500 after 50, exp5 200 after 20), taken with the cycle counter at 240 MHz ([M01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m01-hardware-timestamps/)).

## On this board

### Question 1: the same code in the two states

One workload operation (64 samples, a five-tap filter, mean, minimum, maximum and a CRC-32) takes 58.570 microseconds timed inside the Secure partition and 58.812 microseconds timed in the Non-Secure image: less than 0.5 percent apart. The Non-Secure figure includes the 0.233 microsecond cost of reading the clock; without it the two differ by 9 nanoseconds, about two cycles. Execution in the two states is equal. If protection costs time, it is paid at the crossing.

The crossing itself is small. When an interrupt crosses the boundary (exp5), the cost outside the handler is 22 cycles for a Secure handler over Secure code, 58 for Non-Secure over Non-Secure, and 89 to 92 when the state changes, at most 0.29 microseconds more than without a change. The Non-Secure handler interrupting Secure code is the dearest because the hardware also saves and clears `r4` to `r11`. A rerun of exp5 gave 0.353 microseconds for that case.

### Question 2: the phases of an empty transaction

| Phase (exp6a) | Mean, microseconds |
|---|---|
| `psa_framework_version()` | 1.78 |
| `psa_version()` | 2.18 |
| `psa_connect()` | 12.19 |
| empty `psa_call()` on an open connection | 14.00 |
| `psa_close()` | 11.59 |
| connect, call and close in one piece | 37.10 |

The three phases are each about a third of the transaction. The sum of the separately timed phases, 37.79, is larger than the whole, 37.10, by the three extra clock reads (3 times 0.233 microseconds, less rounding). The fixed cost of a transaction, called C0 in the model, was 36.2 microseconds in the first measurement campaign; the archived rerun above gives 37.10 microseconds including its own 0.233 microseconds of instrumentation, and the bare-versus-TF-M run in [C02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/) gave 37.4. The figure moves by about a microsecond from build to build.

### Question 3: bytes, vectors and direction

With the connection kept open and one input vector (exp6b):

| Payload | `psa_call()` mean, microseconds |
|---|---|
| 0 bytes (no vector) | 14.26 |
| 4 bytes | 16.93 |
| 16 bytes | 17.06 |
| 64 bytes | 17.58 |
| 256 bytes | 19.58 |
| 1024 bytes | 27.58 |
| 4096 bytes | 59.58 |

From 4 to 4096 bytes the time grows by 42.65 microseconds over 4092 bytes: **10.42 nanoseconds per byte**, 2.5 cycles, the price of copying between the two worlds' memory. The jump from 0 to 4 bytes, 2.7 microseconds, is the first vector, not the byte.

Keeping the total fixed and splitting it into more vectors (exp6c):

| Total payload | 1 vector | 2 vectors | 4 vectors |
|---|---|---|---|
| 256 bytes | 19.73 | 22.07 | 26.97 |
| 1024 bytes | 27.73 | 30.07 | 34.97 |
| 4096 bytes | 59.74 | 62.08 | 66.97 |

Each extra vector adds **2.42 microseconds**, whatever the payload. Direction does not matter, and the directions add (exp6d):

| Payload | Non-Secure to Secure | Secure to Non-Secure | Both |
|---|---|---|---|
| 64 bytes | 18.00 | 17.98 | 21.13 |
| 4096 bytes | 60.01 | 59.99 | 105.15 |

Putting the three together gives the cost model of the first study:

```
T_call  =  C0  +  alpha * B  +  beta * (extra vectors)
alpha = 10.42 ns per byte      beta = 2.42 us per vector
```

For the workload service (12 bytes in, 24 bytes out, one vector each) the model gives 41.4 microseconds for a complete transaction.

### Cold cache

The 8 KB instruction cache in front of the flash is shared by both worlds. Experiment exp9c times each phase warm (back-to-back trials) and cold (cache invalidated before each trial):

| Target | Phase | Warm, microseconds | Cold, microseconds |
|---|---|---|---|
| Empty service | connect | 13.02 | 17.45 |
| | call | 14.73 | 15.68 |
| | close | 11.67 | 11.91 |
| | total | 39.42 | 45.03 |
| One operation, Non-Secure | total | 58.83 | 59.74 |
| Workload service | total | 104.18 | 110.42 |

The cold penalty sits mostly in `psa_connect()`, 4.4 microseconds. These totals are larger than the exp6a ones because each phase carries its own clock reads.

## How it is measured

Each experiment prints its configuration (iterations, warm-up, whether the connection is persistent) and then the minimum, mean and maximum in cycles and nanoseconds, with the instrumentation cost reported but not subtracted. exp6a times each API call; exp6b varies the length of one input vector; exp6c keeps a fixed total and changes the number of vectors; exp6d moves data from Non-Secure to Secure with `psa_read()`, from Secure to Non-Secure with `psa_write()`, or both. exp9c prints every sample. The platform is cycle-deterministic: the maxima sit a fixed 4 to 6 microseconds above the mean, which is a whole number of interrupt services, not a tail.

## What you should see

- A transaction with no data takes about 37 microseconds, split roughly in thirds.
- Time grows linearly with payload, 10.42 nanoseconds per byte, and with 2.42 microseconds per extra vector.
- One operation moved into a TF-M call (12 bytes in, 24 out) costs 41.4 microseconds by the model and 46.8 microseconds in the periodic task set of experiment exp8b. About 5 to 6 microseconds of that are not isolated in the first study; a 150-operation call took 8.848 ms against 8.801 ms without TF-M, a difference of 47 microseconds, so the cost does not depend on the work inside the call.
- The caller pays this cost, not the tasks above it: a higher-priority task released during a long TF-M call starts only 1.06 to 1.21 microseconds later than in a Non-Secure baseline ([B01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/)).

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| The transaction is a microsecond or two dearer than quoted | a different build; the fixed cost differs by about 1 microsecond between builds |
| The phases do not add up to the whole | each phase carries its own clock reads (0.233 microseconds); the sum is larger by two to three of them |
| The first call after a long pause is slow | cold instruction cache: about 4.4 microseconds in connect, 5.6 in the whole transaction |
| Per-byte cost looks like 20 nanoseconds | the call moves the data in both directions; each direction costs 10.42 |

## Trade-offs and going further

- **Keep connections open.** On a persistent connection a call costs 14.0 microseconds against 37 for the whole transaction. Stateless services (Crypto, ITS, PS) open and close one for you on every call.
- **Fewer, larger vectors.** Two small vectors cost 2.4 microseconds more than one vector of the same total size.
- **Exercise:** predict the time of a `psa_call()` with 2 vectors of 1024 bytes (2048 bytes in total), using 14.0 microseconds for the empty call, 2.7 microseconds for the first vector, the per-byte price and the per-vector price. exp6b and exp6c do not measure this point.
- **Exercise:** the workload service moves 12 bytes in and 24 out. How much of the 41.4 microseconds is data movement, and how much is the fixed cost?

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **How to run** | Experiments exp6a to exp6d and exp9c on the STM32H573I-DK, 17 seconds each |
| **Status** | measured; the model reproduces the call cost to within a few microseconds |
| **Read first** | [F01 Two worlds on one core](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/) |
| **Related** | [C02 What TF-M costs over bare TrustZone-M](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/); [C03 The service catalogue](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c03-service-catalogue/); [F02 Response-time analysis in ten minutes](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/); [S04 Cache-related preemption delay](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s04-cache-related-preemption-delay/) |
| **Evidence** | exp6a (phases), exp6b (payload), exp6c (vectors), exp6d (direction), exp9c (warm and cold cache, every sample), exp5 (interrupt across the boundary), exp8b (cost in a periodic set) |
