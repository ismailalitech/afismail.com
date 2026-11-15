+++
title = "The validation report"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "Every result of the project in one place, organised by the question it answers, with the experiment and the board behind it."
weight = 10

[params]
+++

This is the project's results in one place. For every result it gives the experiment that produced it, the board, and whether it is a direct measurement or the output of the analysis. What the project did not do, and where the sources disagree, is on the next page: [limits and open questions](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x02-limits-and-open-questions/).

## Before you start

- **Level 3.** Read [the response-time primer](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) first. The words *blocking*, *interference* and *per-preemption term* are used as they are defined there.
- **How to read the tables.** The **Kind** column says what the entry is. *Measured* is a hardware-timestamped result from a recorded run. *Bound* is the output of the response-time analysis, compared with what the boards produced.
- **Boards.** Everything is from the STM32H573I-DK with Zephyr and TF-M unless the row names the FPB-RA4E1.

## The idea

A result is only as good as its conditions. Each row therefore names the experiment (`exp…`), so that a number can be traced to the run that produced it and to the module that explains it. The questions follow the order of the project: what a call costs, what it blocks, what a storage write does, what the Secure side can enforce, and what a Secure neural network costs.

## What a call costs

| Question | Result | Experiment | Kind |
|---|---|---|---|
| Is the same code slower in the Secure state? | Less than 0.5 % change in execution time | exp5 to exp7 series | Measured |
| What does an empty TF-M transaction cost? | About 36 to 39 µs, depending on the build; 36.2 µs in the reference build | exp6a, exp9c, exp9y | Measured |
| What does each payload byte add? | 10.42 ns | exp6b | Measured |
| What does a bare TrustZone-M call cost? | About 0.1 µs (24 to 28 cycles) | exp9y | Measured |
| How much later does a high-priority task start when released during a lower-priority TF-M call? | 1.06 to 1.21 µs later than in a Non-Secure baseline | exp7a to exp7c | Measured |

The modules behind these rows: [anatomy of a call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/), [TF-M over bare TrustZone-M](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/) and [the service catalogue](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c03-service-catalogue/).

## What a call blocks

| Question | Result | Experiment | Kind |
|---|---|---|---|
| How long can one Secure call block other tasks? | The longest single call of a lower-priority task: 38 µs (random number), about 1.25 ms (SHA-256 of 4 KB), 5 to 6 ms (protected-storage write), up to 0.3 s (software ECDSA verify) | exp9a, exp9d, exp9l | Measured |
| Does the model predict the blocking of one release? | To under 0.1 µs | exp9a | Bound |
| Can chunking shorten it? | A 4 KB SHA-256 in 16 calls: the longest call is 11 times shorter, the total time 42 % longer | exp9p | Measured |
| Do the bounds hold on random task sets? | All 288 observed worst cases of 96 sets (94,716 jobs) are bounded; the median is 0.98 of the bound | exp9ab | Bound |

See [mutex blocking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/), [chunking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/) and [random task sets](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b04-random-task-sets/).

## What a storage write does

| Question | Result | Experiment | Kind |
|---|---|---|---|
| Does a Secure storage write slow code that never touches storage? | Code running from flash is 2.0 to 2.5 times slower for the whole write, because the flash driver turns the instruction cache off | exp9h, exp9i | Measured |
| Does the core stop? | Each sector erase stops it for 1.3 to 2.9 ms, with no exception taken | exp9i | Measured |
| How long does a write take? | 4.3 to 8.7 ms for 512 bytes, depending on the state of the storage | exp9w | Measured |
| Can the freeze be removed? | Running the erase sequence from SRAM brought interrupt latency to 1 µs or less through every erase; storage in the second flash bank removes the freeze | exp9i, exp9j | Measured |

See [what a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) and [fixing the freeze](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s03-fixing-the-freeze/).

## What the Secure side can enforce

| Question | Result | Experiment | Kind |
|---|---|---|---|
| Can one client take the deadlines of a higher task? | A 2.96 ms call below a 2 ms TF-M user caused 30 % deadline misses | exp9z | Measured |
| Does a cap in the Secure partition stop it? | The cap alone brought the misses to zero | exp9z | Measured |
| Does a per-client budget help? | It cut the offender's accepted calls by 3.5 times and left a well-behaved client untouched | exp9z | Measured |
| What does client identity cost? | 0.6 µs per context switch with the identity wired through the thread switch hook | exp9af | Measured |
| What do faults cost? | A full reset of about 1.5 s; with a one-line fatal-error policy all 11 injected fault kinds recovered | exp9ad | Measured |
| What does an update cost in availability? | A 432 KB image: 5.5 s down with MCUboot swap, 2.9 s with overwrite-only | exp9aa | Measured |
| Is the connection pool shared? | With eight persistent connections held, every stateless call from every task is refused | exp9ac | Measured |

See [budget and identity](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a01-secure-side-budget-and-identity/), [faults and recovery](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a02-faults-and-recovery/), [update downtime](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a03-update-downtime/) and [the connection pool](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a04-connection-pool/).

## What a Secure neural network costs

| Question | Result | Experiment | Kind |
|---|---|---|---|
| Is the Secure slowdown a TrustZone cost? | No. The 2.8 to 5.4 times of the first build came from compiling Secure code with `-fno-builtin`. With builtins restored the Secure inference is 1.03 to 1.15 times the Non-Secure one | exp9ai | Measured |
| Does it reproduce on the second board? | Yes, on the FPB-RA4E1: 2.43 to 4.67 times with `-fno-builtin` | CMSIS-NN benchmark | Measured |
| What does one call do to a 2 ms task? | At 8 channels the one-call inference blocks for 8.4 ms and the task misses 39 % of its deadlines | exp9ai, exp9aj | Measured |
| What removes the misses? | Chunks of 8 or 4 rows | exp9aj | Measured |
| What is the floor of the blocking term? | One row plus the call path, 200 µs, for 2.5 % more Secure time | exp9ak | Measured |
| Can the Secure side enforce it? | A wall-clock cap in the Secure partition gives the cap plus 18 to 26 µs, without trusting the client | exp9ak | Measured |
| Do the bounds hold with the two extra terms? | The bounds of the two non-ML tasks hold in all 44 task and case pairs (maximum ratio 0.999) and that of the ML task within 0.4 % | exp9aj, exp9ak | Bound |

See the four modules of [Secure AI inference](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/).

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| A number on this page differs from the module that explains it | The module quotes the run, the table quotes the rounded result; each module names the experiment, so compare there |
| Your own measurement of a call is 5 % off the figure here | The figure is build-dependent: each phase carries its own clock reads, and a different TF-M build moves it by about 1 to 3 µs |
| You cannot reproduce a flash slowdown | Check that the code runs from flash and that the instruction cache is the one the driver turns off on your port |

## Trade-offs and going further

- **Rounded figures versus runs.** The tables round for reading. The modules keep the exact values and the spread between runs.
- **Exercise:** pick one row, find its module, and list the conditions under which it would not hold on your own board.
- **Exercise:** the bounds are only as good as their terms. Take the random task set result and decide which one term, if it were wrong by half, would break the bound first.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | measured; write-up in progress |
| **Read first** | [Response-time analysis in brief](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) |
| **Evidence** | The experiments named in each row; the raw runs are kept with their configuration and are not public |
| **Related** | [Limits and open questions](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x02-limits-and-open-questions/) |
