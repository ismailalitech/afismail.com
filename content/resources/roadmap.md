+++
title = "Embedded systems and security roadmap"
description = "A suggested order for learning embedded systems and their security, from the microcontroller up to attacks on hardware."
weight = 30

[params]
  topics = ["Guide"]
  # Joins the stages with a route that lights up while reading, and shows the
  # "On this page" list. Start each stage heading with its number, as below.
  view = "roadmap"
  toc = true
+++

Each stage lists what to learn. Where this site has something on it, the stage links to it. Names in plain
text are public references on the subject, listed for identification only; they are not linked from here.
The projects and labs follow the same subjects: [Projects](/projects/) and [Labs](/topics/).

## 1. Microcontroller basics

Write C for a microcontroller, read a reference manual, and use a debugger:
breakpoints, memory and register views.

- On this site: the [Cortex-M fault decoder](/projects/microcontrollers/arm-cortex-m/cortex-m-fault-decoder/), a small project built around reading a crash
- Public reference (not linked): Interrupt, practical articles on firmware development

## 2. Know the processor

Learn the Cortex-M exception model, stack frames, privilege levels, the MPU, and
how to read a fault.

- Public reference (not linked): the Arm architecture reference manuals
- On this site: the [fault decoder](/resources/fault-decoder/) and the [fault register cheat sheet](/resources/cortex-m-fault-cheat-sheet/)

## 3. Real-time operating systems

Understand tasks, scheduling, context switches and synchronisation, and how an
RTOS uses the MPU to separate tasks.

- On this site: [FreeRTOS against bare metal on the same core](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/linux-and-rtos/m04-freertos-vs-bare-metal/), [a real-time supervisor with deadlines and independent checks](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/linux-and-rtos/m03-real-time-supervisor/) and [deferred interrupt handling in a task](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/linux-and-rtos/m07-deferred-interrupt-handling/)
- On this site: [what a Secure world costs a real-time system](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/), an RTOS project on Cortex-M
- Public references (not linked): FreeRTOS and ThreadX documentation and source code

## 4. Secure C and C++

Learn the rules that keep embedded code predictable: integer and pointer safety,
bounds, undefined behaviour, and coding standards.

- Public reference (not linked): the SEI CERT C Coding Standard, rules with examples of what goes wrong
- On this site: nothing yet on this stage

## 5. FPGA and digital design

Learn how an FPGA is built, how to describe hardware in an HDL, and how to meet
timing.

- On this site: the [FPGA design parts of the pfdaq project](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/streaming-datapaths/) (streaming data paths, [registers, clocks and timing](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/registers-clocks-timing/)) and [the tool flow in batch](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/polarfire-soc-fundamentals/f05-tool-flow-in-batch/)
- Public reference (not linked): Nandland, tutorials on FPGA basics, VHDL and Verilog

## 6. Verification

Write a verification plan, build testbenches, and measure coverage. For security,
plan how each protection will be shown to work.

- On this site: [verification with an independent model](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/verification-and-instruments/h11-independent-model/), the pfdaq project's testbenches judged by Python models, and its [results and evidence](/resources/pfdaq-results/)
- Public reference (not linked): cocotb, testbenches for HDL designs written in Python

## 7. Platform security features

Study secure boot and the chain of trust, TrustZone for Armv8-M, debug protection
and key storage.

- On this site: [what a Secure world costs a real-time system](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/) (TrustZone-M and TF-M), its [timing explorer](/resources/tfm-timing-explorer/) and [a signed boot chain you can run](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/secure-boot/s03-signed-boot-chain/)
- On this site: the [glossary](/resources/glossary/)
- Public reference (not linked): the Arm documentation on TrustZone for Armv8-M

## 8. Attacks on hardware

Read Arm assembly and analyse firmware without its source code. Extract firmware
through debug ports and external flash, then move on to fault injection and
side-channel analysis.

- On this site: nothing yet on this stage
- Public references (not linked): Azeria Labs (Arm assembly and exploitation tutorials), VoidStar Security (building a hardware lab, hardware hacking) and ChipWhisperer (fault injection and power analysis tools)

## 9. Practice

Build small projects on real boards, take part in capture-the-flag events with
embedded targets, and write up what you learn. Test only hardware you own or are
allowed to test.

Start from the [projects](/projects/): each one is built on a real board and records what it measured.
