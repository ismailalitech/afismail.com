+++
title = "pfdaq architecture explorer"
description = "Every component and connection of the pfdaq system on PolarFire SoC: select a block, a bus or an interrupt line, or play a walk step by step."
weight = 50

[params]
  topics = ["Tool"]
  toc = true
+++

An interactive map of the whole system. It has two views, one for the hardware and data paths and one for the software
and who runs where. Select a box to see what it does, what it connects to and which labs explain it. Select a line to
see what it carries. Three walks play a burst, an interrupt and the boot sequence one step at a time.

**[Open the explorer](/pfdaq/explorer/)**

## What it shows

- **Components.** The cores, the interrupt controller, the two buses between the processor subsystem and the fabric, the
  fabric blocks, the memory regions and the software, with the address, version or clock where it matters.
- **Connections.** Register buses, memory buses, the data stream, interrupts, messages and boot hand-over, each drawn
  differently so a line can be read without a legend.
- **Walks.** One burst from start to verified; one latency measurement on the supervisor core; boot from power-on to
  both systems running.

## Where the data comes from

Everything on the map comes from one file, [`architecture.yaml`](/pfdaq/architecture.yaml). The same file produces the
component descriptions in the labs, so the map and the text cannot disagree. Each fact carries the kind of evidence
behind it: simulation, tool output or measurement on the board.

## Related

- [Architecture reference](/resources/pfdaq-architecture/): register maps, frame format, DMA rules, protocols.
- [Results and evidence](/resources/pfdaq-results/): every test, its method, its result and its record.
- [The case study](/work/pfdaq-polarfire-soc/).
