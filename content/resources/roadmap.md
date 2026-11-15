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

Each stage lists what to learn and one or two public places to learn it. The
notes and labs under [Expertise](/topics/) follow the same subjects.

## 1. Microcontroller basics

Write C for a microcontroller, read a reference manual, and use a debugger:
breakpoints, memory and register views.

- [Interrupt](https://interrupt.memfault.com/): practical articles on firmware development

## 2. Know the processor

Learn the Cortex-M exception model, stack frames, privilege levels, the MPU, and
how to read a fault.

- [Arm documentation](https://developer.arm.com/documentation): the architecture reference manuals
- On this site: the [fault decoder](/resources/fault-decoder/) and the [fault register cheat sheet](/resources/cortex-m-fault-cheat-sheet/)

## 3. Real-time operating systems

Understand tasks, scheduling, context switches and synchronisation, and how an
RTOS uses the MPU to separate tasks.

- [FreeRTOS](https://www.freertos.org/): documentation and source code you can read
- [ThreadX](https://github.com/eclipse-threadx/threadx): the source code, now an Eclipse project

## 4. Secure C and C++

Learn the rules that keep embedded code predictable: integer and pointer safety,
bounds, undefined behaviour, and coding standards.

- [SEI CERT C Coding Standard](https://wiki.sei.cmu.edu/confluence/display/c): rules with examples of what goes wrong

## 5. FPGA and digital design

Learn how an FPGA is built, how to describe hardware in an HDL, and how to meet
timing.

- [Nandland](https://nandland.com/): tutorials on FPGA basics, VHDL and Verilog

## 6. Verification

Write a verification plan, build testbenches, and measure coverage. For security,
plan how each protection will be shown to work.

- [cocotb](https://docs.cocotb.org/): testbenches for HDL designs written in Python

## 7. Platform security features

Study secure boot and the chain of trust, TrustZone for Armv8-M, debug protection
and key storage.

- [Arm documentation](https://developer.arm.com/documentation): TrustZone for Armv8-M
- On this site: the [glossary](/resources/glossary/)

## 8. Attacks on hardware

Read Arm assembly and analyse firmware without its source code. Extract firmware
through debug ports and external flash, then move on to fault injection and
side-channel analysis.

- [Azeria Labs](https://azeria-labs.com/): free tutorials on Arm assembly and exploitation
- [VoidStar Security](https://voidstarsec.com/): guides to building a hardware lab and to hardware hacking
- [ChipWhisperer](https://chipwhisperer.readthedocs.io/): open tools and tutorials for fault injection and power analysis

## 9. Practice

Build small projects on real boards, take part in capture-the-flag events with
embedded targets, and write up what you learn. Test only hardware you own or are
allowed to test.
