+++
title = "Two worlds on one core: TrustZone-M, veneers and PSA calls"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "What the Secure and Non-Secure states are, how a call crosses between them, what TF-M adds on top, and which side owns what on the two boards."
weight = 10

[params]
+++

After this page you can say what a security state is, how Non-Secure code enters the Secure world and comes back, what `psa_connect()`, `psa_call()` and `psa_close()` do on top of that, and how the two boards of this project split memory, interrupts and peripherals between the worlds. It is a reading page; every later page assumes these words.

## Before you start

- **Level 1.** You should know what an interrupt, a thread and a memory map are. No knowledge of TrustZone is needed.
- **Tools:** none.

## The idea

A Cortex-M33 with TrustZone-M is one processor that behaves as two. At any moment it runs in the **Secure** state or in the **Non-Secure** state, and the two see the hardware differently.

| | Non-Secure state | Secure state |
|---|---|---|
| Runs here | Zephyr and the application | Secure boot and, on the STM32H5, TF-M |
| May read | Non-Secure memory only | Secure, Non-Secure-Callable and Non-Secure memory |
| Own copies of | stack pointers, interrupt masks, MPU, CONTROL | the same registers, banked, out of reach of the other side |

Every address is attributed as Secure (S), Non-Secure (NS) or **Non-Secure Callable** (NSC). The attribution comes from two units, the SAU set by Secure software and the vendor's IDAU, and the more secure answer wins. Non-Secure code that touches an S address takes a fault.

### How a call crosses

Non-Secure code cannot jump into Secure code at will. The only legal entry is a **veneer** placed in NSC memory. A veneer starts with an `SG` (Secure Gateway) instruction. The hardware accepts a branch from Non-Secure code only if it lands on an `SG`; the veneer then continues into the Secure function, which returns with `BXNS`. The compiler generates the veneers. Crossing costs a few dozen cycles: [C02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/) measures 0.10 microseconds for an empty veneer call.

### What TF-M adds

A veneer exports one fixed function. Trusted Firmware-M (TF-M) turns the Secure state into a service environment instead: a Secure Partition Manager (SPM) that controls isolation and communication, and services packaged as Secure Partitions such as Crypto, Internal Trusted Storage (ITS), Protected Storage (PS) and Initial Attestation. Non-Secure software reaches them through the PSA client API:

1. `psa_connect()` opens a connection to a service.
2. `psa_call()` sends a request made of input and output vectors (IOVECs) and waits for the reply.
3. `psa_close()` ends the connection.

Some services are **stateless**: the Non-Secure wrapper (`psa_hash_compute()`, `psa_its_set()` and so on) is a single `psa_call()`, and TF-M allocates a connection for the length of that call. In the IPC model used here each partition is a thread with its own stack. The SPM checks that the client's vectors point to memory the client may use, saves the client's context, schedules the partition, which reads its input with `psa_read()` and writes its output with `psa_write()`, and then returns to the client. This is why a PSA call costs far more than a state change: [C01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/) takes it apart.

The project runs TF-M v2.3.0 with the IPC backend at **isolation level 1**, which separates the Secure from the Non-Secure environment but not the Secure partitions from each other.

### Interrupts across the boundary

Each interrupt belongs to one state. A Non-Secure interrupt can preempt Secure code; the hardware then saves `r4` to `r11` on the Secure stack and clears the registers so that nothing leaks. A Secure interrupt can preempt Non-Secure code, and the `PRIS` bit of AIRCR puts all Non-Secure priorities in the lower half (0x80 and above), so a Secure exception always wins and Non-Secure interrupt masking cannot delay it. Both boards here set it.

## On this board

Two boards, one Cortex-M33 each, with the Secure side built differently.

| | STM32H573I-DK | Renesas FPB-RA4E1 |
|---|---|---|
| Core and clock | Cortex-M33, 240 MHz | Cortex-M33, 100 MHz |
| Secure side | TF-M v2.3.0 (IPC, level 1) plus a Secure partition of my own | a bare Zephyr Secure image exporting plain veneers; no TF-M port exists for any Renesas RA part |
| Who attributes memory | SAU and the GTZC, which also marks peripherals and SRAM blocks | the IDAU alone: the chip has no SAU regions |
| Non-Secure timer | TIM6 (a local TF-M patch gives it to the Non-Secure world) | AGT0 and GPT1 |
| Secure timer | TIM7 | GPT2 |

The RA4E1 split is fixed by the boundary the IDAU is programmed with:

| Region | Secure | NSC | Non-Secure |
|---|---|---|---|
| Code flash | 0x0000_0000 to 0x0001_F7FF | 0x0001_F800 to 0x0001_FFFF (2 KB) | 0x0002_0000 to 0x0007_FFFF (384 KB) |
| SRAM | 0x2000_0000 to 0x2000_7FFF (32 KB) | none | 0x2000_8000 to 0x2001_FFFF (96 KB) |
| Data flash | 0x0800_0000 to 0x0800_0FFF | none | 0x0800_1000 to 0x0800_1FFF |

Interrupt slots 0 to 63 are Non-Secure and 64 to 95 are Secure. Every peripheral is Non-Secure except GPT2 and the flash controller. The boundary is written with the vendor's flash programmer, not by code, and the Secure image prints the monitor registers so the programmed values can be checked.

## How it is measured

Nothing on this page is measured; it fixes the vocabulary. Two measurements show it at work and are worth reading next: the interrupt that crosses the boundary (experiment exp5, [C01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/)) and the empty veneer against the empty `psa_call()` (exp9y, [C02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/)).

## What you should see

On the STM32H573I-DK boot console, TF-M announces itself before Zephyr starts:

```
[NOT] Booting TF-M v2.3.0**+g47b9f07b9
*** Booting Zephyr OS build v4.4.0-7043-g777ab585520e ***
```

The first line is the Secure world, the second the Non-Secure kernel. Every run of this project begins this way (recorded in each run's console log).

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| A Non-Secure image faults on its first call into the Secure world | the call does not land on an `SG` instruction in NSC memory, or the NSC region is not where the linker put the veneers |
| A Non-Secure interrupt never fires | the interrupt line is still attributed to the Secure state |
| A Secure timer interrupt is delayed by Non-Secure code | `PRIS` is not set, so Non-Secure `PRIMASK` or `BASEPRI` can block it |
| The RA4E1 boots but the Non-Secure image will not start | the IDAU boundary was never written, or does not match the memory split |

## Trade-offs and going further

- **A veneer is cheap and fixed; a PSA service is dear and general.** The veneer path has no message model, no scheduler and no isolation between callers. TF-M gives all three for tens of microseconds. [C02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/) puts a number on that trade.
- **Isolation level 1 is the weakest and the cheapest.** The results of this project are for level 1 unless a page says otherwise.
- **Exercise:** on the RA4E1 table, work out which side owns the address 0x0001_F800 and what a Non-Secure branch to 0x0001_F900 would do.
- **Exercise:** explain why a Non-Secure interrupt that preempts Secure code costs more than one that preempts Non-Secure code, using the register clearing described above.

## At a glance

| | |
|---|---|
| **Level** | Beginner |
| **How to run** | Reading page; nothing to run |
| **Status** | reading page, consistent with the measurements it points to |
| **Read first** | nothing |
| **Related** | [F02 Response-time analysis in ten minutes](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/); [M02 Two boards, one method](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m02-two-boards-one-method/); [C01 Anatomy of a Secure call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/); [C02 What TF-M costs over bare TrustZone-M](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/) |
| **Evidence** | Boot console of every run (STM32H573I-DK); RA4E1 monitor registers printed by its Secure smoke test |
