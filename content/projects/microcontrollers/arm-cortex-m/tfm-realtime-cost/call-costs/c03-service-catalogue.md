+++
title = "The price list: what each Secure service costs, from 38 microseconds to 0.3 seconds"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "The isolated cost of every TF-M service an application is likely to call, and why each row is also a blocking term for every task above the caller."
weight = 30

[params]
  lab = 5
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Intermediate"
+++

After this module you can look up what a TF-M service costs for a given payload, say which of the costs are small enough to ignore and which will dominate a schedulability analysis, and turn a row of the catalogue into the blocking term of a task set. The catalogue spans four orders of magnitude, and the largest rows decide the design.

## Before you start

- **Level 2.** [C01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/) gives the call overhead that every row contains. [F02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) explains why the longest single call is the blocking term.
- **Tools:** the STM32H573I-DK with TF-M v2.3.0, for the measurements.
- **Time:** the catalogue run takes about a minute.

## The idea

Each PSA API call is one `psa_call()`, and Zephyr holds one mutex for the whole of it. The longest single call of a lower-priority TF-M user is therefore the **blocking term** of every task above it ([B01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/)), and the blocking term of a system is read straight off a catalogue of the services its lower-priority tasks use. Preemptible Secure calls do not change this: the mutex is held for the whole call, so a higher-priority TF-M user still waits for it.

## On this board

Experiment exp9l measures each service in isolation: `main` alone at priority 0, the cycle counter read inline, 200 repetitions for the fast services and 20 for the slow ones, after one warm-up call. Storage writes use a fresh value every time, so every write is a real write. Maxima are within 9 percent of the means. Times are in microseconds.

| Service | Payload | Mean | Maximum |
|---|---|---|---|
| Random number | 32 bytes | 37.8 | 37.8 |
| SHA-256 | 64 bytes | 78.6 | 85.4 |
| | 256 bytes | 134.2 | 141.0 |
| | 1024 bytes | 356.7 | 363.4 |
| | 4096 bytes | 1246.6 | 1253.0 |
| AES-256-GCM encrypt | 64 bytes | 583.3 | 589.4 |
| | 256 bytes | 1648.8 | 1654.6 |
| AES-256-GCM decrypt | 64 bytes | 584.3 | 590.4 |
| | 256 bytes | 1650.7 | 1656.6 |
| ECDSA P-256 sign | 32 bytes | 102,655 | 102,988 |
| ECDSA P-256 verify | 32 bytes | 298,696 | 298,902 |
| ITS set | 64 bytes | 5,135 | 5,198 |
| | 512 bytes | 6,297 | 6,360 |
| ITS get | 64 bytes | 43.9 | 51.3 |
| | 512 bytes | 58.7 | 66.0 |
| PS set | 64 bytes | 59,404 | 59,440 |
| | 512 bytes | 80,441 | 81,019 |
| PS get | 64 bytes | 1,230 | 1,236 |
| | 512 bytes | 3,729 | 3,735 |

Reading the table in classes:

| Class | Services | Blocking term |
|---|---|---|
| tens of microseconds | random number, ITS get | negligible next to a 2 ms task |
| hundreds of microseconds | SHA-256 up to 1 KB, AES-GCM on 64 bytes | a fraction of a millisecond |
| about a millisecond | SHA-256 over 4 KB, AES-GCM on 256 bytes | comparable to a 2 ms period |
| milliseconds | ITS set, PS get | several periods of a fast task |
| tens of milliseconds | PS set | whole periods of every task |
| a tenth of a second and more | ECDSA sign (0.10 second), ECDSA verify (0.3 second), which this TF-M build runs in software | many periods of every task |

A single signature verification anywhere below a TF-M user is a 0.3 second blocking term for that user, and for every task above it.

### Costs that grow with the payload

The hash grows at (1246.6 − 78.6) / (4096 − 64) = 0.29 microseconds per byte. Software AES-256-GCM grows at (1648.8 − 583.3) / (256 − 64) = 5.5 microseconds per byte, nearly twenty times as steeply, and the build rejects AES-GCM beyond 256 bytes. Storage writes do not follow a simple slope: they depend on what the filesystem already holds ([S01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/) and the storage-state experiment exp9w). A 512-byte ITS write took 4.3 to 8.7 milliseconds across runs.

### Cross-checks

Two other runs back the catalogue. An earlier campaign (exp9d, AES-128 with a 12-byte nonce) gave SHA-256 over 4 KB at 1229.5 microseconds, ECDSA verify at 297.5 milliseconds and a 512-byte ITS write at 4.40 milliseconds. A second catalogue run (exp9l, isolation level 2, another board unit) agrees with the table within 3 percent on the compute-bound services: random 36.7 microseconds, SHA-256 over 4 KB 1228.7 microseconds, ECDSA sign 103.4 milliseconds, verify 300.2 milliseconds. It differs more on storage: 4.4 milliseconds for the 512-byte ITS write and 70.7 milliseconds for the PS write. That run differs in more than the storage state, so the pair does not isolate it.

### What was not measured

Initial Attestation (`psa_initial_attest_get_token()`) is written as experiment exp9s but could not be run. Zephyr's TF-M module refuses the Initial Attestation partition unless local copies of two libraries are supplied, because of a licensing restriction on a dependent library, and the workspace has neither. By its parts the token should cost about 0.1 second (SHA-256 of the boot record, roughly 0.1 millisecond, plus a software ECDSA sign of 103 milliseconds), a blocking term of the same class as a signature. That is an estimate, not a measurement.

## How it is measured

The experiment's header states the method: the blocking term of the model is the longest single `psa_call()` of a lower-priority TF-M user, so the analysis needs the cost of each service an application may use, by payload size. Each API call below is one `psa_call()` (the Non-Secure API wrappers are stateless), measured in isolation with the cycle counter. Each result line has the form:

```
SVC,<service>,<size>,<n>,<mean_cyc>,<min_cyc>,<max_cyc>
```

The services are SHA-256, AES-256-GCM encrypt and decrypt, ECDSA P-256 sign and verify (with a key generated once), random number, and ITS and PS set and get. The tables above convert cycles to microseconds at 240 MHz. Payloads above the build's limits (AES-GCM beyond 256 bytes and ITS assets of 2 KB) are rejected and return in a few tens of microseconds; the log ends with an error count (626 in the default run), and those rows are left out of the table.

## What you should see

- The compute-bound services repeat to within a few microseconds: the maxima of SHA-256 over 4 KB sit about 6 microseconds above the mean.
- ITS reads cost tens of microseconds and PS reads milliseconds; every write costs milliseconds or more.
- Rows that are quick but suspicious (an AES-GCM of 1 KB in 45 microseconds, or a 2 KB ITS set in 84 microseconds) are rejected calls, not fast ones.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| A service returns in a few tens of microseconds with a large payload | the build rejected it (AES-GCM above 256 bytes, ITS asset of 2 KB); check the error counter in the log |
| A storage write is dearer than the table | the filesystem holds more live data; the write cost follows the stored bytes |
| A service seems cheaper on a second board | a different isolation level or build; compute-bound services agree within 3 percent, storage does not |
| An attestation figure is expected | none is measured; the build cannot include the partition |

## Trade-offs and going further

- **A catalogue is a design input.** If a task above the caller must meet a deadline shorter than a service's cost, the service has to be split ([B02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/)) or kept in a task that no deadline task sits above.
- **Storage writes cannot be chunked.** A PS write is one call of 59 to 81 milliseconds; the only options are to keep it below no deadline task or to bound it explicitly.
- **Exercise:** a task with C = 703.379 microseconds and a 2000 microsecond deadline sits above a task that calls Secure services. Using the table, which services can the lower task call if the high task must still meet its deadline with blocking alone (ignore other terms)?
- **Exercise:** use the slope above to predict SHA-256 over 8 KB. Why might the hash over 4 KB already be a blocking term for a 2 ms task?

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **How to run** | Experiments exp9l (catalogue) and exp9d (earlier campaign) on the STM32H573I-DK |
| **Status** | measured on two runs; attestation not measured |
| **Read first** | [C01 Anatomy of a Secure call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/) |
| **Related** | [B01 Blocking through the PSA mutex](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/); [B02 Chunking shapes the blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/); [S01 What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/); [F02 Response-time analysis in ten minutes](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) |
| **Evidence** | exp9l (service catalogue, isolation levels 1 and 2), exp9d (earlier campaign), exp9s (written, blocked by a build licensing gate), exp9w (storage state) |
