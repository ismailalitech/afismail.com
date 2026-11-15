+++
title = "Instrumented stream acquisition on PolarFire SoC"
description = "An FPGA data source, a DMA path into DDR, Linux on three RISC-V cores and a real-time supervisor on the fourth, built to be measured and made to fail on purpose."
date = '2026-11-15T12:00:00+01:00'
draft = false
weight = 20
aliases = ["/work/pfdaq-polarfire-soc/"]

[params]
  project = true
  platform = "Microchip PolarFire SoC"
  problem = "A data path that crosses an FPGA, a DMA, an operating system that is not real-time and a second processor is easy to make work once and hard to trust. Every layer can hide a fault the others cannot see."
  role = "Designed and built the complete system: the FPGA logic and its testbenches, the Linux image, the real-time firmware, the capture and measurement tools, and the board test suites."
  result = "27 of 27 functional tests pass from a freshly written SD card; injected faults are caught in every payload mode; the supervisor answers an interrupt in 0.5 microseconds typically, against 78 microseconds for a Linux user-space program."
  hardware = "Microchip PolarFire SoC Discovery Kit (MPFS095T): one E51 and four U54 RISC-V cores, FPGA fabric, 1 GB DDR4"
  tools = "Libero SoC 2026.1, Icarus Verilog, Yocto (Scarthgap), FreeRTOS, Python"
  action = "/resources/pfdaq-explorer/"
  action_text = "Explore the architecture"
  guide = "/projects/fpga-soc/microchip-polarfire-soc/pfdaq/boot-and-images/x03-reproduce-from-empty-sd/"
  toc = true
+++

## Problem

Test data is easy to generate and hard to trust once it has travelled through hardware, a DMA controller, a cache, a
kernel and a user program. When the end result is wrong, any layer might be at fault. I wanted a system in which every
layer could be checked independently, made to fail on purpose, and measured, so that a claim about it could be backed
by a record.

## Hardware and constraints

The board is the PolarFire SoC Discovery Kit. Its chip combines five RISC-V cores with an FPGA, which allows each job
to run where it fits.

| Core | Runs | Why there |
|---|---|---|
| E51 | Hart Software Services (boot monitor) | starts everything else |
| U54, three cores | Linux 6.18, built with Yocto | configuration, capture, verification, network |
| U54, fourth core | A supervisor on FreeRTOS, or the same source on bare metal | must keep its timing whatever Linux does |

Constraints that shaped the design:

- Two software contexts is the vendor's maximum, so FreeRTOS and bare metal are alternative builds of the same
  supervisor, never present together.
- The boot flash holds the vendor's boot monitor. Nothing in this project reprograms it; only the fabric is programmed.
- The DMA controller has rules that its documentation does not state. They were found by testing and are collected in
  [DMA stream descriptors](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/soc-integration/i04-dma-stream-descriptors/).

The fabric half of the system, as the vendor's tool shows it: the project's own block, `pfdaq_core`, feeds the DMA
controller over an AXI4-Stream link and raises two latency interrupts. The other blocks are the reference design's.

[![The FIC_0_PERIPHERALS canvas in Libero SoC: pfdaq_core, the DMA controller, its initiator and target interconnects and the on-chip SRAM](/pfdaq/evidence/v0.5.1/build/libero-fic0-peripherals.png)](/pfdaq/evidence/v0.5.1/build/libero-fic0-peripherals.png)

## My contribution

- **FPGA logic.** A stream source that produces framed data (header, sequence number, timestamp, payload, CRC-32) two
  words per clock, with counter, pseudo-random and FIR payloads, fault injection, a real-time mode with credits and
  counted drops, and an abort that never leaves the DMA waiting. A two-channel latency unit that measures how long
  software takes to answer an interrupt, with 20 ns resolution.
- **Software.** A Linux capture tool that verifies every frame against a software model, a kernel driver, and a
  supervisor that checks Linux against the fabric's own counters.
- **Verification.** Testbenches that only record, judged by independent Python models; a board suite with 27 functional
  tests, run from a freshly written card.
- **Measurement.** The interrupt-to-acknowledge latency at five software levels, measured by the fabric itself.

The parts of the project, each with its notes and numbered labs, are listed at the top of this page, in the order a
reader would work through them.

## Architecture

One burst, from start to verified:

1. The Linux capture tool writes a *descriptor* into memory (where the data goes, how many bytes) and tells the DMA
   controller where it is.
2. It sets the frame length and count on the stream source and starts it.
3. The source sends frames as a 64-bit AXI4-Stream, two words per 125 MHz clock.
4. The DMA writes the stream into DDR; when the byte count is reached it raises an interrupt.
5. Linux copies the burst out and checks every frame.
6. It reports to the supervisor over RPMsg. The supervisor enforces a deadline and compares the report with the
   fabric's own sequence counter, which it reads directly.

The [architecture explorer](/pfdaq/explorer/) shows every component and connection, and plays this walk step by step.
The full register maps, frame format and protocols are in the [architecture reference](/resources/pfdaq-architecture/).

## Verification

Three kinds of evidence, kept apart on purpose:

- **Simulation.** 20 stream scenarios and 4 latency phases, each judged by a model written separately from the RTL.
- **Build.** Timing met in all corners, all 64 pins placed, 26 % of the fabric used.
- **Board.** The full suite on a freshly written SD card, 30 warm reboots, and the latency measurements.

Every number is traced to a record with the command and the conditions that produced it:
[results and evidence](/resources/pfdaq-results/).

## Results and limits

| Question | Answer |
|---|---|
| Does it work from a clean start? | 27 of 27 functional tests pass from a freshly written card |
| Does it come up every time? | 30 of 30 warm reboots, both systems up |
| Are injected faults caught? | Every corrupted CRC, skipped sequence number and flipped bit, in all three payload types |
| Hardware path speed | 931 to 947 MB/s into memory (measured on an earlier fabric version) |
| Verified path speed | 29.6 MB/s for counter payload: one Linux core copying and checking |
| Interrupt response, supervisor core | 0.5 microseconds typical, 3.1 microseconds worst seen, none missed in 600,000 |
| Interrupt response, Linux user space | 78 microseconds typical, up to 5.1 ms |

Limits, stated plainly:

- **Odd frame lengths in multi-frame bursts corrupt data.** The stream is correct in simulation and timing is met; the
  cause is not found. The capture tool refuses the combination. See [the case study](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/soc-integration/k10-odd-frame-lengths/).
- **Linux cannot restart the supervisor core.** It can stop it; the boot monitor rejects the restart. Recovery is a
  reboot. See [the case study](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/linux-and-rtos/k11-remoteproc-restart/).
- The ten-minute, 17.8 GB soak was run on an earlier fabric version and has not been repeated on the final one.
- Everything was measured on one board.
- The code is public: [github.com/ismailalitech/pfdaq](https://github.com/ismailalitech/pfdaq). The labs run from it.
